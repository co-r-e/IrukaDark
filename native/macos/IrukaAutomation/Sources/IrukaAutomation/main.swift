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
  let imageDataOriginal: String?  // For tracking pasted images

  init(status: Status, text: String?, source: Source?, code: String?, message: String?, imageDataOriginal: String? = nil) {
    self.status = status
    self.text = text
    self.source = source
    self.code = code
    self.message = message
    self.imageDataOriginal = imageDataOriginal
  }

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

// MARK: - LRU Cache

/// High-performance LRU Cache with O(1) operations
final class LRUCache<Key: Hashable, Value> {
  private class Node {
    let key: Key
    var value: Value
    var prev: Node?
    var next: Node?

    init(key: Key, value: Value) {
      self.key = key
      self.value = value
    }
  }

  private let capacity: Int
  private var cache: [Key: Node] = [:]
  private var head: Node?
  private var tail: Node?

  init(capacity: Int) {
    self.capacity = capacity
  }

  func get(_ key: Key) -> Value? {
    guard let node = cache[key] else { return nil }
    moveToHead(node)
    return node.value
  }

  func set(_ key: Key, value: Value) {
    if let node = cache[key] {
      node.value = value
      moveToHead(node)
    } else {
      let newNode = Node(key: key, value: value)
      cache[key] = newNode
      addToHead(newNode)

      if cache.count > capacity {
        removeTail()
      }
    }
  }

  func clear() {
    cache.removeAll()
    head = nil
    tail = nil
  }

  private func moveToHead(_ node: Node) {
    removeNode(node)
    addToHead(node)
  }

  private func removeNode(_ node: Node) {
    if node === head { head = node.next }
    if node === tail { tail = node.prev }
    node.prev?.next = node.next
    node.next?.prev = node.prev
  }

  private func addToHead(_ node: Node) {
    node.next = head
    node.prev = nil
    head?.prev = node
    head = node
    if tail == nil { tail = node }
  }

  private func removeTail() {
    guard let tailNode = tail else { return }
    cache.removeValue(forKey: tailNode.key)
    removeNode(tailNode)
  }
}

// MARK: - Cursor Position Detection

/// カーソル位置をAppKit座標系で取得
struct CursorPositionDetector {
  /// 現在のカーソル位置を取得（AppKit座標系）
  static func getCurrentCursorPosition() -> NSPoint {
    // NSEvent.mouseLocation は現在のグローバルカーソル位置を返す（AppKit座標系：左下原点）
    return NSEvent.mouseLocation
  }

  /// カーソル位置を含むスクリーンを検出
  static func getScreenAtCursor() -> NSScreen? {
    let cursorPosition = getCurrentCursorPosition()

    // カーソル位置を含むスクリーンを検出
    for screen in NSScreen.screens {
      if screen.frame.contains(cursorPosition) {
        return screen
      }
    }

    // フォールバック: メインスクリーン
    return NSScreen.main
  }
}

// MARK: - Window Position Management

/// ウィンドウ配置設定
struct WindowPlacementConfiguration {
  let windowSize: NSSize
  let screenEdgeMargin: CGFloat
  let cursorOffset: NSPoint

  static let `default` = WindowPlacementConfiguration(
    windowSize: NSSize(width: 220, height: 280),
    screenEdgeMargin: 16,
    cursorOffset: NSPoint(x: 1, y: -1)  // カーソルの右下1pxに配置
  )
}

/// ウィンドウ位置計算マネージャー
final class WindowPositionManager {
  private let configuration: WindowPlacementConfiguration

  init(configuration: WindowPlacementConfiguration = .default) {
    self.configuration = configuration
  }

  /// カーソル位置を基準にウィンドウの最適位置を計算
  func calculateOptimalPosition() -> NSRect {
    // 1. カーソル位置を取得（AppKit座標系）
    let cursorPosition = CursorPositionDetector.getCurrentCursorPosition()

    // 2. カーソル位置を含むスクリーンを検出
    guard let screen = CursorPositionDetector.getScreenAtCursor() else {
      return fallbackPosition()
    }

    // 3. ウィンドウ位置を計算（カーソルからオフセット）
    var windowOrigin = NSPoint(
      x: cursorPosition.x + configuration.cursorOffset.x,
      y: cursorPosition.y + configuration.cursorOffset.y - configuration.windowSize.height
    )

    // 4. スクリーン境界内に調整
    let visibleFrame = screen.visibleFrame
    let margin = configuration.screenEdgeMargin

    // X軸調整（右端）
    if windowOrigin.x + configuration.windowSize.width > visibleFrame.maxX - margin {
      windowOrigin.x = visibleFrame.maxX - configuration.windowSize.width - margin
    }
    // X軸調整（左端）
    if windowOrigin.x < visibleFrame.minX + margin {
      windowOrigin.x = visibleFrame.minX + margin
    }

    // Y軸調整（上端）
    if windowOrigin.y + configuration.windowSize.height > visibleFrame.maxY - margin {
      windowOrigin.y = visibleFrame.maxY - configuration.windowSize.height - margin
    }
    // Y軸調整（下端）
    if windowOrigin.y < visibleFrame.minY + margin {
      windowOrigin.y = visibleFrame.minY + margin
    }

    return NSRect(origin: windowOrigin, size: configuration.windowSize)
  }

  /// フォールバック位置（スクリーン検出失敗時）
  private func fallbackPosition() -> NSRect {
    guard let mainScreen = NSScreen.main else {
      // 最悪のフォールバック
      return NSRect(origin: .zero, size: configuration.windowSize)
    }

    let visibleFrame = mainScreen.visibleFrame
    let centerX = visibleFrame.midX - configuration.windowSize.width / 2
    let centerY = visibleFrame.midY - configuration.windowSize.height / 2

    return NSRect(
      x: centerX,
      y: centerY,
      width: configuration.windowSize.width,
      height: configuration.windowSize.height
    )
  }
}

// MARK: - Tooltip Support

/// Protocol for providing tooltip content from row data
protocol TooltipDataSource: AnyObject {
  func tooltipText(forRow row: Int, inView view: NSView) -> String?
  func tooltipImage(forRow row: Int, inView view: NSView) -> NSImage?
  func getTooltipDarkMode() -> Bool
}

/// Floating tooltip window that displays item content
final class TooltipWindow: NSPanel {
  private let contentLabel = NSTextField(wrappingLabelWithString: "")
  private let contentImageView = NSImageView()
  private let minWidth: CGFloat = 120
  private let maxWidth: CGFloat = 320
  private let maxImageWidth: CGFloat = 240
  private let maxImageHeight: CGFloat = 180
  private let maxLines: Int = 10

  init() {
    super.init(
      contentRect: NSRect(x: 0, y: 0, width: 100, height: 100),
      styleMask: [.borderless, .nonactivatingPanel],
      backing: .buffered,
      defer: false
    )

    self.level = .screenSaver + 1  // Above the main popup window
    self.collectionBehavior = [.canJoinAllSpaces, .stationary, .fullScreenAuxiliary]
    self.isOpaque = false
    self.backgroundColor = .clear
    self.hasShadow = true
    self.ignoresMouseEvents = true  // Click-through

    setupUI()
  }

  override var canBecomeKey: Bool { false }
  override var canBecomeMain: Bool { false }

  private func setupUI() {
    let containerView = NSView()
    containerView.wantsLayer = true
    containerView.layer?.cornerRadius = 8

    contentLabel.isEditable = false
    contentLabel.isBordered = false
    contentLabel.isBezeled = false
    contentLabel.drawsBackground = false
    contentLabel.backgroundColor = .clear
    contentLabel.maximumNumberOfLines = maxLines
    contentLabel.lineBreakMode = .byWordWrapping
    contentLabel.font = .systemFont(ofSize: 11)
    contentLabel.usesSingleLineMode = false
    contentLabel.cell?.wraps = true
    contentLabel.cell?.isScrollable = false
    contentLabel.cell?.truncatesLastVisibleLine = false

    // Remove internal padding/insets
    if let cell = contentLabel.cell as? NSTextFieldCell {
      cell.usesSingleLineMode = false
      cell.wraps = true
    }

    // Image view setup
    contentImageView.imageScaling = .scaleProportionallyUpOrDown
    contentImageView.imageAlignment = .alignCenter
    contentImageView.isHidden = true

    containerView.addSubview(contentLabel)
    containerView.addSubview(contentImageView)
    contentView = containerView
  }

  func show(with text: String, at position: NSPoint, isDarkMode: Bool) {
    // Hide image view, show text
    contentImageView.isHidden = true
    contentLabel.isHidden = false

    // Format text to max 10 lines
    let lines = text.components(separatedBy: .newlines)
    let displayLines = Array(lines.prefix(maxLines))
    let displayText = displayLines.joined(separator: "\n")
    let truncated = lines.count > maxLines

    contentLabel.stringValue = truncated ? displayText + "\n..." : displayText

    // Apply theme colors
    if isDarkMode {
      contentLabel.textColor = NSColor(red: 0xe5/255.0, green: 0xe7/255.0, blue: 0xeb/255.0, alpha: 1.0)
      contentView?.layer?.backgroundColor = NSColor(red: 0x1a/255.0, green: 0x1a/255.0, blue: 0x2e/255.0, alpha: 0.95).cgColor
    } else {
      contentLabel.textColor = NSColor(red: 0x37/255.0, green: 0x41/255.0, blue: 0x51/255.0, alpha: 1.0)
      contentView?.layer?.backgroundColor = NSColor.white.withAlphaComponent(0.95).cgColor
    }

    // Calculate size more accurately
    let padding: CGFloat = 12
    let font = NSFont.systemFont(ofSize: 11)

    // Set up paragraph style to match NSTextField rendering exactly
    let paragraphStyle = NSMutableParagraphStyle()
    paragraphStyle.lineBreakMode = .byWordWrapping
    paragraphStyle.alignment = .left
    paragraphStyle.lineSpacing = 0  // No extra line spacing
    paragraphStyle.paragraphSpacing = 0  // No paragraph spacing
    paragraphStyle.lineHeightMultiple = 1.0  // Default line height

    let attributes: [NSAttributedString.Key: Any] = [
      .font: font,
      .paragraphStyle: paragraphStyle
    ]

    // First, calculate the text width
    let textRect = (contentLabel.stringValue as NSString).boundingRect(
      with: NSSize(width: maxWidth - padding * 2, height: CGFloat.greatestFiniteMagnitude),
      options: [.usesLineFragmentOrigin],
      attributes: attributes
    )

    // Determine actual width (content width + padding, with min/max constraints)
    let contentWidth = ceil(textRect.width)
    let width = max(minWidth, min(contentWidth + padding * 2, maxWidth))

    // Recalculate height with the actual width to ensure accurate wrapping
    let finalTextRect = (contentLabel.stringValue as NSString).boundingRect(
      with: NSSize(width: width - padding * 2, height: CGFloat.greatestFiniteMagnitude),
      options: [.usesLineFragmentOrigin],
      attributes: attributes
    )

    let contentHeight = ceil(finalTextRect.height)
    let height = contentHeight + padding * 2

    // Apply the same attributes to contentLabel to ensure consistent rendering
    contentLabel.attributedStringValue = NSAttributedString(string: contentLabel.stringValue, attributes: attributes)

    // Calculate optimal tooltip position with screen boundary checks
    let tooltipSize = NSSize(width: width, height: height)
    let tooltipFrame = calculateTooltipPosition(
      anchorPoint: position,
      tooltipSize: tooltipSize
    )

    setFrame(tooltipFrame, display: true)
    contentLabel.frame = NSRect(x: padding, y: padding, width: width - padding * 2, height: contentHeight)

    orderFrontRegardless()
  }

  func showImage(_ image: NSImage, at position: NSPoint, isDarkMode: Bool) {
    // Hide text label, show image
    contentLabel.isHidden = true
    contentImageView.isHidden = false

    contentImageView.image = image

    // Apply theme colors
    if isDarkMode {
      contentView?.layer?.backgroundColor = NSColor(red: 0x1a/255.0, green: 0x1a/255.0, blue: 0x2e/255.0, alpha: 0.95).cgColor
    } else {
      contentView?.layer?.backgroundColor = NSColor.white.withAlphaComponent(0.95).cgColor
    }

    // Calculate display size preserving aspect ratio
    let padding: CGFloat = 8
    let imageSize = image.size

    var displayWidth = imageSize.width
    var displayHeight = imageSize.height

    // Scale down if larger than max dimensions
    if displayWidth > maxImageWidth {
      let scale = maxImageWidth / displayWidth
      displayWidth = maxImageWidth
      displayHeight = displayHeight * scale
    }
    if displayHeight > maxImageHeight {
      let scale = maxImageHeight / displayHeight
      displayHeight = displayHeight * scale
      displayWidth = displayWidth * scale
    }

    let width = displayWidth + padding * 2
    let height = displayHeight + padding * 2

    // Calculate optimal tooltip position with screen boundary checks
    let tooltipSize = NSSize(width: width, height: height)
    let tooltipFrame = calculateTooltipPosition(
      anchorPoint: position,
      tooltipSize: tooltipSize
    )

    setFrame(tooltipFrame, display: true)
    contentImageView.frame = NSRect(x: padding, y: padding, width: displayWidth, height: displayHeight)

    orderFrontRegardless()
  }

  /// Calculate optimal tooltip position with screen boundary checks
  private func calculateTooltipPosition(anchorPoint: NSPoint, tooltipSize: NSSize) -> NSRect {
    let screenMargin: CGFloat = 10
    let offsetFromAnchor: CGFloat = 10

    // Find screen containing the anchor point
    let targetScreen = NSScreen.screens.first(where: { $0.frame.contains(anchorPoint) }) ?? NSScreen.main
    guard let screen = targetScreen else {
      return NSRect(origin: anchorPoint, size: tooltipSize)
    }

    let visibleFrame = screen.visibleFrame
    var tooltipX = anchorPoint.x
    var tooltipY = anchorPoint.y - tooltipSize.height

    // Horizontal positioning: prefer right, fallback to left
    if tooltipX + tooltipSize.width > visibleFrame.maxX - screenMargin {
      // Try left side
      tooltipX = anchorPoint.x - tooltipSize.width - offsetFromAnchor

      // Clamp to left edge if still out of bounds
      if tooltipX < visibleFrame.minX + screenMargin {
        tooltipX = visibleFrame.minX + screenMargin
      }
    }

    // Clamp to left edge
    tooltipX = max(tooltipX, visibleFrame.minX + screenMargin)

    // Vertical positioning: prefer below, fallback to above
    if tooltipY < visibleFrame.minY + screenMargin {
      // Try above
      tooltipY = anchorPoint.y + offsetFromAnchor

      // Clamp to top edge if still out of bounds
      if tooltipY + tooltipSize.height > visibleFrame.maxY - screenMargin {
        tooltipY = visibleFrame.maxY - tooltipSize.height - screenMargin
      }
    }

    // Clamp to top edge
    if tooltipY + tooltipSize.height > visibleFrame.maxY - screenMargin {
      tooltipY = visibleFrame.maxY - tooltipSize.height - screenMargin
    }

    return NSRect(x: tooltipX, y: tooltipY, width: tooltipSize.width, height: tooltipSize.height)
  }

  func hide() {
    orderOut(nil)
  }
}

/// Manager for tooltip display with delay
final class TooltipManager {
  static let shared = TooltipManager()

  private var tooltipWindow: TooltipWindow?
  private var showTimer: Timer?
  private let showDelay: TimeInterval = 0.3

  private init() {}

  func scheduleShow(text: String, at position: NSPoint, isDarkMode: Bool) {
    // Cancel any pending show
    cancelShow()

    showTimer = Timer.scheduledTimer(withTimeInterval: showDelay, repeats: false) { [weak self] _ in
      self?.showTooltip(text: text, at: position, isDarkMode: isDarkMode)
    }
  }

  func scheduleShowImage(_ image: NSImage, at position: NSPoint, isDarkMode: Bool) {
    // Cancel any pending show
    cancelShow()

    showTimer = Timer.scheduledTimer(withTimeInterval: showDelay, repeats: false) { [weak self] _ in
      self?.showImageTooltip(image: image, at: position, isDarkMode: isDarkMode)
    }
  }

  func cancelShow() {
    showTimer?.invalidate()
    showTimer = nil
  }

  func hideTooltip() {
    cancelShow()
    tooltipWindow?.hide()
  }

  private func showTooltip(text: String, at position: NSPoint, isDarkMode: Bool) {
    if tooltipWindow == nil {
      tooltipWindow = TooltipWindow()
    }
    tooltipWindow?.show(with: text, at: position, isDarkMode: isDarkMode)
  }

  private func showImageTooltip(image: NSImage, at position: NSPoint, isDarkMode: Bool) {
    if tooltipWindow == nil {
      tooltipWindow = TooltipWindow()
    }
    tooltipWindow?.showImage(image, at: position, isDarkMode: isDarkMode)
  }
}

// MARK: - Clipboard Popup

/// Clipboard item containing text and/or image data
struct ClipboardItem: Decodable {
  let text: String?
  let imageData: String?
  let imageDataOriginal: String?
  let timestamp: Int64?
  let richText: RichTextData?
}

/// Rich text formatting data for clipboard items
/// - Note: RTF data is stored as base64-encoded string for JSON compatibility
struct RichTextData: Decodable {
  let rtf: String?      // Base64-encoded RTF data
  let html: String?     // HTML string
  let markdown: String? // Markdown string (future support)
}

// MARK: - Snippet Data Structures

struct SnippetDataStructure: Decodable {
  let folders: [SnippetFolder]
  let snippets: [SnippetItem]
  let nextFolderId: Int
  let nextSnippetId: Int
}

struct SnippetFolder: Decodable {
  let id: String
  let name: String
  let parentId: String?
  let count: Int?
  var expanded: Bool?
  let editable: Bool?
  let editing: Bool?
}

struct SnippetItem: Decodable {
  let id: String
  let name: String
  let content: String?
  let type: String?  // "text" or "image"
  let imagePath: String?
  let thumbnailData: String?
  let folderId: String?
  let editing: Bool?
}

// Tree node for NSOutlineView
final class SnippetTreeNode {
  enum NodeType {
    case folder(id: String, name: String)
    case snippet(id: String, name: String, contentRef: String, imagePath: String?)
  }

  let type: NodeType
  var children: [SnippetTreeNode] = []
  weak var parent: SnippetTreeNode?

  init(type: NodeType) {
    self.type = type
  }

  var id: String {
    switch type {
    case .folder(let id, _), .snippet(let id, _, _, _):
      return id
    }
  }
}

struct ClipboardPopupInput: Decodable {
  let items: [ClipboardItem]
  let position: Position?  // Optional for backward compatibility (now using cursor detection)
  let isDarkMode: Bool
  let opacity: Double
  let activeTab: String?
  let snippetDataPath: String?

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
  weak var tooltipDataSource: TooltipDataSource?

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
    hideTooltip()
    checkMouseLocation()
  }

  override func prepareForReuse() {
    super.prepareForReuse()
    // Reset state when row is reused
    isHovering = false
    updateBackgroundColor()
    hideTooltip()
  }

  override func viewDidMoveToWindow() {
    super.viewDidMoveToWindow()
    // Reset state when view moves to a new window or is removed
    if window == nil {
      isHovering = false
      updateBackgroundColor()
      hideTooltip()
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
    showTooltip()
  }

  override func mouseExited(with event: NSEvent) {
    super.mouseExited(with: event)
    isHovering = false
    updateBackgroundColor()
    hideTooltip()
  }

  private func showTooltip() {
    // Get row index - support both NSTableView and NSOutlineView
    var row: Int = -1
    var targetView: NSView?

    if let tableView = superview as? NSTableView {
      row = tableView.row(for: self)
      targetView = tableView
    } else if let outlineView = superview as? NSOutlineView {
      row = outlineView.row(for: self)
      targetView = outlineView
    }

    guard row >= 0, let view = targetView else { return }

    // Calculate tooltip position (right side of the row)
    guard let window = window else { return }
    let rowFrameInWindow = convert(bounds, to: nil)
    let rowFrameOnScreen = window.convertToScreen(rowFrameInWindow)

    // Position tooltip to the right of the row with 10px offset
    let tooltipX = rowFrameOnScreen.maxX + 10
    let tooltipY = rowFrameOnScreen.maxY  // Top of the row

    let tooltipPosition = NSPoint(x: tooltipX, y: tooltipY)
    let isDark = tooltipDataSource?.getTooltipDarkMode() ?? false

    // Check for image tooltip first
    if let image = tooltipDataSource?.tooltipImage(forRow: row, inView: view) {
      TooltipManager.shared.scheduleShowImage(image, at: tooltipPosition, isDarkMode: isDark)
      return
    }

    // Fall back to text tooltip
    guard let text = tooltipDataSource?.tooltipText(forRow: row, inView: view),
          !text.isEmpty else { return }

    // Schedule tooltip display
    TooltipManager.shared.scheduleShow(text: text, at: tooltipPosition, isDarkMode: isDark)
  }

  private func hideTooltip() {
    TooltipManager.shared.hideTooltip()
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

// MARK: - Text Formatting Helpers

extension String {
  /// プレビュー表示用にテキストを整形（空行・余分な空白を削除）
  func compactForPreview() -> String {
    // 1. 各行をトリム
    let lines = self.components(separatedBy: .newlines)

    // 2. 空行を除去し、各行の連続する空白を1つに
    let compactedLines = lines
      .map { line in
        // 連続する空白を1つのスペースに
        line.replacingOccurrences(
          of: "\\s+",
          with: " ",
          options: .regularExpression
        ).trimmingCharacters(in: .whitespaces)
      }
      .filter { !$0.isEmpty }  // 空行を除去

    // 3. 結合
    return compactedLines.joined(separator: " ")
  }
}

// MARK: - Hoverable Tab Button

/// Custom tab button with hover-to-switch functionality
final class HoverableTabButton: NSButton {
  private var hoverTimer: Timer?
  private var isHovering = false
  var onHover: (() -> Void)?

  override init(frame frameRect: NSRect) {
    super.init(frame: frameRect)
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
  }

  override func mouseEntered(with event: NSEvent) {
    super.mouseEntered(with: event)
    isHovering = true

    // Cancel any existing timer
    hoverTimer?.invalidate()

    // Start a new timer for 0.3 seconds
    hoverTimer = Timer.scheduledTimer(withTimeInterval: 0.3, repeats: false) { [weak self] _ in
      guard let self = self, self.isHovering else { return }
      self.onHover?()
    }
  }

  override func mouseExited(with event: NSEvent) {
    super.mouseExited(with: event)
    isHovering = false

    // Cancel the timer if mouse leaves
    hoverTimer?.invalidate()
    hoverTimer = nil
  }

  deinit {
    hoverTimer?.invalidate()
  }
}

// MARK: - Custom Cell Views

/// High-performance custom cell view for clipboard items with full view reuse
final class ClipboardItemCell: NSTableCellView {
  private let contentTextLabel = NSTextField(labelWithString: "")
  private let contentImageView = NSImageView()
  private var isConfigured = false

  override init(frame frameRect: NSRect) {
    super.init(frame: frameRect)
    setupSubviews()
  }

  required init?(coder: NSCoder) {
    super.init(coder: coder)
    setupSubviews()
  }

  private func setupSubviews() {
    guard !isConfigured else { return }

    // Text label - configure once
    contentTextLabel.isEditable = false
    contentTextLabel.isBordered = false
    contentTextLabel.backgroundColor = .clear
    contentTextLabel.maximumNumberOfLines = 1
    contentTextLabel.lineBreakMode = .byTruncatingTail
    contentTextLabel.font = .systemFont(ofSize: 11)
    contentTextLabel.usesSingleLineMode = false
    contentTextLabel.cell?.wraps = false
    contentTextLabel.cell?.isScrollable = false
    addSubview(contentTextLabel)

    // Image view - configure once
    contentImageView.imageScaling = .scaleProportionallyDown
    contentImageView.imageAlignment = .alignLeft
    contentImageView.isHidden = true
    addSubview(contentImageView)

    isConfigured = true
  }

  func configure(text: String?, image: NSImage?, rowHeight: CGFloat, availableWidth: CGFloat, isDarkMode: Bool) {
    let leftPadding: CGFloat = 3
    let topPadding: CGFloat = 3

    if let text = text, !text.isEmpty {
      // Text mode - プレビュー用に整形（空行・空白を詰める）
      let previewText = text.compactForPreview()
      contentTextLabel.stringValue = previewText
      contentTextLabel.textColor = isDarkMode
        ? NSColor(red: 0xe5/255.0, green: 0xe7/255.0, blue: 0xeb/255.0, alpha: 1.0)
        : NSColor(red: 0x37/255.0, green: 0x41/255.0, blue: 0x51/255.0, alpha: 1.0)

      let textHeight = rowHeight - topPadding * 2
      contentTextLabel.frame = NSRect(x: leftPadding, y: topPadding, width: availableWidth, height: textHeight)
      contentTextLabel.isHidden = false
      contentImageView.isHidden = true
    } else if let image = image {
      // Image mode
      contentImageView.image = image
      let imageHeight: CGFloat = 36
      contentImageView.frame = NSRect(
        x: leftPadding,
        y: (rowHeight - imageHeight) / 2,
        width: availableWidth,
        height: imageHeight
      )
      contentImageView.isHidden = false
      contentTextLabel.isHidden = true
    } else {
      // Empty mode
      contentTextLabel.isHidden = true
      contentImageView.isHidden = true
    }
  }

  override func prepareForReuse() {
    super.prepareForReuse()
    // Lightweight reset only
    contentTextLabel.stringValue = ""
    contentImageView.image = nil
  }
}

/// Custom cell view for snippet folders
final class SnippetFolderCell: NSTableCellView {
  private let nameLabel = NSTextField(labelWithString: "")
  private var isConfigured = false

  override init(frame frameRect: NSRect) {
    super.init(frame: frameRect)
    setupSubviews()
  }

  required init?(coder: NSCoder) {
    super.init(coder: coder)
    setupSubviews()
  }

  private func setupSubviews() {
    guard !isConfigured else { return }

    // Name only
    nameLabel.isEditable = false
    nameLabel.isBordered = false
    nameLabel.backgroundColor = .clear
    nameLabel.font = .systemFont(ofSize: 11, weight: .medium)
    addSubview(nameLabel)

    isConfigured = true
  }

  func configure(name: String, isExpanded: Bool, level: Int, isDarkMode: Bool) {
    let indentWidth: CGFloat = 16
    let leftPadding: CGFloat = 8 + (CGFloat(level) * indentWidth)  // Wider spacing from disclosure triangle
    let topPadding: CGFloat = 1  // Narrower vertical padding
    let rowHeight: CGFloat = 22  // Reduced row height
    let contentHeight = rowHeight - topPadding * 2  // 20px

    // Name - vertically centered
    nameLabel.stringValue = name
    let textFieldHeight: CGFloat = 16  // Height for 11pt font
    let yOffset = topPadding + (contentHeight - textFieldHeight) / 2
    nameLabel.frame = NSRect(x: leftPadding, y: yOffset, width: 240, height: textFieldHeight)

    // Root folders (level 0) are pink, sub-folders (level 1+) are light pink
    if level == 0 {
      nameLabel.textColor = isDarkMode
        ? NSColor(red: 0xff/255.0, green: 0x69/255.0, blue: 0xb4/255.0, alpha: 1.0)  // Hot pink for dark mode
        : NSColor(red: 0xff/255.0, green: 0x1a/255.0, blue: 0x8c/255.0, alpha: 1.0)  // Deep pink for light mode
    } else {
      nameLabel.textColor = isDarkMode
        ? NSColor(red: 0xff/255.0, green: 0xb3/255.0, blue: 0xd9/255.0, alpha: 0.8)  // Light pink for dark mode
        : NSColor(red: 0xff/255.0, green: 0x69/255.0, blue: 0xb4/255.0, alpha: 0.7)  // Light hot pink for light mode
    }
  }

  override func prepareForReuse() {
    super.prepareForReuse()
    nameLabel.stringValue = ""
  }
}

/// Custom cell view for snippets
final class SnippetItemCell: NSTableCellView {
  private let nameLabel = NSTextField(labelWithString: "")
  private var isConfigured = false

  override init(frame frameRect: NSRect) {
    super.init(frame: frameRect)
    setupSubviews()
  }

  required init?(coder: NSCoder) {
    super.init(coder: coder)
    setupSubviews()
  }

  private func setupSubviews() {
    guard !isConfigured else { return }

    // Name only
    nameLabel.isEditable = false
    nameLabel.isBordered = false
    nameLabel.backgroundColor = .clear
    nameLabel.font = .systemFont(ofSize: 11, weight: .regular)
    addSubview(nameLabel)

    isConfigured = true
  }

  func configure(name: String, level: Int, isDarkMode: Bool) {
    let indentWidth: CGFloat = 16
    let leftPadding: CGFloat = 8 + (CGFloat(level) * indentWidth)  // Wider spacing from disclosure triangle
    let topPadding: CGFloat = 1  // Narrower vertical padding
    let rowHeight: CGFloat = 22  // Reduced row height
    let contentHeight = rowHeight - topPadding * 2  // 20px

    // Name - vertically centered
    nameLabel.stringValue = name
    let textFieldHeight: CGFloat = 16  // Height for 11pt font
    let yOffset = topPadding + (contentHeight - textFieldHeight) / 2
    nameLabel.frame = NSRect(x: leftPadding, y: yOffset, width: 240, height: textFieldHeight)
    nameLabel.textColor = isDarkMode
      ? NSColor(red: 0xe5/255.0, green: 0xe7/255.0, blue: 0xeb/255.0, alpha: 1.0)
      : NSColor(red: 0x37/255.0, green: 0x41/255.0, blue: 0x51/255.0, alpha: 1.0)
  }

  override func prepareForReuse() {
    super.prepareForReuse()
    nameLabel.stringValue = ""
  }
}

final class ClipboardPopupWindow: NSPanel {
  // MARK: - Constants

  private enum TabTag: Int {
    case history = 100
    case historyImage = 102
    case snippet = 101
  }

  private struct UIConstants {
    static let tabButtonHeight: CGFloat = 17
    static let tabButtonYOffset: CGFloat = 3
    static let tabButtonFontSize: CGFloat = 9

    struct TabButton {
      static let historyX: CGFloat = 4
      static let historyWidth: CGFloat = 45
      static let historyImageX: CGFloat = 49
      static let historyImageWidth: CGFloat = 60
      static let snippetX: CGFloat = 109
      static let snippetWidth: CGFloat = 50
    }
  }

  // MARK: - Properties

  private var historyTextItems: [ClipboardItem] = []
  private var historyImageItems: [ClipboardItem] = []
  private var snippetItems: [ClipboardItem] = []
  private var previousApp: NSRunningApplication?
  private var tableView: NSTableView?
  private var outlineView: NSOutlineView?
  private var scrollView: NSScrollView!
  private var isDarkMode: Bool = false
  private var opacity: Double = 1.0
  private var activeTab: String = "history"

  // Snippet data
  private var snippetTreeRoot: SnippetTreeNode?
  private var snippetContentMap: [String: String] = [:]
  private var snippetFolders: [SnippetFolder] = []
  private var snippets: [SnippetItem] = []
  private var snippetImagesDir: String?

  // PERFORMANCE: Enhanced caches with LRU and row info
  private struct CachedRowInfo {
    let height: CGFloat
    let textHeight: CGFloat
  }
  private var rowInfoCache: [String: CachedRowInfo] = [:]
  // PERFORMANCE: Reduced image cache size to save memory (50 → 30)
  private var imageCache = LRUCache<String, NSImage>(capacity: 30)

  init(items: [ClipboardItem], isDarkMode: Bool = false, opacity: Double = 1.0, activeTab: String = "history", snippetDataPath: String? = nil) {
    self.isDarkMode = isDarkMode
    self.opacity = opacity
    self.activeTab = activeTab

    // Capture previous app before showing window
    if let activeApp = NSWorkspace.shared.frontmostApplication,
       activeApp.bundleIdentifier != Bundle.main.bundleIdentifier {
      self.previousApp = activeApp
    }

    // Use WindowPositionManager to calculate optimal position based on cursor
    let positionManager = WindowPositionManager()
    let contentRect = positionManager.calculateOptimalPosition()

    super.init(
      contentRect: contentRect,
      styleMask: [.borderless, .nonactivatingPanel],
      backing: .buffered,
      defer: false
    )

    self.level = .screenSaver  // Above Electron windows
    self.collectionBehavior = [.canJoinAllSpaces, .stationary, .fullScreenAuxiliary]
    self.isOpaque = false
    self.backgroundColor = .clear
    self.hasShadow = true
    self.hidesOnDeactivate = false
    self.becomesKeyOnlyIfNeeded = true

    // Classify items for display in tabs
    classifyItems(items)

    setupUI()

    // PERFORMANCE: Load snippet data asynchronously if path provided
    if let path = snippetDataPath {
      // Calculate snippet-images directory path from snippetDataPath
      let parentDir = (path as NSString).deletingLastPathComponent
      self.snippetImagesDir = (parentDir as NSString).appendingPathComponent("snippet-images")

      DispatchQueue.global(qos: .userInitiated).async { [weak self] in
        self?.loadSnippetsFromFile(path)
      }
    }
  }

  override var canBecomeKey: Bool { false }
  override var canBecomeMain: Bool { false }

  deinit {
    // Clean up tooltip when window is deallocated
    TooltipManager.shared.hideTooltip()
  }

  // PERFORMANCE: Window reuse - reset state for next use
  func reset(items: [ClipboardItem], isDarkMode: Bool, opacity: Double, activeTab: String, snippetDataPath: String?) {
    // Hide tooltip
    TooltipManager.shared.hideTooltip()

    // Update basic properties
    self.classifyItems(items)
    self.isDarkMode = isDarkMode
    self.opacity = opacity
    self.activeTab = activeTab

    // Clear caches
    self.rowInfoCache.removeAll()
    self.imageCache.clear()

    // Load snippet data if path provided (asynchronously)
    if let path = snippetDataPath {
      // Calculate snippet-images directory path from snippetDataPath
      let parentDir = (path as NSString).deletingLastPathComponent
      self.snippetImagesDir = (parentDir as NSString).appendingPathComponent("snippet-images")

      DispatchQueue.global(qos: .userInitiated).async { [weak self] in
        self?.loadSnippetsFromFile(path)
      }
    } else {
      // Clear existing snippet data
      self.snippetFolders = []
      self.snippets = []
      self.snippetContentMap = [:]
      self.snippetTreeRoot = nil
      self.snippetImagesDir = nil
    }

    // Recalculate position based on cursor
    let positionManager = WindowPositionManager()
    let contentRect = positionManager.calculateOptimalPosition()
    self.setFrame(contentRect, display: false)

    // Reload active view
    if activeTab == "history" || activeTab == "historyImage" {
      tableView?.reloadData()
    } else if activeTab == "snippet" {
      outlineView?.reloadData()
    }

    // Update tab styles
    updateTabStyles()
  }

  // MARK: - Helper Methods

  /// Classify and limit items for display in tabs
  /// - History tab: Items with text (max 30)
  /// - HistoryImage tab: Items with image data only (no text) (max 30)
  private func classifyItems(_ items: [ClipboardItem]) {
    let maxHistoryItems = 30

    // History tab: Items containing non-empty text
    historyTextItems = Array(items
      .filter { item in item.text?.isEmpty == false }
      .prefix(maxHistoryItems))

    // HistoryImage tab: Items containing image data but no text
    historyImageItems = Array(items
      .filter { item in
        guard let imageData = item.imageData, !imageData.isEmpty else { return false }
        return item.text?.isEmpty ?? true
      }
      .prefix(maxHistoryItems))
  }

  /// Get items array for the currently active tab
  private func getItemsForActiveTab() -> [ClipboardItem] {
    switch activeTab {
    case "history":
      return historyTextItems
    case "historyImage":
      return historyImageItems
    case "snippet":
      return snippetItems
    default:
      return []
    }
  }

  /// Create or get existing table view for history/historyImage tabs
  private func ensureTableViewExists() -> NSTableView {
    if let existing = tableView {
      return existing
    }

    let newTableView = NSTableView(frame: scrollView.bounds)
    newTableView.headerView = nil
    newTableView.backgroundColor = .clear
    newTableView.selectionHighlightStyle = .none
    newTableView.intercellSpacing = NSSize(width: 0, height: 0)
    newTableView.delegate = self
    newTableView.dataSource = self

    let column = NSTableColumn(identifier: NSUserInterfaceItemIdentifier("text"))
    column.width = scrollView.bounds.width - 20
    newTableView.addTableColumn(column)

    self.tableView = newTableView
    return newTableView
  }

  /// Create or get existing outline view for snippet tab
  private func ensureOutlineViewExists() -> NSOutlineView {
    if let existing = outlineView {
      return existing
    }

    let newOutlineView = NSOutlineView(frame: scrollView.bounds)
    newOutlineView.headerView = nil
    newOutlineView.backgroundColor = .clear
    newOutlineView.selectionHighlightStyle = .none
    newOutlineView.intercellSpacing = NSSize(width: 0, height: 0)
    newOutlineView.indentationPerLevel = 0
    newOutlineView.delegate = self
    newOutlineView.dataSource = self

    if isDarkMode {
      newOutlineView.appearance = NSAppearance(named: .darkAqua)
    } else {
      newOutlineView.appearance = NSAppearance(named: .aqua)
    }

    let outlineColumn = NSTableColumn(identifier: NSUserInterfaceItemIdentifier("snippet"))
    outlineColumn.width = scrollView.bounds.width - 20
    newOutlineView.addTableColumn(outlineColumn)
    newOutlineView.outlineTableColumn = outlineColumn

    self.outlineView = newOutlineView
    return newOutlineView
  }

  // MARK: - UI Setup

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

      // PERFORMANCE: Cache the gradient as a rasterized bitmap
      gradientLayer.shouldRasterize = true
      gradientLayer.rasterizationScale = NSScreen.main?.backingScaleFactor ?? 2.0

      containerView.layer?.insertSublayer(gradientLayer, at: 0)
      containerView.layer?.cornerRadius = 12
    } else {
      // Light mode: white background with opacity
      containerView.layer?.backgroundColor = NSColor.white.withAlphaComponent(opacity).cgColor
      containerView.layer?.cornerRadius = 12
    }

    contentView?.addSubview(containerView)

    // Header/Titlebar (24px height - increased by 1px)
    let headerHeight: CGFloat = 24
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

    // History tab button
    let historyTabButton = HoverableTabButton(frame: NSRect(
      x: UIConstants.TabButton.historyX,
      y: UIConstants.tabButtonYOffset,
      width: UIConstants.TabButton.historyWidth,
      height: UIConstants.tabButtonHeight
    ))
    historyTabButton.title = "History"
    historyTabButton.bezelStyle = .recessed
    historyTabButton.isBordered = false
    historyTabButton.wantsLayer = true
    historyTabButton.layer?.cornerRadius = 4
    historyTabButton.font = .systemFont(ofSize: UIConstants.tabButtonFontSize, weight: .medium)
    historyTabButton.alignment = .center
    historyTabButton.target = self
    historyTabButton.action = #selector(switchToHistoryTab)
    historyTabButton.tag = TabTag.history.rawValue
    historyTabButton.onHover = { [weak self] in
      self?.switchToHistoryTab()
    }

    // Apply theme-aware colors based on active state
    if activeTab == "history" {
      historyTabButton.contentTintColor = isDarkMode
        ? NSColor(red: 0xe5/255.0, green: 0xe7/255.0, blue: 0xeb/255.0, alpha: 1.0)  // #e5e7eb
        : NSColor(red: 0x0b/255.0, green: 0x12/255.0, blue: 0x20/255.0, alpha: 1.0)  // #0b1220
    } else {
      historyTabButton.contentTintColor = NSColor(red: 0x9c/255.0, green: 0xa3/255.0, blue: 0xaf/255.0, alpha: 1.0)  // #9ca3af
    }
    historyTabButton.layer?.backgroundColor = NSColor.clear.cgColor

    tabsContainer.addSubview(historyTabButton)

    // HistoryImage tab button
    let historyImageButton = HoverableTabButton(frame: NSRect(
      x: UIConstants.TabButton.historyImageX,
      y: UIConstants.tabButtonYOffset,
      width: UIConstants.TabButton.historyImageWidth,
      height: UIConstants.tabButtonHeight
    ))
    historyImageButton.title = "HistoryImg"
    historyImageButton.bezelStyle = .recessed
    historyImageButton.isBordered = false
    historyImageButton.wantsLayer = true
    historyImageButton.layer?.cornerRadius = 4
    historyImageButton.font = .systemFont(ofSize: UIConstants.tabButtonFontSize, weight: .medium)
    historyImageButton.alignment = .center
    historyImageButton.target = self
    historyImageButton.action = #selector(switchToHistoryImageTab)
    historyImageButton.tag = TabTag.historyImage.rawValue
    historyImageButton.onHover = { [weak self] in
      self?.switchToHistoryImageTab()
    }

    // Apply theme-aware colors based on active state
    if activeTab == "historyImage" {
      historyImageButton.contentTintColor = isDarkMode
        ? NSColor(red: 0xe5/255.0, green: 0xe7/255.0, blue: 0xeb/255.0, alpha: 1.0)  // #e5e7eb
        : NSColor(red: 0x0b/255.0, green: 0x12/255.0, blue: 0x20/255.0, alpha: 1.0)  // #0b1220
    } else {
      historyImageButton.contentTintColor = NSColor(red: 0x9c/255.0, green: 0xa3/255.0, blue: 0xaf/255.0, alpha: 1.0)  // #9ca3af
    }
    historyImageButton.layer?.backgroundColor = NSColor.clear.cgColor

    tabsContainer.addSubview(historyImageButton)

    // Snippet tab button
    let snippetTabButton = HoverableTabButton(frame: NSRect(
      x: UIConstants.TabButton.snippetX,
      y: UIConstants.tabButtonYOffset,
      width: UIConstants.TabButton.snippetWidth,
      height: UIConstants.tabButtonHeight
    ))
    snippetTabButton.title = "Snippet"
    snippetTabButton.bezelStyle = .recessed
    snippetTabButton.isBordered = false
    snippetTabButton.wantsLayer = true
    snippetTabButton.layer?.cornerRadius = 4
    snippetTabButton.font = .systemFont(ofSize: UIConstants.tabButtonFontSize, weight: .medium)
    snippetTabButton.alignment = .center
    snippetTabButton.target = self
    snippetTabButton.action = #selector(switchToSnippetTab)
    snippetTabButton.tag = TabTag.snippet.rawValue
    snippetTabButton.onHover = { [weak self] in
      self?.switchToSnippetTab()
    }

    // Apply theme-aware colors based on active state
    if activeTab == "snippet" {
      snippetTabButton.contentTintColor = isDarkMode
        ? NSColor(red: 0xe5/255.0, green: 0xe7/255.0, blue: 0xeb/255.0, alpha: 1.0)  // #e5e7eb
        : NSColor(red: 0x0b/255.0, green: 0x12/255.0, blue: 0x20/255.0, alpha: 1.0)  // #0b1220
    } else {
      snippetTabButton.contentTintColor = NSColor(red: 0x9c/255.0, green: 0xa3/255.0, blue: 0xaf/255.0, alpha: 1.0)  // #9ca3af
    }
    snippetTabButton.layer?.backgroundColor = NSColor.clear.cgColor

    tabsContainer.addSubview(snippetTabButton)
    headerView.addSubview(tabsContainer)

    // Close button in header (top-right, 11px size)
    let closeButtonSize: CGFloat = 11
    let closeButtonMargin: CGFloat = 8  // Increased from 7 to 8 (right margin +2px total)
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

    // PERFORMANCE: Lazy view initialization - only create the view for the active tab
    if activeTab == "snippet" {
      // Create OutlineView only
      let outlineView = NSOutlineView(frame: scrollView.bounds)
      outlineView.headerView = nil
      outlineView.backgroundColor = .clear
      outlineView.selectionHighlightStyle = .none
      outlineView.intercellSpacing = NSSize(width: 0, height: 0)
      outlineView.indentationPerLevel = 0  // We handle indentation manually
      outlineView.delegate = self
      outlineView.dataSource = self

      // Set appearance for disclosure triangle color
      if isDarkMode {
        outlineView.appearance = NSAppearance(named: .darkAqua)
      } else {
        outlineView.appearance = NSAppearance(named: .aqua)
      }

      let outlineColumn = NSTableColumn(identifier: NSUserInterfaceItemIdentifier("snippet"))
      outlineColumn.width = scrollView.bounds.width - 20
      outlineView.addTableColumn(outlineColumn)
      outlineView.outlineTableColumn = outlineColumn

      self.outlineView = outlineView
      scrollView.documentView = outlineView
      outlineView.reloadData()
    } else {
      // Create TableView only (default: history tab)
      let tableView = NSTableView(frame: scrollView.bounds)
      tableView.headerView = nil
      tableView.backgroundColor = .clear
      tableView.selectionHighlightStyle = .none
      tableView.intercellSpacing = NSSize(width: 0, height: 0)  // No spacing between rows
      tableView.delegate = self
      tableView.dataSource = self

      let column = NSTableColumn(identifier: NSUserInterfaceItemIdentifier("text"))
      column.width = scrollView.bounds.width - 20
      tableView.addTableColumn(column)

      self.tableView = tableView
      scrollView.documentView = tableView
      tableView.reloadData()
    }

    containerView.addSubview(scrollView)
  }

  @objc private func closeWindow() {
    TooltipManager.shared.hideTooltip()
    self.close()
  }

  // MARK: - Tab Switching

  /// Common tab switching logic
  private func switchToTab(_ newTab: String) {
    TooltipManager.shared.hideTooltip()
    activeTab = newTab
    rowInfoCache.removeAll()
    updateTabStyles()

    switch newTab {
    case "history", "historyImage":
      let view = ensureTableViewExists()
      scrollView.documentView = view
      view.reloadData()

    case "snippet":
      let view = ensureOutlineViewExists()
      scrollView.documentView = view
      view.reloadData()

    default:
      break
    }
  }

  @objc private func switchToHistoryTab() {
    switchToTab("history")
  }

  @objc private func switchToHistoryImageTab() {
    switchToTab("historyImage")
  }

  @objc private func switchToSnippetTab() {
    switchToTab("snippet")
  }

  private func updateTabStyles() {
    guard let containerView = contentView?.subviews.first,
          let headerView = containerView.subviews.last(where: { $0.frame.maxY == containerView.bounds.maxY }),
          let tabsContainer = headerView.subviews.first(where: { $0.frame.minX == 0 }) else {
      return
    }

    let historyBtn = tabsContainer.viewWithTag(TabTag.history.rawValue) as? NSButton
    let historyImageBtn = tabsContainer.viewWithTag(TabTag.historyImage.rawValue) as? NSButton
    let snippetBtn = tabsContainer.viewWithTag(TabTag.snippet.rawValue) as? NSButton

    let activeColor = isDarkMode
      ? NSColor(red: 0xe5/255.0, green: 0xe7/255.0, blue: 0xeb/255.0, alpha: 1.0)
      : NSColor(red: 0x0b/255.0, green: 0x12/255.0, blue: 0x20/255.0, alpha: 1.0)
    let inactiveColor = NSColor(red: 0x9c/255.0, green: 0xa3/255.0, blue: 0xaf/255.0, alpha: 1.0)

    historyBtn?.contentTintColor = activeTab == "history" ? activeColor : inactiveColor
    historyImageBtn?.contentTintColor = activeTab == "historyImage" ? activeColor : inactiveColor
    snippetBtn?.contentTintColor = activeTab == "snippet" ? activeColor : inactiveColor
  }

  func updateHistory(items: [ClipboardItem]) {
    DispatchQueue.main.async { [weak self] in
      guard let self = self else { return }

      // PERFORMANCE: Classify incoming items
      let oldTextCount = self.historyTextItems.count
      let oldImageCount = self.historyImageItems.count

      self.classifyItems(items)

      let newTextCount = self.historyTextItems.count
      let newImageCount = self.historyImageItems.count

      // Update only the active tab's view
      if self.activeTab == "history" {
        // Update text items view
        if newTextCount > oldTextCount {
          // New items added
          let newIndexes = IndexSet(integersIn: 0..<(newTextCount - oldTextCount))
          self.tableView?.insertRows(at: newIndexes, withAnimation: .slideDown)
        } else if newTextCount < oldTextCount {
          // Items removed
          let removedIndexes = IndexSet(integersIn: newTextCount..<oldTextCount)
          self.tableView?.removeRows(at: removedIndexes, withAnimation: .slideUp)
        } else {
          // Same count - full reload
          self.rowInfoCache.removeAll()
          self.tableView?.reloadData()
        }
      } else if self.activeTab == "historyImage" {
        // Update image items view
        if newImageCount > oldImageCount {
          // New items added
          let newIndexes = IndexSet(integersIn: 0..<(newImageCount - oldImageCount))
          self.tableView?.insertRows(at: newIndexes, withAnimation: .slideDown)
        } else if newImageCount < oldImageCount {
          // Items removed
          let removedIndexes = IndexSet(integersIn: newImageCount..<oldImageCount)
          self.tableView?.removeRows(at: removedIndexes, withAnimation: .slideUp)
        } else {
          // Same count - full reload
          self.rowInfoCache.removeAll()
          self.tableView?.reloadData()
        }
      }
    }
  }

  private func handleItemClick(index: Int) {
    let items = getItemsForActiveTab()
    guard index >= 0 && index < items.count else { return }
    let item = items[index]

    // Visual feedback (only if tableView exists)
    if let rowView = tableView?.rowView(atRow: index, makeIfNecessary: false) {
      rowView.backgroundColor = NSColor.systemGreen.withAlphaComponent(0.15)
      DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) {
        rowView.backgroundColor = .clear
      }
    }

    // Copy to clipboard and paste
    pasteItem(item: item)

    // Close window after a short delay and report the pasted item
    DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) {
      // Output the pasted item info so Electron can track it
      let output = BridgeOutput(
        status: .ok,
        text: item.text,
        source: nil,
        code: "item_pasted",
        message: "Item pasted successfully",
        imageDataOriginal: item.imageDataOriginal
      )
      print(output.encoded())
      self.close()
    }
  }

  /// Paste a clipboard item to the active application
  /// - Parameter item: The clipboard item containing text and/or image data
  /// - Note: Text is prioritized over images. Rich text formats (RTF, HTML) are written
  ///         alongside plain text when available, allowing automatic fallback for apps
  ///         that don't support rich text.
  private func pasteItem(item: ClipboardItem) {
    let pasteboard = NSPasteboard.general
    pasteboard.clearContents()

    let hasText = item.text != nil && !item.text!.isEmpty
    let hasImage = item.imageData != nil && !item.imageData!.isEmpty

    // Prioritize text over image
    if hasText {
      // Write plain text (always available as fallback)
      pasteboard.setString(item.text!, forType: .string)

      // Write rich text formats if available
      if let richText = item.richText {
        writeRichTextToPasteboard(pasteboard, richText: richText)
      }
    } else if hasImage {
      // Write image only (no text present)
      let imageDataUrl = item.imageDataOriginal ?? item.imageData
      if let dataUrl = imageDataUrl,
         let (imageData, imageType) = extractImageDataFromDataURL(dataUrl) {
        pasteboard.setData(imageData, forType: imageType)
      }
    }

    // Ensure accessibility permission
    guard SelectedTextStateMachine.ensureAccessibility(prompt: false) else {
      return
    }

    // Activate target app (prefer current frontmost, fallback to previous)
    let targetApp: NSRunningApplication?
    if let frontmost = NSWorkspace.shared.frontmostApplication,
       frontmost.bundleIdentifier != Bundle.main.bundleIdentifier {
      targetApp = frontmost
    } else {
      targetApp = previousApp
    }

    if let app = targetApp {
      app.activate(options: [.activateIgnoringOtherApps])
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
    switch activeTab {
    case "history":
      return historyTextItems.count
    case "historyImage":
      return historyImageItems.count
    case "snippet":
      return snippetItems.count
    default:
      return 0
    }
  }
}

extension ClipboardPopupWindow: NSTableViewDelegate {
  func tableView(_ tableView: NSTableView, viewFor tableColumn: NSTableColumn?, row: Int) -> NSView? {
    let identifier = NSUserInterfaceItemIdentifier("ClipboardItemCell")
    let items = getItemsForActiveTab()
    guard row >= 0 && row < items.count else { return nil }
    let item = items[row]

    // PERFORMANCE: Reuse custom cell view (subviews persist!)
    var cell = tableView.makeView(withIdentifier: identifier, owner: self) as? ClipboardItemCell
    if cell == nil {
      cell = ClipboardItemCell()
      cell?.identifier = identifier
    }

    guard let cellView = cell else { return nil }

    // Get row height and available width
    let rowHeight = self.tableView(tableView, heightOfRow: row)
    let rightPadding: CGFloat = 8
    let leftPadding: CGFloat = 3
    let availableWidth = tableView.bounds.width - leftPadding - rightPadding

    // Get image from cache if needed
    var image: NSImage? = nil
    if (item.text == nil || item.text!.isEmpty), let imageDataUrl = item.imageData {
      image = imageCache.get(imageDataUrl)
      if image == nil {
        // Decode image synchronously for first appearance (will be cached)
        image = decodeImageFromDataURL(imageDataUrl)
      }
    }

    // Configure cell (no subview recreation!)
    cellView.configure(
      text: item.text,
      image: image,
      rowHeight: rowHeight,
      availableWidth: availableWidth,
      isDarkMode: isDarkMode
    )

    return cellView
  }

  // PERFORMANCE: Image decoding with LRU cache (O(1) operations)
  // Optimized with faster base64 decoding
  private func decodeImageFromDataURL(_ dataURL: String) -> NSImage? {
    // DataURL format: "data:image/png;base64,..."
    guard let commaRange = dataURL.range(of: ",") else {
      return nil
    }

    // PERFORMANCE: Direct substring extraction without percent encoding removal
    let base64Substring = dataURL[commaRange.upperBound...]
    let base64String = String(base64Substring)

    // PERFORMANCE: Use Data's optimized base64 decoder with ignoreUnknownCharacters option
    guard let imageData = Data(base64Encoded: base64String, options: .ignoreUnknownCharacters),
          let image = NSImage(data: imageData) else {
      return nil
    }

    // Cache with LRU (automatic eviction)
    imageCache.set(dataURL, value: image)
    return image
  }

  // PERFORMANCE: Async image decoding for better responsiveness
  private func decodeImageAsync(_ dataURL: String, completion: @escaping (NSImage?) -> Void) {
    // Check cache first
    if let cached = imageCache.get(dataURL) {
      completion(cached)
      return
    }

    // Decode in background
    DispatchQueue.global(qos: .userInteractive).async { [weak self] in
      let image = self?.decodeImageFromDataURL(dataURL)
      DispatchQueue.main.async {
        completion(image)
      }
    }
  }

  // Get image from cache or decode (for display purposes)
  private func imageFromDataURL(_ dataURL: String) -> NSImage? {
    if let cached = imageCache.get(dataURL) {
      return cached
    }
    return decodeImageFromDataURL(dataURL)
  }

  // Extract image binary data and MIME type from DataURL (for high-quality pasting)
  private func extractImageDataFromDataURL(_ dataURL: String) -> (data: Data, type: NSPasteboard.PasteboardType)? {
    // DataURL format: "data:image/png;base64,..." or "data:image/jpeg;base64,..."
    guard let commaRange = dataURL.range(of: ",") else {
      return nil
    }

    // Extract MIME type
    let prefix = String(dataURL[..<commaRange.lowerBound])
    var pasteboardType: NSPasteboard.PasteboardType = .png  // Default to PNG

    if prefix.contains("image/jpeg") || prefix.contains("image/jpg") {
      pasteboardType = .init("public.jpeg")
    } else if prefix.contains("image/png") {
      pasteboardType = .png
    } else if prefix.contains("image/tiff") {
      pasteboardType = .tiff
    }

    // Extract base64 data
    guard let base64String = dataURL[commaRange.upperBound...].removingPercentEncoding,
          let imageData = Data(base64Encoded: String(base64String)) else {
      return nil
    }

    return (data: imageData, type: pasteboardType)
  }

  /// Write rich text formats to pasteboard
  /// - Parameters:
  ///   - pasteboard: The pasteboard to write to
  ///   - richText: Rich text data containing RTF, HTML, and/or Markdown
  private func writeRichTextToPasteboard(_ pasteboard: NSPasteboard, richText: RichTextData) {
    // Write RTF format
    if let rtfBase64 = richText.rtf, let rtfData = Data(base64Encoded: rtfBase64) {
      pasteboard.setData(rtfData, forType: .rtf)
    }

    // Write HTML format
    if let html = richText.html, let htmlData = html.data(using: .utf8) {
      pasteboard.setData(htmlData, forType: .html)
    }

    // Write Markdown format (using public.markdown UTI)
    if let markdown = richText.markdown, let markdownData = markdown.data(using: .utf8) {
      let markdownType = NSPasteboard.PasteboardType("public.markdown")
      pasteboard.setData(markdownData, forType: markdownType)
    }
  }

  func tableView(_ tableView: NSTableView, shouldSelectRow row: Int) -> Bool {
    handleItemClick(index: row)
    return false
  }

  func tableView(_ tableView: NSTableView, rowViewForRow row: Int) -> NSTableRowView? {
    // PERFORMANCE: Reuse row views
    let identifier = "HoverableRow"
    var rowView = tableView.makeView(withIdentifier: NSUserInterfaceItemIdentifier(identifier), owner: self) as? HoverableTableRowView

    if rowView == nil {
      rowView = HoverableTableRowView(isDarkMode: isDarkMode)
      rowView?.identifier = NSUserInterfaceItemIdentifier(identifier)
      rowView?.wantsLayer = true
    }

    // Set tooltip data source
    rowView?.tooltipDataSource = self

    return rowView
  }

  func tableView(_ tableView: NSTableView, heightOfRow row: Int) -> CGFloat {
    let items = getItemsForActiveTab()
    guard row >= 0 && row < items.count else { return 46 }
    let item = items[row]

    // PERFORMANCE: Create cache key from item (timestamp + text hash)
    let cacheKey = "\(item.timestamp ?? 0)_\(item.text?.prefix(50).hashValue ?? 0)"

    // Check cache first
    if let cached = rowInfoCache[cacheKey] {
      return cached.height
    }

    let topPadding: CGFloat = 3
    let bottomPadding: CGFloat = 3

    let hasText = item.text != nil && !item.text!.isEmpty
    let hasImage = item.imageData != nil && !item.imageData!.isEmpty

    var totalHeight: CGFloat = topPadding
    var textHeight: CGFloat = 0

    // Add image height if image exists and no text
    if hasImage && !hasText {
      totalHeight += 36  // Image height
    }

    // Add text height if text exists (1 line only)
    if let text = item.text, !text.isEmpty {
      // Single line height: 11pt font + minimal padding
      let lineHeight: CGFloat = 15
      textHeight = lineHeight
      totalHeight += textHeight
    }

    totalHeight += bottomPadding

    // Minimum height
    let height = max(totalHeight, 22)

    // PERFORMANCE: Cache both height and text height
    rowInfoCache[cacheKey] = CachedRowInfo(height: height, textHeight: textHeight)

    return height
  }

  // MARK: - Snippet Loading and Tree Building

  private func loadSnippetsFromFile(_ path: String) {
    // PERFORMANCE: File I/O on background thread
    guard FileManager.default.fileExists(atPath: path),
          let data = try? Data(contentsOf: URL(fileURLWithPath: path)),
          let decoded = try? JSONDecoder().decode(SnippetDataStructure.self, from: data)
    else { return }

    // Update data on main thread
    DispatchQueue.main.async { [weak self] in
      guard let self = self else { return }

      self.snippetFolders = decoded.folders
      self.snippets = decoded.snippets

      // Build content map (ID -> content) - only for text snippets
      for snippet in decoded.snippets {
        if snippet.type != "image", let content = snippet.content {
          self.snippetContentMap[snippet.id] = content
        }
      }

      // Build tree structure
      self.buildSnippetTree()

      // Reload outline view if it's already created and active
      if self.activeTab == "snippet" {
        self.outlineView?.reloadData()
      }
    }
  }

  private func buildSnippetTree() {
    let rootNode = SnippetTreeNode(type: .folder(id: "root", name: "Root"))

    // Get root folders (no parentId)
    let rootFolders = snippetFolders.filter { $0.parentId == nil }

    for folder in rootFolders {
      if let node = buildNodeRecursive(folder: folder) {
        rootNode.children.append(node)
        node.parent = rootNode
      }
    }

    snippetTreeRoot = rootNode
  }

  private func buildNodeRecursive(folder: SnippetFolder) -> SnippetTreeNode? {
    let folderNode = SnippetTreeNode(type: .folder(id: folder.id, name: folder.name))

    // Add snippets in this folder
    let snippetsInFolder = snippets.filter { $0.folderId == folder.id }
    for snippet in snippetsInFolder {
      let snippetNode = SnippetTreeNode(type: .snippet(
        id: snippet.id,
        name: snippet.name,
        contentRef: snippet.id,
        imagePath: snippet.type == "image" ? snippet.imagePath : nil
      ))
      folderNode.children.append(snippetNode)
      snippetNode.parent = folderNode
    }

    // Add subfolders recursively
    let subfolders = snippetFolders.filter { $0.parentId == folder.id }
    for subfolder in subfolders {
      if let subNode = buildNodeRecursive(folder: subfolder) {
        folderNode.children.append(subNode)
        subNode.parent = folderNode
      }
    }

    return folderNode
  }

  private func getNodeLevel(_ node: SnippetTreeNode) -> Int {
    var level = 0
    var current = node.parent
    while current != nil && current?.id != "root" {
      level += 1
      current = current?.parent
    }
    return level
  }
}

// MARK: - NSOutlineViewDataSource
extension ClipboardPopupWindow: NSOutlineViewDataSource {
  func outlineView(_ outlineView: NSOutlineView, numberOfChildrenOfItem item: Any?) -> Int {
    if item == nil {
      // Root level
      return snippetTreeRoot?.children.count ?? 0
    }
    guard let node = item as? SnippetTreeNode else { return 0 }
    return node.children.count
  }

  func outlineView(_ outlineView: NSOutlineView, child index: Int, ofItem item: Any?) -> Any {
    if item == nil {
      // Root level
      return snippetTreeRoot!.children[index]
    }
    guard let node = item as? SnippetTreeNode else {
      fatalError("Invalid item")
    }
    return node.children[index]
  }

  func outlineView(_ outlineView: NSOutlineView, isItemExpandable item: Any) -> Bool {
    guard let node = item as? SnippetTreeNode else { return false }
    if case .folder = node.type {
      return !node.children.isEmpty
    }
    return false
  }
}

// MARK: - NSOutlineViewDelegate (Snippet View)
extension ClipboardPopupWindow: NSOutlineViewDelegate {
  func outlineView(_ outlineView: NSOutlineView, viewFor tableColumn: NSTableColumn?, item: Any) -> NSView? {
    guard let node = item as? SnippetTreeNode else { return nil }
    let level = getNodeLevel(node)

    switch node.type {
    case .folder(_, let name):
      let identifier = NSUserInterfaceItemIdentifier("FolderCell")
      var cell = outlineView.makeView(withIdentifier: identifier, owner: self) as? SnippetFolderCell
      if cell == nil {
        cell = SnippetFolderCell()
        cell?.identifier = identifier
      }
      let isExpanded = outlineView.isItemExpanded(node)
      cell?.configure(name: name, isExpanded: isExpanded, level: level, isDarkMode: isDarkMode)
      return cell

    case .snippet(_, let name, _, _):
      let identifier = NSUserInterfaceItemIdentifier("SnippetCell")
      var cell = outlineView.makeView(withIdentifier: identifier, owner: self) as? SnippetItemCell
      if cell == nil {
        cell = SnippetItemCell()
        cell?.identifier = identifier
      }
      cell?.configure(name: name, level: level, isDarkMode: isDarkMode)
      return cell
    }
  }

  func outlineView(_ outlineView: NSOutlineView, heightOfRowByItem item: Any) -> CGFloat {
    // All rows (folders and snippets) have the same height
    return 22
  }

  func outlineView(_ outlineView: NSOutlineView, shouldSelectItem item: Any) -> Bool {
    guard let node = item as? SnippetTreeNode else { return false }

    switch node.type {
    case .folder:
      // Toggle expansion on click
      if outlineView.isItemExpanded(node) {
        outlineView.collapseItem(node)
      } else {
        outlineView.expandItem(node)
      }
      // Update folder icon
      outlineView.reloadItem(node)
      return false

    case .snippet(_, _, let contentRef, let imagePath):
      // Handle image snippet
      if let imagePath = imagePath, let imagesDir = snippetImagesDir {
        let fullPath = (imagesDir as NSString).appendingPathComponent(imagePath)
        pasteSnippetImage(fullPath)
      }
      // Handle text snippet
      else if let content = snippetContentMap[contentRef] {
        pasteSnippetContent(content)
      }
      return false
    }
  }

  func outlineView(_ outlineView: NSOutlineView, rowViewForItem item: Any) -> NSTableRowView? {
    let identifier = "HoverableRow"
    var rowView = outlineView.makeView(withIdentifier: NSUserInterfaceItemIdentifier(identifier), owner: self) as? HoverableTableRowView

    if rowView == nil {
      rowView = HoverableTableRowView(isDarkMode: isDarkMode)
      rowView?.identifier = NSUserInterfaceItemIdentifier(identifier)
      rowView?.wantsLayer = true
    }

    // Set tooltip data source
    rowView?.tooltipDataSource = self

    return rowView
  }

  private func pasteSnippetContent(_ content: String) {
    // Update clipboard
    let pasteboard = NSPasteboard.general
    pasteboard.clearContents()
    pasteboard.setString(content, forType: .string)

    // Ensure accessibility permission
    guard SelectedTextStateMachine.ensureAccessibility(prompt: false) else {
      return
    }

    // Activate target app (prefer current frontmost, fallback to previous)
    let targetApp: NSRunningApplication?
    if let frontmost = NSWorkspace.shared.frontmostApplication,
       frontmost.bundleIdentifier != Bundle.main.bundleIdentifier {
      targetApp = frontmost
    } else {
      targetApp = previousApp
    }

    if let app = targetApp {
      app.activate(options: [.activateIgnoringOtherApps])
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

    // Close window after a short delay
    DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) {
      let output = BridgeOutput(
        status: .ok,
        text: content,
        source: nil,
        code: "snippet_pasted",
        message: "Snippet pasted successfully"
      )
      print(output.encoded())
      self.close()
    }
  }

  private func pasteSnippetImage(_ imagePath: String) {
    // Load image from file
    guard let image = NSImage(contentsOfFile: imagePath) else { return }

    // Update clipboard with image
    let pasteboard = NSPasteboard.general
    pasteboard.clearContents()
    pasteboard.writeObjects([image])

    // Ensure accessibility permission
    guard SelectedTextStateMachine.ensureAccessibility(prompt: false) else {
      return
    }

    // Activate target app (prefer current frontmost, fallback to previous)
    let targetApp: NSRunningApplication?
    if let frontmost = NSWorkspace.shared.frontmostApplication,
       frontmost.bundleIdentifier != Bundle.main.bundleIdentifier {
      targetApp = frontmost
    } else {
      targetApp = previousApp
    }

    if let app = targetApp {
      app.activate(options: [.activateIgnoringOtherApps])
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

    // Close window after a short delay
    DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) {
      let output = BridgeOutput(
        status: .ok,
        text: nil,
        source: nil,
        code: "image_snippet_pasted",
        message: "Image snippet pasted successfully"
      )
      print(output.encoded())
      self.close()
    }
  }
}

// MARK: - TooltipDataSource Implementation
extension ClipboardPopupWindow: TooltipDataSource {
  func tooltipText(forRow row: Int, inView view: NSView) -> String? {
    if let tableView = tableView, view == tableView {
      // No tooltip for historyImage tab
      if activeTab == "historyImage" {
        return nil
      }

      let items = getItemsForActiveTab()
      guard row >= 0 && row < items.count else { return nil }
      let item = items[row]

      // Return text content if available
      if let text = item.text, !text.isEmpty {
        return text
      }

      // For images, show metadata
      if item.imageData != nil {
        return "[Image]"
      }

      return nil
    } else if let outlineView = outlineView, view == outlineView {
      // Snippet tree view
      guard let item = outlineView.item(atRow: row) as? SnippetTreeNode else { return nil }

      switch item.type {
      case .folder:
        return nil  // No tooltip for folders
      case .snippet(_, let name, let contentRef, let imagePath):
        // Image snippet - no text tooltip (will show image tooltip instead)
        if imagePath != nil {
          return nil
        }
        // Text snippet - return snippet content for tooltip
        if let content = snippetContentMap[contentRef], !content.isEmpty {
          return content
        }
        return name
      }
    }

    return nil
  }

  func tooltipImage(forRow row: Int, inView view: NSView) -> NSImage? {
    // Only for snippet outline view
    guard let outlineView = outlineView, view == outlineView else { return nil }
    guard let item = outlineView.item(atRow: row) as? SnippetTreeNode else { return nil }

    switch item.type {
    case .folder:
      return nil
    case .snippet(_, _, _, let imagePath):
      // Load image for image snippets
      guard let imagePath = imagePath, let imagesDir = snippetImagesDir else { return nil }
      let fullPath = (imagesDir as NSString).appendingPathComponent(imagePath)
      return NSImage(contentsOfFile: fullPath)
    }
  }

  func getTooltipDarkMode() -> Bool {
    return self.isDarkMode
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

// PERFORMANCE: Window pool - reuse windows instead of recreating
private var cachedPopupWindow: ClipboardPopupWindow?

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

    // PERFORMANCE: Reuse cached window if available
    let window: ClipboardPopupWindow
    if let cached = cachedPopupWindow, cached.isVisible == false {
      // Reuse existing window
      window = cached
      window.reset(
        items: input.items,
        isDarkMode: input.isDarkMode,
        opacity: input.opacity,
        activeTab: input.activeTab ?? "history",
        snippetDataPath: input.snippetDataPath
      )
    } else {
      // Create new window
      window = ClipboardPopupWindow(
        items: input.items,
        isDarkMode: input.isDarkMode,
        opacity: input.opacity,
        activeTab: input.activeTab ?? "history",
        snippetDataPath: input.snippetDataPath
      )
      cachedPopupWindow = window
    }

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
