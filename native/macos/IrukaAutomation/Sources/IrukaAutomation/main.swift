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

// MARK: - Clipboard Popup

struct ClipboardItem: Decodable {
  let text: String?
  let imageData: String?
  let timestamp: Int64?
}

struct ClipboardPopupInput: Decodable {
  let items: [ClipboardItem]
  let position: Position
  let isDarkMode: Bool
  let opacity: Double
  let activeTab: String?

  struct Position: Decodable {
    let x: Double
    let y: Double
  }
}

struct ClipboardPopupUpdate: Decodable {
  let type: String
  let items: [ClipboardItem]
  let isDarkMode: Bool
  let opacity: Double
  let activeTab: String?
}

// Custom row view with hover effect
final class HoverableTableRowView: NSTableRowView {
  private var isHovering = false
  private var isDarkMode: Bool = false

  init(isDarkMode: Bool) {
    self.isDarkMode = isDarkMode
    super.init(frame: .zero)
    setupTrackingArea()
  }

  required init?(coder: NSCoder) {
    super.init(coder: coder)
    setupTrackingArea()
  }

  private func setupTrackingArea() {
    let trackingArea = NSTrackingArea(
      rect: bounds,
      options: [.mouseEnteredAndExited, .activeAlways, .inVisibleRect],
      owner: self,
      userInfo: nil
    )
    addTrackingArea(trackingArea)
  }

  override func updateTrackingAreas() {
    super.updateTrackingAreas()
    // Remove old tracking areas
    for area in trackingAreas {
      removeTrackingArea(area)
    }
    // Add new tracking area
    setupTrackingArea()

    // Reset hover state when tracking area updates (e.g., during scrolling)
    checkMouseLocation()
  }

  override func prepareForReuse() {
    super.prepareForReuse()
    // Reset state when row is reused
    isHovering = false
    updateBackgroundColor()
  }

  override func viewDidMoveToWindow() {
    super.viewDidMoveToWindow()
    // Reset state when view moves to a new window or is removed
    if window == nil {
      isHovering = false
      updateBackgroundColor()
    }
  }

  private func checkMouseLocation() {
    guard let window = window else {
      isHovering = false
      updateBackgroundColor()
      return
    }

    let mouseLocation = window.mouseLocationOutsideOfEventStream
    let localPoint = convert(mouseLocation, from: nil)
    let shouldHover = bounds.contains(localPoint)

    if isHovering != shouldHover {
      isHovering = shouldHover
      updateBackgroundColor()
    }
  }

  override func mouseEntered(with event: NSEvent) {
    super.mouseEntered(with: event)
    isHovering = true
    updateBackgroundColor()
  }

  override func mouseExited(with event: NSEvent) {
    super.mouseExited(with: event)
    isHovering = false
    updateBackgroundColor()
  }

  private func updateBackgroundColor() {
    if isHovering {
      // Hover state: light overlay - match main window history tab
      if isDarkMode {
        backgroundColor = NSColor(red: 1.0, green: 1.0, blue: 1.0, alpha: 0.08)  // rgba(255, 255, 255, 0.08)
      } else {
        backgroundColor = NSColor(red: 0.0, green: 0.0, blue: 0.0, alpha: 0.04)  // rgba(0, 0, 0, 0.04)
      }
    } else {
      // Default state: transparent
      backgroundColor = .clear
    }
  }

  override func drawSelection(in dirtyRect: NSRect) {
    // Override to prevent default selection highlight
  }
}

final class ClipboardPopupWindow: NSPanel {
  private var historyItems: [ClipboardItem] = []
  private var snippetItems: [ClipboardItem] = []
  private var previousApp: NSRunningApplication?
  private var tableView: NSTableView!
  private var scrollView: NSScrollView!
  private var isDarkMode: Bool = false
  private var opacity: Double = 1.0
  private var activeTab: String = "history"

  init(items: [ClipboardItem], position: NSPoint, isDarkMode: Bool = false, opacity: Double = 1.0, activeTab: String = "history") {
    self.historyItems = items
    self.snippetItems = [] // TODO: Load snippet data from persistence
    self.isDarkMode = isDarkMode
    self.opacity = opacity
    self.activeTab = activeTab

    // Capture previous app before showing window
    if let activeApp = NSWorkspace.shared.frontmostApplication,
       activeApp.bundleIdentifier != Bundle.main.bundleIdentifier {
      self.previousApp = activeApp
    }

    // Match Electron main window size: 260x280
    let windowWidth: CGFloat = 260
    let windowHeight: CGFloat = 280

    // Adjust position to keep window on screen
    var adjustedPosition = position
    if let screen = NSScreen.main {
      let screenFrame = screen.visibleFrame

      // Adjust X
      if adjustedPosition.x + windowWidth > screenFrame.maxX {
        adjustedPosition.x = screenFrame.maxX - windowWidth - 10
      }
      if adjustedPosition.x < screenFrame.minX {
        adjustedPosition.x = screenFrame.minX + 10
      }

      // Adjust Y (flip coordinate for AppKit)
      let flippedY = screenFrame.maxY - adjustedPosition.y
      if flippedY - windowHeight < screenFrame.minY {
        adjustedPosition.y = screenFrame.maxY - screenFrame.minY - windowHeight - 10
      } else {
        adjustedPosition.y = flippedY
      }
    }

    let contentRect = NSRect(
      x: adjustedPosition.x,
      y: adjustedPosition.y - windowHeight,
      width: windowWidth,
      height: windowHeight
    )

    super.init(
      contentRect: contentRect,
      styleMask: [.borderless, .nonactivatingPanel],
      backing: .buffered,
      defer: false
    )

    self.level = .popUpMenu
    self.collectionBehavior = [.canJoinAllSpaces, .stationary, .fullScreenAuxiliary]
    self.isOpaque = false
    self.backgroundColor = .clear
    self.hasShadow = true
    self.hidesOnDeactivate = false
    self.becomesKeyOnlyIfNeeded = true

    setupUI()
  }

  override var canBecomeKey: Bool { false }
  override var canBecomeMain: Bool { false }

  private func setupUI() {
    // Container view
    let containerView = NSView(frame: contentView!.bounds)
    containerView.wantsLayer = true

    // Apply theme-aware background
    if isDarkMode {
      // Dark mode: gradient background (145deg, #0b1021, #1a1446)
      let gradientLayer = CAGradientLayer()
      gradientLayer.frame = containerView.bounds
      gradientLayer.colors = [
        NSColor(red: 0x0b/255.0, green: 0x10/255.0, blue: 0x21/255.0, alpha: opacity).cgColor,
        NSColor(red: 0x1a/255.0, green: 0x14/255.0, blue: 0x46/255.0, alpha: opacity).cgColor
      ]
      gradientLayer.startPoint = CGPoint(x: 0, y: 1)
      gradientLayer.endPoint = CGPoint(x: 1, y: 0)
      gradientLayer.cornerRadius = 12
      containerView.layer?.insertSublayer(gradientLayer, at: 0)
      containerView.layer?.cornerRadius = 12
    } else {
      // Light mode: white background with opacity
      containerView.layer?.backgroundColor = NSColor.white.withAlphaComponent(opacity).cgColor
      containerView.layer?.cornerRadius = 12
    }

    contentView?.addSubview(containerView)

    // Header/Titlebar (23px height - increased by 1px)
    let headerHeight: CGFloat = 23
    let headerView = NSView(frame: NSRect(
      x: 0,
      y: containerView.bounds.height - headerHeight,
      width: containerView.bounds.width,
      height: headerHeight
    ))

    // Tab buttons container
    let tabsContainer = NSView(frame: NSRect(
      x: 0,
      y: 0,
      width: containerView.bounds.width - 30,  // Leave space for close button
      height: headerHeight
    ))

    // History tab button (matching main window style)
    let historyTabButton = NSButton(frame: NSRect(
      x: 4,
      y: 3,
      width: 50,
      height: 17
    ))
    historyTabButton.title = "History"
    historyTabButton.bezelStyle = .recessed
    historyTabButton.isBordered = false
    historyTabButton.wantsLayer = true
    historyTabButton.layer?.cornerRadius = 4
    historyTabButton.font = .systemFont(ofSize: 10, weight: .medium)
    historyTabButton.alignment = .center
    historyTabButton.target = self
    historyTabButton.action = #selector(switchToHistoryTab)

    // Apply theme-aware colors based on active state
    if activeTab == "history" {
      historyTabButton.contentTintColor = isDarkMode
        ? NSColor(red: 0xe5/255.0, green: 0xe7/255.0, blue: 0xeb/255.0, alpha: 1.0)  // #e5e7eb
        : NSColor(red: 0x0b/255.0, green: 0x12/255.0, blue: 0x20/255.0, alpha: 1.0)  // #0b1220
      historyTabButton.layer?.backgroundColor = NSColor.clear.cgColor
    } else {
      historyTabButton.contentTintColor = NSColor(red: 0x9c/255.0, green: 0xa3/255.0, blue: 0xaf/255.0, alpha: 1.0)  // #9ca3af
      historyTabButton.layer?.backgroundColor = NSColor.clear.cgColor
    }

    tabsContainer.addSubview(historyTabButton)

    // Snippet tab button
    let snippetTabButton = NSButton(frame: NSRect(
      x: 54,
      y: 3,
      width: 50,
      height: 17
    ))
    snippetTabButton.title = "Snippet"
    snippetTabButton.bezelStyle = .recessed
    snippetTabButton.isBordered = false
    snippetTabButton.wantsLayer = true
    snippetTabButton.layer?.cornerRadius = 4
    snippetTabButton.font = .systemFont(ofSize: 10, weight: .medium)
    snippetTabButton.alignment = .center
    snippetTabButton.target = self
    snippetTabButton.action = #selector(switchToSnippetTab)

    // Apply theme-aware colors based on active state
    if activeTab == "snippet" {
      snippetTabButton.contentTintColor = isDarkMode
        ? NSColor(red: 0xe5/255.0, green: 0xe7/255.0, blue: 0xeb/255.0, alpha: 1.0)  // #e5e7eb
        : NSColor(red: 0x0b/255.0, green: 0x12/255.0, blue: 0x20/255.0, alpha: 1.0)  // #0b1220
      snippetTabButton.layer?.backgroundColor = NSColor.clear.cgColor
    } else {
      snippetTabButton.contentTintColor = NSColor(red: 0x9c/255.0, green: 0xa3/255.0, blue: 0xaf/255.0, alpha: 1.0)  // #9ca3af
      snippetTabButton.layer?.backgroundColor = NSColor.clear.cgColor
    }

    tabsContainer.addSubview(snippetTabButton)
    headerView.addSubview(tabsContainer)

    // Close button in header (top-right, 11px size)
    let closeButtonSize: CGFloat = 11
    let closeButtonMargin: CGFloat = 6
    let closeButton = NSButton(frame: NSRect(
      x: containerView.bounds.width - closeButtonSize - closeButtonMargin,
      y: (headerHeight - closeButtonSize) / 2,
      width: closeButtonSize,
      height: closeButtonSize
    ))
    closeButton.bezelStyle = .recessed
    closeButton.isBordered = false
    closeButton.wantsLayer = true
    closeButton.layer?.cornerRadius = closeButtonSize / 2

    // Use system X mark icon
    if #available(macOS 11.0, *) {
      let config = NSImage.SymbolConfiguration(pointSize: 8, weight: .regular)
      closeButton.image = NSImage(systemSymbolName: "xmark", accessibilityDescription: "Close")?.withSymbolConfiguration(config)
      closeButton.imagePosition = .imageOnly
    } else {
      closeButton.title = "×"
      closeButton.font = .systemFont(ofSize: 9)
    }

    // Theme-aware color - match main window history tab
    closeButton.contentTintColor = isDarkMode
      ? NSColor(red: 0xe5/255.0, green: 0xe7/255.0, blue: 0xeb/255.0, alpha: 1.0)  // #e5e7eb
      : NSColor(red: 0x37/255.0, green: 0x41/255.0, blue: 0x51/255.0, alpha: 1.0)  // #374151

    closeButton.layer?.backgroundColor = NSColor.clear.cgColor
    closeButton.target = self
    closeButton.action = #selector(closeWindow)
    headerView.addSubview(closeButton)

    containerView.addSubview(headerView)

    // ScrollView - adjust for header
    let scrollFrame = NSRect(
      x: 0,
      y: 0,
      width: containerView.bounds.width,
      height: containerView.bounds.height - headerHeight
    )
    scrollView = NSScrollView(frame: scrollFrame)
    scrollView.autoresizingMask = [.width, .height]
    scrollView.hasVerticalScroller = false  // Hide scrollbar
    scrollView.hasHorizontalScroller = false
    scrollView.borderType = .noBorder
    scrollView.backgroundColor = .clear
    scrollView.drawsBackground = false
    scrollView.scrollerStyle = .overlay  // Use overlay style (auto-hiding)

    // TableView
    tableView = NSTableView(frame: scrollView.bounds)
    tableView.headerView = nil
    tableView.backgroundColor = .clear
    tableView.selectionHighlightStyle = .none
    tableView.intercellSpacing = NSSize(width: 0, height: 0)  // No spacing between rows
    tableView.delegate = self
    tableView.dataSource = self

    let column = NSTableColumn(identifier: NSUserInterfaceItemIdentifier("text"))
    column.width = scrollView.bounds.width - 20
    tableView.addTableColumn(column)

    scrollView.documentView = tableView
    containerView.addSubview(scrollView)

    tableView.reloadData()
  }

  @objc private func closeWindow() {
    self.close()
  }

  @objc private func switchToHistoryTab() {
    activeTab = "history"
    tableView.reloadData()
  }

  @objc private func switchToSnippetTab() {
    activeTab = "snippet"
    tableView.reloadData()
  }

  func updateHistory(items: [ClipboardItem]) {
    DispatchQueue.main.async { [weak self] in
      guard let self = self else { return }
      self.historyItems = items
      self.tableView.reloadData()
    }
  }

  private func handleItemClick(index: Int) {
    let items = activeTab == "history" ? historyItems : snippetItems
    guard index >= 0 && index < items.count else { return }
    let item = items[index]

    // Visual feedback
    if let rowView = tableView.rowView(atRow: index, makeIfNecessary: false) {
      rowView.backgroundColor = NSColor.systemGreen.withAlphaComponent(0.15)
      DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) {
        rowView.backgroundColor = .clear
      }
    }

    // Copy to clipboard and paste
    pasteItem(item: item)

    // Close window after a short delay and report the pasted item
    DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) {
      // Output the pasted text so Electron can track it
      let output = BridgeOutput(
        status: .ok,
        text: item.text ?? "",
        source: nil,
        code: "item_pasted",
        message: "Item pasted successfully"
      )
      print(output.encoded())
      self.close()
    }
  }

  private func pasteItem(item: ClipboardItem) {
    // Update clipboard
    let pasteboard = NSPasteboard.general
    pasteboard.clearContents()

    let hasText = item.text != nil && !item.text!.isEmpty
    let hasImage = item.imageData != nil && !item.imageData!.isEmpty

    // Prioritize text over image
    if hasText {
      // Write text only
      pasteboard.setString(item.text!, forType: .string)
    } else if hasImage {
      // Write image only if there's no text
      if let imageDataUrl = item.imageData, let image = imageFromDataURL(imageDataUrl) {
        pasteboard.writeObjects([image])
      }
    }

    // Ensure accessibility permission
    guard SelectedTextStateMachine.ensureAccessibility(prompt: false) else {
      return
    }

    // Activate previous app
    if let previousApp = previousApp {
      previousApp.activate(options: [.activateIgnoringOtherApps])
      usleep(150_000) // 150ms
    }

    // Send Command+V
    guard let source = CGEventSource(stateID: .hidSystemState) else { return }

    if let keyDown = CGEvent(keyboardEventSource: source, virtualKey: CGKeyCode(kVK_ANSI_V), keyDown: true),
       let keyUp = CGEvent(keyboardEventSource: source, virtualKey: CGKeyCode(kVK_ANSI_V), keyDown: false) {
      keyDown.flags = [.maskCommand]
      keyDown.post(tap: .cghidEventTap)
      usleep(10_000) // 10ms
      keyUp.flags = [.maskCommand]
      keyUp.post(tap: .cghidEventTap)
    }
  }
}

extension ClipboardPopupWindow: NSTableViewDataSource {
  func numberOfRows(in tableView: NSTableView) -> Int {
    return activeTab == "history" ? historyItems.count : snippetItems.count
  }
}

extension ClipboardPopupWindow: NSTableViewDelegate {
  func tableView(_ tableView: NSTableView, viewFor tableColumn: NSTableColumn?, row: Int) -> NSView? {
    let identifier = NSUserInterfaceItemIdentifier("ClipboardItemCell")
    let items = activeTab == "history" ? historyItems : snippetItems
    guard row >= 0 && row < items.count else { return nil }
    let item = items[row]

    // Clear any existing cell and create fresh
    let cellView = NSTableCellView()
    cellView.identifier = identifier

    // Padding: top(3px) + bottom(3px) + left(3px) + right(8px)
    let leftPadding: CGFloat = 3
    let rightPadding: CGFloat = 8
    let topPadding: CGFloat = 3
    let availableWidth = tableView.bounds.width - leftPadding - rightPadding

    // Get the row height for this row
    let rowHeight = tableView.delegate?.tableView?(tableView, heightOfRow: row) ?? 46

    // Check if we have text
    let hasText = item.text != nil && !item.text!.isEmpty
    let hasImage = item.imageData != nil && !item.imageData!.isEmpty

    // Start from the top of the cell (AppKit uses bottom-left origin)
    var yPosition = rowHeight - topPadding

    // Add text if present
    if let text = item.text, !text.isEmpty {
      let font = NSFont.systemFont(ofSize: 11)

      // Calculate actual text height
      let textRect = (text as NSString).boundingRect(
        with: NSSize(width: availableWidth, height: CGFloat.greatestFiniteMagnitude),
        options: [.usesLineFragmentOrigin, .usesFontLeading],
        attributes: [.font: font]
      )

      // Limit to 3 lines max (approximate line height: 15px for 11pt font)
      let lineHeight: CGFloat = 15
      let maxHeight = lineHeight * 3
      let textHeight = min(ceil(textRect.height), maxHeight)

      yPosition -= textHeight

      let textField = NSTextField(frame: NSRect(
        x: leftPadding,
        y: yPosition,
        width: availableWidth,
        height: textHeight
      ))
      textField.isEditable = false
      textField.isBordered = false
      textField.backgroundColor = NSColor.clear
      textField.maximumNumberOfLines = 3
      textField.lineBreakMode = NSLineBreakMode.byTruncatingTail
      textField.font = font
      textField.usesSingleLineMode = false
      textField.cell?.wraps = true
      textField.cell?.isScrollable = false
      textField.stringValue = text

      // Apply theme-aware text color - match main window history tab
      if isDarkMode {
        textField.textColor = NSColor(red: 0xe5/255.0, green: 0xe7/255.0, blue: 0xeb/255.0, alpha: 1.0)  // #e5e7eb
      } else {
        textField.textColor = NSColor(red: 0x37/255.0, green: 0x41/255.0, blue: 0x51/255.0, alpha: 1.0)  // #374151
      }

      cellView.addSubview(textField)
      cellView.textField = textField
    }

    // Add image only if there's no text (text takes priority)
    if hasImage && !hasText {
      if let imageDataUrl = item.imageData, let image = imageFromDataURL(imageDataUrl) {
        let imageHeight: CGFloat = 36
        yPosition -= imageHeight

        let imageView = NSImageView(frame: NSRect(
          x: leftPadding,
          y: yPosition,
          width: availableWidth,
          height: imageHeight
        ))
        imageView.image = image
        imageView.imageScaling = .scaleProportionallyDown
        imageView.imageAlignment = .alignLeft
        cellView.addSubview(imageView)
      }
    }

    return cellView
  }

  private func imageFromDataURL(_ dataURL: String) -> NSImage? {
    // DataURL format: "data:image/png;base64,..."
    guard let commaRange = dataURL.range(of: ","),
          let base64String = dataURL[commaRange.upperBound...].removingPercentEncoding else {
      return nil
    }

    guard let imageData = Data(base64Encoded: String(base64String)) else {
      return nil
    }

    return NSImage(data: imageData)
  }

  func tableView(_ tableView: NSTableView, shouldSelectRow row: Int) -> Bool {
    handleItemClick(index: row)
    return false
  }

  func tableView(_ tableView: NSTableView, rowViewForRow row: Int) -> NSTableRowView? {
    let rowView = HoverableTableRowView(isDarkMode: isDarkMode)
    rowView.wantsLayer = true
    return rowView
  }

  func tableView(_ tableView: NSTableView, heightOfRow row: Int) -> CGFloat {
    let items = activeTab == "history" ? historyItems : snippetItems
    guard row >= 0 && row < items.count else { return 46 }
    let item = items[row]

    let topPadding: CGFloat = 3
    let bottomPadding: CGFloat = 3
    let leftPadding: CGFloat = 3
    let rightPadding: CGFloat = 8
    let availableWidth = tableView.bounds.width - leftPadding - rightPadding

    let hasText = item.text != nil && !item.text!.isEmpty
    let hasImage = item.imageData != nil && !item.imageData!.isEmpty

    var totalHeight: CGFloat = topPadding

    // Add image height if image exists and no text
    if hasImage && !hasText {
      totalHeight += 36  // Image height
    }

    // Add text height if text exists
    if let text = item.text, !text.isEmpty {
      let font = NSFont.systemFont(ofSize: 11)
      let textRect = (text as NSString).boundingRect(
        with: NSSize(width: availableWidth, height: CGFloat.greatestFiniteMagnitude),
        options: [.usesLineFragmentOrigin, .usesFontLeading],
        attributes: [.font: font]
      )
      // Limit to 3 lines max (approximate line height: 15px for 11pt font)
      let lineHeight: CGFloat = 15
      let maxHeight = lineHeight * 3
      totalHeight += min(ceil(textRect.height), maxHeight)
    }

    totalHeight += bottomPadding

    // Minimum height
    return max(totalHeight, 22)
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
  case ensureAccessibility = "ensure-accessibility"
  case clipboardPopup = "clipboard-popup"
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
    case .ensureAccessibility:
      runEnsureAccessibility(arguments: Array(args.dropFirst(2)))
    case .clipboardPopup:
      runClipboardPopup()
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

  private static func runEnsureAccessibility(arguments: [String]) {
    let shouldPrompt = true
    if SelectedTextStateMachine.ensureAccessibility(prompt: shouldPrompt) {
      let output = BridgeOutput(
        status: .ok,
        text: nil,
        source: nil,
        code: nil,
        message: "accessibility_trusted"
      )
      print(output.encoded())
      exit(EXIT_SUCCESS)
    } else {
      let output = BridgeOutput(
        status: .error,
        text: nil,
        source: nil,
        code: FlowError.bridgeNotTrusted.rawValue,
        message: "Accessibility permission is required."
      )
      print(output.encoded())
      exit(EXIT_FAILURE)
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

  private static func runClipboardPopup() {
    // Read first line from stdin for initial data
    guard let firstLine = readLine() else {
      let output = BridgeOutput(
        status: .error,
        text: nil,
        source: nil,
        code: "invalid_input",
        message: "No input data received from stdin"
      )
      print(output.encoded())
      exit(EXIT_FAILURE)
    }

    guard let inputData = firstLine.data(using: .utf8) else {
      let output = BridgeOutput(
        status: .error,
        text: nil,
        source: nil,
        code: "invalid_input",
        message: "Failed to convert input to UTF-8"
      )
      print(output.encoded())
      exit(EXIT_FAILURE)
    }

    let decoder = JSONDecoder()
    guard let input = try? decoder.decode(ClipboardPopupInput.self, from: inputData) else {
      let output = BridgeOutput(
        status: .error,
        text: nil,
        source: nil,
        code: "invalid_json",
        message: "Failed to decode input JSON"
      )
      print(output.encoded())
      exit(EXIT_FAILURE)
    }

    guard !input.items.isEmpty else {
      let output = BridgeOutput(
        status: .error,
        text: nil,
        source: nil,
        code: "no_items",
        message: "No clipboard items provided"
      )
      print(output.encoded())
      exit(EXIT_FAILURE)
    }

    // Create and show popup window
    let position = NSPoint(x: input.position.x, y: input.position.y)
    let window = ClipboardPopupWindow(
      items: input.items,
      position: position,
      isDarkMode: input.isDarkMode,
      opacity: input.opacity,
      activeTab: input.activeTab ?? "history"
    )

    window.makeKeyAndOrderFront(nil)

    // Run event loop to keep window alive
    let app = NSApplication.shared
    app.setActivationPolicy(.accessory)

    // Set up window close handler
    NotificationCenter.default.addObserver(
      forName: NSWindow.willCloseNotification,
      object: window,
      queue: .main
    ) { _ in
      let output = BridgeOutput(
        status: .ok,
        text: nil,
        source: nil,
        code: nil,
        message: "Popup closed"
      )
      print(output.encoded())
      exit(EXIT_SUCCESS)
    }

    // Start background thread to listen for updates from stdin
    DispatchQueue.global(qos: .userInitiated).async {
      let decoder = JSONDecoder()
      while let line = readLine() {
        guard let lineData = line.data(using: .utf8) else { continue }

        // Try to decode as update
        if let update = try? decoder.decode(ClipboardPopupUpdate.self, from: lineData),
           update.type == "update" {
          window.updateHistory(items: update.items)
        }
      }
    }

    app.run()
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
