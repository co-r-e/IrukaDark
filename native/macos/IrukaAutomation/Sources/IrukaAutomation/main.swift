import AppKit
import ApplicationServices
import Carbon.HIToolbox
import Foundation

struct BridgeOutput: Encodable {
  enum Status: String, Encodable {
    case ok
    case error
  }

  enum Source: String, Encodable {
    case accessibility
    case clipboard
  }

  let status: Status
  let text: String?
  let source: Source?
  let code: String?
  let message: String?

  func encoded() -> String {
    let encoder = JSONEncoder()
    if let data = try? encoder.encode(self), let str = String(data: data, encoding: .utf8) {
      return str
    }
    return #"{"status":"error","code":"serialization_failed"}"#
  }
}

enum FlowError: String {
  case bridgeNotTrusted = "accessibility_permission_denied"
  case copyDispatchFailed = "copy_dispatch_failed"
  case pasteboardTimeout = "pasteboard_timeout"
  case pasteboardEmpty = "pasteboard_empty"
  case timedOut = "timeout"
  case unknown = "unknown"
}

struct PasteboardSnapshot {
  let items: [[String: Data]]

  static func capture(from pasteboard: NSPasteboard) -> PasteboardSnapshot {
    let serialized: [[String: Data]] = pasteboard.pasteboardItems?.map { item in
      var entry: [String: Data] = [:]
      for type in item.types {
        if let data = item.data(forType: type) {
          entry[type.rawValue] = data
        }
      }
      return entry
    } ?? []
    return PasteboardSnapshot(items: serialized)
  }

  func restore(into pasteboard: NSPasteboard) {
    pasteboard.clearContents()
    guard !items.isEmpty else { return }
    for serializedItem in items {
      let newItem = NSPasteboardItem()
      for (rawType, data) in serializedItem {
        let type = NSPasteboard.PasteboardType(rawType)
        newItem.setData(data, forType: type)
      }
      pasteboard.writeObjects([newItem])
    }
  }
}

final class SelectedTextStateMachine {
  enum State {
    case start
    case attemptAX
    case prepareClipboardFallback
    case waitChange(Int)
    case readClipboard
    case restoreSnapshot
    case finish
  }

  private let timeout: TimeInterval
  private let pasteboard: NSPasteboard
  private let deadline: Date

  private(set) var result: BridgeOutput?
  private var state: State = .start
  private var snapshot: PasteboardSnapshot?
  private var copySent = false
  private var axChecked = false
  private let runLoop = RunLoop.current

  init(timeout: TimeInterval, pasteboard: NSPasteboard = .general) {
    self.timeout = timeout
    self.pasteboard = pasteboard
    self.deadline = Date().addingTimeInterval(timeout)
  }

  func run() -> BridgeOutput {
    while true {
      if case .finish = state {
        break
      }

      if Date() > deadline {
        if case .restoreSnapshot = state {
          // Allow the restore step to proceed so the clipboard is reverted.
        } else if snapshot != nil {
          result = BridgeOutput(
            status: .error,
            text: nil,
            source: nil,
            code: FlowError.timedOut.rawValue,
            message: "Operation exceeded \(timeout)s deadline."
          )
          state = .restoreSnapshot
          continue
        } else {
          result = BridgeOutput(
            status: .error,
            text: nil,
            source: nil,
            code: FlowError.timedOut.rawValue,
            message: "Operation exceeded \(timeout)s deadline."
          )
          state = .finish
          continue
        }
      }

      switch state {
      case .start:
        state = .attemptAX

      case .attemptAX:
        axChecked = true
        if let text = SelectedTextStateMachine.fetchAXSelectedText() {
          result = BridgeOutput(
            status: .ok,
            text: text,
            source: .accessibility,
            code: nil,
            message: nil
          )
          state = .finish
        } else {
          snapshot = PasteboardSnapshot.capture(from: pasteboard)
          state = .prepareClipboardFallback
        }

      case .prepareClipboardFallback:
        let baseline = pasteboard.changeCount
        state = .waitChange(baseline)

      case .waitChange(let baseline):
        if !copySent {
          copySent = SelectedTextStateMachine.sendCommandKeyDown(for: CGKeyCode(kVK_ANSI_C))
          if !copySent {
            result = BridgeOutput(
              status: .error,
              text: nil,
              source: nil,
              code: FlowError.copyDispatchFailed.rawValue,
              message: "Failed to dispatch ⌘C event."
            )
            state = .restoreSnapshot
            continue
          }
        }

        if pasteboard.changeCount != baseline {
          state = .readClipboard
          continue
        }

        runLoop.run(mode: .default, before: Date().addingTimeInterval(0.02))

      case .readClipboard:
        let text = pasteboard.string(forType: .string)
          .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) } ?? ""
        if !text.isEmpty {
          result = BridgeOutput(
            status: .ok,
            text: text,
            source: .clipboard,
            code: nil,
            message: nil
          )
        } else {
          result = BridgeOutput(
            status: .error,
            text: nil,
            source: nil,
            code: FlowError.pasteboardEmpty.rawValue,
            message: "Clipboard string result was empty."
          )
        }
        state = .restoreSnapshot

      case .restoreSnapshot:
        if let snapshot {
          snapshot.restore(into: pasteboard)
        }
        state = .finish

      case .finish:
        break
      }
    }

    return result ?? BridgeOutput(
      status: .error,
      text: nil,
      source: nil,
      code: FlowError.unknown.rawValue,
      message: axChecked ? "Flow ended without producing result." : "Flow aborted prematurely."
    )
  }

  private static func fetchAXSelectedText() -> String? {
    guard ensureAccessibility(prompt: false) else { return nil }

    let systemWide = AXUIElementCreateSystemWide()

    func copyAttribute(_ attribute: CFString, from element: AXUIElement) -> String? {
      var value: AnyObject?
      let status = AXUIElementCopyAttributeValue(element, attribute, &value)
      guard status == .success else { return nil }
      if let text = value as? String, !text.isEmpty {
        return text.trimmingCharacters(in: .whitespacesAndNewlines)
      }
      return nil
    }

    var focused: AnyObject?
    let focusedStatus = AXUIElementCopyAttributeValue(
      systemWide,
      kAXFocusedUIElementAttribute as CFString,
      &focused
    )

    guard focusedStatus == .success, let element = focused,
          CFGetTypeID(element) == AXUIElementGetTypeID()
    else {
      return nil
    }

    let axElement = element as! AXUIElement

    if let selected = copyAttribute(kAXSelectedTextAttribute as CFString, from: axElement),
       !selected.isEmpty
    {
      return selected
    }

    if let value = copyAttribute(kAXValueAttribute as CFString, from: axElement),
       !value.isEmpty
    {
      return value
    }

    return nil
  }

  private static func sendCommandKeyDown(for virtualKey: CGKeyCode) -> Bool {
    guard ensureAccessibility(prompt: false) else { return false }
    guard let source = CGEventSource(stateID: .hidSystemState) else {
      return false
    }

    guard let keyDown = CGEvent(
      keyboardEventSource: source,
      virtualKey: virtualKey,
      keyDown: true
    ),
      let keyUp = CGEvent(
        keyboardEventSource: source,
        virtualKey: virtualKey,
        keyDown: false
      )
    else {
      return false
    }

    keyDown.flags = [.maskCommand]
    keyDown.post(tap: .cghidEventTap)
    keyUp.flags = [.maskCommand]
    keyUp.post(tap: .cghidEventTap)

    return true
  }

  static func ensureAccessibility(prompt: Bool) -> Bool {
    if AXIsProcessTrusted() {
      return true
    }

    guard prompt else {
      return false
    }

    let key = kAXTrustedCheckOptionPrompt.takeUnretainedValue() as String
    let options: CFDictionary = [key: true] as CFDictionary
    return AXIsProcessTrustedWithOptions(options)
  }
}

enum Command: String {
  case selectedText = "selected-text"
  case help = "help"
  case version = "version"
}

@main
struct IrukaAutomationCLI {
  static func main() {
    let args = CommandLine.arguments
    guard args.count >= 2 else {
      printUsageAndExit(code: FlowError.unknown.rawValue, message: "Missing command.")
      return
    }

    let command = Command(rawValue: args[1]) ?? .help

    switch command {
    case .selectedText:
      runSelectedText(arguments: Array(args.dropFirst(2)))
    case .help:
      printUsageAndExit(code: nil, message: nil, exitCode: EXIT_SUCCESS)
    case .version:
      let output = BridgeOutput(
        status: .ok,
        text: "1.0.0",
        source: nil,
        code: nil,
        message: nil
      )
      print(output.encoded())
      exit(EXIT_SUCCESS)
    }
  }

  private static func runSelectedText(arguments: [String]) {
    let timeout = parseTimeout(from: arguments) ?? 1.5

    let shouldPrompt = arguments.contains("--prompt-accessibility")
    guard SelectedTextStateMachine.ensureAccessibility(prompt: shouldPrompt) else {
      let output = BridgeOutput(
        status: .error,
        text: nil,
        source: nil,
        code: FlowError.bridgeNotTrusted.rawValue,
        message: "Accessibility permission is required. Enable it in System Settings ▸ Privacy & Security ▸ Accessibility."
      )
      print(output.encoded())
      exit(EXIT_FAILURE)
    }

    let flow = SelectedTextStateMachine(timeout: timeout)
    let result = flow.run()
    print(result.encoded())

    if result.status == .ok {
      exit(EXIT_SUCCESS)
    } else {
      exit(EXIT_FAILURE)
    }
  }

  private static func parseTimeout(from arguments: [String]) -> TimeInterval? {
    for (index, arg) in arguments.enumerated() {
      if arg.hasPrefix("--timeout-ms=") {
        let valueString = String(arg.dropFirst("--timeout-ms=".count))
        if let ms = Double(valueString), ms > 0 {
          return ms / 1000.0
        }
      } else if arg == "--timeout-ms", index + 1 < arguments.count {
        if let ms = Double(arguments[index + 1]), ms > 0 {
          return ms / 1000.0
        }
      }
    }
    return nil
  }

  private static func printUsageAndExit(code: String?, message: String?, exitCode: Int32 = EXIT_FAILURE) {
    var output = BridgeOutput(
      status: .error,
      text: nil,
      source: nil,
      code: code ?? FlowError.unknown.rawValue,
      message: message ?? "IrukaAutomation CLI usage: IrukaAutomation selected-text [--timeout-ms <ms>]"
    ).encoded()

    if output.isEmpty {
      output = #"{"status":"error","code":"unknown","message":"encoding_failure"}"#
    }

    print(output)
    exit(exitCode)
  }
}
