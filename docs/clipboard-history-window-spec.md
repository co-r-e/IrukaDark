# クリップボード履歴ウィンドウ 仕様書

## 概要

Command+Shift+Vショートカットで呼び出される、マウスポインター位置に表示されるクリップボード履歴ウィンドウの実装仕様。

## 機能要件

### 1. ショートカットキー

- **トリガー**: Command+Shift+V
- **動作**: 現在のマウスポインター位置にクリップボード履歴ウィンドウを表示

### 2. ウィンドウ表示

- マウスポインター位置を中心に表示
- サイズ: 300x400px
- 常に最前面表示
- 全てのスペース（仮想デスクトップ）で表示可能
- フォーカスを奪わない（NSPanel with nonactivatingPanel）

### 3. クリップボード履歴管理

- 最大50件のクリップボード履歴を保持
- 新しい項目が上部に表示される（逆順）
- 1秒ごとにクリップボードの変更を監視
- 重複チェック: 最新項目と同じ内容の場合は追加しない

### 4. アイテム表示

- 各アイテムは2行まで表示（それ以降は省略記号）
- フォントサイズ: 11px
- テキスト色: ダークグレー
- 背景: 半透明の白カード
- ホバー時: 薄い背景色表示
- クリック時: 緑色のフィードバック `rgba(16, 185, 129, 0.15)`

### 5. クリック動作

- アイテムをクリック → クリップボードに設定 → フォーカスしているアプリにCommand+Vでペースト
- ペースト対象: ウィンドウ表示前にアクティブだったアプリケーション
- ペースト後もウィンドウは閉じない（連続ペースト可能）

### 6. キーボード操作

- キーボード入力を完全に無効化
- マウス操作のみ受け付ける

## 技術要件

### 1. 実装言語

- Swift（ネイティブmacOSウィンドウ）
- Electron側からSwiftバイナリを起動

### 2. アーキテクチャ

```
Electron (Main Process)
  └─ macAutomationBridge.js
       └─ spawn IrukaAutomation binary (detached)
            └─ ClipboardHistoryWindow (NSPanel)
```

### 3. プロセス分離

- Swiftウィンドウは独立プロセスとして実行
- `detached: true` + `child.unref()` で完全に独立
- Electronアプリ終了時もウィンドウは継続可能

### 4. 必要な権限

- アクセシビリティ権限（Accessibility API）
  - Command+Vキーイベント送信に必要
  - 権限がない場合はプロンプト表示

## UI/UXデザイン仕様

### ウィンドウスタイル

```swift
// NSPanel設定
styleMask: [.borderless, .nonactivatingPanel]
level: .popUpMenu
collectionBehavior: [.canJoinAllSpaces, .stationary, .fullScreenAuxiliary]
isOpaque: false
backgroundColor: NSColor.clear
hidesOnDeactivate: false
becomesKeyOnlyIfNeeded: true
canBecomeKey: false
canBecomeMain: false
```

### レイアウト構造

```
┌────────────────────────────────┐
│ × Clipboard History            │ ← ヘッダー（高さ30px）
├────────────────────────────────┤
│ ┌────────────────────────────┐ │
│ │ アイテム1（最新）          │ │
│ │ テキストプレビュー...      │ │
│ └────────────────────────────┘ │
│ ┌────────────────────────────┐ │
│ │ アイテム2                  │ │ ← スクロール可能
│ │ テキストプレビュー...      │ │
│ └────────────────────────────┘ │
│ ┌────────────────────────────┐ │
│ │ アイテム3                  │ │
│ │ テキストプレビュー...      │ │
│ └────────────────────────────┘ │
└────────────────────────────────┘
```

### 色とスタイル

- **ウィンドウ背景**: 白 95% 不透明度、角丸 12px
- **アイテム背景**: 透明（デフォルト）
- **アイテムホバー**: 白 8% 不透明度
- **アイテムクリック**: `rgba(16, 185, 129, 0.15)`（0.5秒後にフェードアウト）
- **アイテム角丸**: 8px
- **アイテム内側余白**: 上下6px、左右8px
- **アイテム間隔**: 0px（stackView spacing）

## 実装詳細

### 1. ファイル構成

```
/native/macos/IrukaAutomation/
├── Sources/
│   └── IrukaAutomation/
│       └── main.swift               # 全実装（単一ファイル）
├── Package.swift                     # Swift Package Manager設定
└── dist/
    └── IrukaAutomation              # ビルド済みユニバーサルバイナリ

/src/main/
├── services/
│   └── macAutomationBridge.js       # Electron ↔ Swift Bridge
└── bootstrap/
    └── app.js                        # ショートカット登録
```

### 2. 主要クラス

#### ClipboardHistoryWindow (NSPanel)

```swift
class ClipboardHistoryWindow: NSPanel {
  // プロパティ
  private var historyItems: [ClipboardHistoryItem] = []
  private var stackView: NSStackView!
  private var scrollView: NSScrollView!
  private let maxItems = 50
  private var logFile: FileHandle?
  private var previousApp: NSRunningApplication?

  // 初期化時にpreviousAppをキャプチャ
  init()

  // クリップボード監視（1秒間隔）
  private func startMonitoringClipboard()

  // アイテムクリック処理
  private func handleItemClick(text: String)

  // ペーストコマンド送信
  private func sendPasteCommand()
}
```

#### ClickableItemView (NSView)

```swift
private class ClickableItemView: NSView {
  var clickHandler: (() -> Void)?

  // マウスイベントを直接処理
  override func mouseDown(with event: NSEvent)
  override func mouseUp(with event: NSEvent)
  override func mouseEntered(with event: NSEvent)
  override func mouseExited(with event: NSEvent)
}
```

#### KeyboardBlockingView (NSView)

```swift
class KeyboardBlockingView: NSView {
  // キーボードイベントを全て無視
  override var acceptsFirstResponder: Bool { return false }
  override func keyDown(with event: NSEvent) {}
  override func keyUp(with event: NSEvent) {}
  override func flagsChanged(with event: NSEvent) {}
}
```

### 3. フォーカス管理の仕組み

**問題**: ウィンドウがフォーカスを取ると、Command+Vが元のアプリに届かない

**解決策**:

1. **ウィンドウ表示前に前のアプリをキャプチャ**

   ```swift
   private func capturePreviousApp() {
     let workspace = NSWorkspace.shared
     if let activeApp = workspace.frontmostApplication {
       if activeApp.bundleIdentifier != Bundle.main.bundleIdentifier {
         previousApp = activeApp
       }
     }
   }
   ```

2. **NSPanelで絶対にフォーカスを取らない**

   ```swift
   styleMask: [.borderless, .nonactivatingPanel]
   canBecomeKey: false
   canBecomeMain: false
   ```

3. **ペースト時に元のアプリにフォーカスを戻す**
   ```swift
   if let previousApp = previousApp {
     previousApp.activate(options: [.activateIgnoringOtherApps])
     usleep(150000) // 150ms待機
   }
   ```

### 4. クリップボード監視

```swift
private var lastChangeCount: Int = NSPasteboard.general.changeCount

private func checkClipboardChanges() {
  let pasteboard = NSPasteboard.general
  let currentChangeCount = pasteboard.changeCount

  if currentChangeCount != lastChangeCount {
    lastChangeCount = currentChangeCount

    if let string = pasteboard.string(forType: .string), !string.isEmpty {
      if historyItems.first?.text != string {
        let item = ClipboardHistoryItem(
          id: UUID().uuidString,
          text: string,
          timestamp: Date()
        )
        historyItems.insert(item, at: 0)

        if historyItems.count > maxItems {
          historyItems = Array(historyItems.prefix(maxItems))
        }

        renderHistoryItems()
      }
    }
  }
}
```

### 5. Command+V送信

```swift
private func sendPasteCommand() {
  // 1. アクセシビリティ権限チェック
  let hasPermission = SelectedTextStateMachine.ensureAccessibility(prompt: true)
  guard hasPermission else { return }

  // 2. 前のアプリをアクティブ化
  if let previousApp = previousApp {
    previousApp.activate(options: [.activateIgnoringOtherApps])
    usleep(150000) // 150ms
  }

  // 3. Command+Vキーイベント送信
  guard let source = CGEventSource(stateID: .hidSystemState) else { return }

  if let keyDown = CGEvent(keyboardEventSource: source, virtualKey: CGKeyCode(kVK_ANSI_V), keyDown: true),
     let keyUp = CGEvent(keyboardEventSource: source, virtualKey: CGKeyCode(kVK_ANSI_V), keyDown: false) {
    keyDown.flags = [.maskCommand]
    keyDown.post(tap: .cghidEventTap)
    usleep(10000) // 10ms
    keyUp.flags = [.maskCommand]
    keyUp.post(tap: .cghidEventTap)
  }
}
```

## ビルド手順

### 1. Swift側のビルド

```bash
npm run build:swift
```

これにより以下が実行される:

1. arm64向けにビルド
2. x86_64向けにビルド
3. lipoでユニバーサルバイナリを作成
4. `native/macos/IrukaAutomation/dist/IrukaAutomation` に配置

### 2. Electron統合

ビルドスクリプト `scripts/build-swift-bridge.js`:

```javascript
swift build -c release --arch arm64
swift build -c release --arch x86_64
lipo -create -output dist/IrukaAutomation \
  .build/arm64-apple-macosx/release/IrukaAutomation \
  .build/x86_64-apple-macosx/release/IrukaAutomation
```

### 3. バイナリ検索パス

`macAutomationBridge.js` は以下の順序で検索:

1. `process.env.IRUKA_AUTOMATION_BRIDGE_PATH`
2. `{appRoot}/mac-automation/IrukaAutomation`
3. `{appRoot}/bin/IrukaAutomation`
4. `{appRoot}/native/macos/IrukaAutomation/dist/IrukaAutomation`
5. `{appRoot}/native/macos/IrukaAutomation/.build/release/IrukaAutomation`

## デバッグ

### ログファイル

- **場所**: `/tmp/iruka_clipboard_debug.log`
- **内容**: タイムスタンプ付きイベントログ

```bash
# ログ確認
cat /tmp/iruka_clipboard_debug.log

# ログクリア
echo "" > /tmp/iruka_clipboard_debug.log
```

### ログ出力例

```
[2025-11-08 07:57:54 +0000] ClipboardHistoryWindow initialized
[2025-11-08 07:57:54 +0000] Captured previous app: TextEdit
[2025-11-08 07:58:12 +0000] Item clicked with text: テストテキスト...
[2025-11-08 07:58:12 +0000] Clipboard updated
[2025-11-08 07:58:12 +0000] Attempting to send paste command...
[2025-11-08 07:58:12 +0000] Accessibility permission: true
[2025-11-08 07:58:12 +0000] Using captured previous app: TextEdit
[2025-11-08 07:58:12 +0000] Activated previous app with ignore other apps option
[2025-11-08 07:58:12 +0000] Command+V sent successfully to TextEdit
```

## テスト手順

### 基本動作テスト

1. **ウィンドウ表示**

   ```
   1. テキストエディタを開く
   2. Command+Shift+V を押す
   3. ウィンドウがマウス位置に表示されることを確認
   ```

2. **クリップボード監視**

   ```
   1. 何かテキストをコピー
   2. 1秒以内にウィンドウに追加されることを確認
   3. 最新の項目が一番上に表示されることを確認
   ```

3. **クリック動作**

   ```
   1. アイテムにホバー → 背景色が変わることを確認
   2. アイテムをクリック → 緑色のフィードバックを確認
   3. クリック後、背景色が元に戻ることを確認
   ```

4. **ペースト機能**

   ```
   1. テキストエディタにフォーカスを当てる
   2. Command+Shift+V でウィンドウを表示
   3. アイテムをクリック
   4. テキストエディタにペーストされることを確認
   ```

5. **キーボード無効化**

   ```
   1. ウィンドウ表示中にキーボード入力
   2. 入力が無視されることを確認
   ```

6. **閉じるボタン**
   ```
   1. 左上の × をクリック
   2. ウィンドウが閉じることを確認
   ```

### アクセシビリティ権限テスト

```
1. システム設定でアクセシビリティ権限を削除
2. アイテムをクリック
3. 権限リクエストダイアログが表示されることを確認
4. 権限を付与
5. 再度アイテムをクリック
6. ペーストが動作することを確認
```

## トラブルシューティング

### ペーストが動作しない場合

1. **アクセシビリティ権限を確認**
   - システム設定 > プライバシーとセキュリティ > アクセシビリティ
   - IrukaAutomationが許可されているか確認

2. **ログを確認**

   ```bash
   cat /tmp/iruka_clipboard_debug.log
   ```

3. **前のアプリがキャプチャされているか確認**
   - ログに "Captured previous app: ..." が表示されているか

4. **Command+Vが送信されているか確認**
   - ログに "Command+V sent successfully" が表示されているか

### ウィンドウが表示されない場合

1. **バイナリが存在するか確認**

   ```bash
   ls -la native/macos/IrukaAutomation/dist/IrukaAutomation
   ```

2. **ビルドをやり直す**

   ```bash
   npm run build:swift
   ```

3. **プロセスをクリア**
   ```bash
   pkill -9 IrukaAutomation
   ```

## 既知の制限事項

1. **テキストのみサポート**
   - 画像やファイルなどのクリップボード内容は非サポート

2. **履歴の永続化なし**
   - ウィンドウを閉じると履歴が消える
   - アプリ再起動時にも履歴は残らない

3. **セキュアフィールドへのペースト**
   - パスワードフィールドなど、一部のセキュアフィールドには動作しない可能性

4. **フルスクリーンアプリ**
   - フルスクリーンアプリの上に表示されるが、一部環境で動作が不安定な場合がある

## 将来の改善案

1. 履歴の永続化（ファイルまたはデータベース）
2. 検索機能
3. カテゴリー分け（テキスト、URL、コードなど）
4. お気に入り機能
5. キーボードショートカットでのナビゲーション（上下矢印）
6. 画像プレビュー
7. 履歴のクリア機能
8. 設定画面（最大件数、ウィンドウサイズなど）
