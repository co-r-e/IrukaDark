# IrukaDark

ローカル実行のAIチャット（macOS / Windows / Linux（実験的））。選択テキストの解説や通常チャットに加え、範囲選択スクリーンショットの解説も可能です（各OS対応）。

## 機能

- 常に最前面に表示されるチャットウィンドウ（フレームレス・リサイズ可）
- 全アプリ・全スペース（フルスクリーン上含む）で表示（メニューで切替）
- 右クリックでアプリケーションメニューをカーソル位置に表示
- 選択テキストをショートカットで即解説
  - 簡潔: mac: Option+A / Win/Linux: Alt+A
  - 詳細: mac: Option+Shift+A / Win/Linux: Alt+Shift+A
- 範囲スクリーンショットの解説（対話的な範囲選択）
  - mac: Option+S（詳細: Option+Shift+S）
  - Win/Linux: Alt+S（詳細: Alt+Shift+S）
- Gemini 2.5 Flash Lite 統合
- ロゴの小さな別窓を表示（メニューからON/OFF）
- ダーク/ライト対応のミニマルUI

## セットアップ（共通）

1. 依存関係のインストール:
```bash
npm install
```

2. 環境変数の設定:
`.env.local`ファイルを作成し、Gemini APIキーを設定してください：
```bash
cp .env.example .env.local
# .env.localファイルを編集してAPIキーを設定
```

3. アプリの起動:
```bash
npm start
```

### 前提ソフト/バージョン（共通）
- Node.js 18 以上（LTS 推奨）
- npm 9 以上

## 環境変数

`.env.local`ファイルに以下の環境変数を設定してください：

- `GEMINI_API_KEY`（必須）: Gemini APIキー（[Google AI Studio](https://makersuite.google.com/app/apikey)で取得）
- `GEMINI_MODEL`（任意）: 既定は `gemini-2.5-flash-lite`（例: `gemini-1.5-pro`, `gemini-2.0-flash`）
- `MENU_LANGUAGE`（任意）: `en` または `ja`（メニューからも切替可能）
- `UI_THEME`（任意）: `light` または `dark`（メニューからも切替可能）
- `GLASS_LEVEL`（任意）: `low` | `medium` | `high`
- `WINDOW_OPACITY`（任意）: `1`, `0.95`, `0.90`, `0.85`, `0.80`（メニューにも項目あり）
- `PIN_ALL_SPACES`（任意）: `1` で全アプリ・全スペースで前面固定、`0` で現在のスペース内に限定

## 使用方法

1. アプリを起動
2. テキストを選択してショートカット実行
   - 簡潔: mac: Option+A / Win/Linux: Alt+A
   - 詳細: mac: Option+Shift+A / Win/Linux: Alt+Shift+A
   - スクリーンショット解説: mac: Option+S / Win/Linux: Alt+S（範囲選択して解説）
   - スクリーンショット解説（詳細）: mac: Option+Shift+S / Win/Linux: Alt+Shift+S
3. 通常のチャットとしても利用できます（入力して送信）
4. 右クリックでアプリケーションメニューをカーソル位置に表示

### スラッシュコマンド

- `/clear`: チャット履歴をクリア
- `/compact`: 直近の履歴を要約してコンパクト化
- `/next`: 直前のAIメッセージの続きを生成
- `/contact`: 連絡先ページを開く（固定: https://co-r-e.net/contact）

### コマンド候補（サジェスト）
- 入力欄で「/」を入力すると候補が開きます
- 上下矢印 または Tab/Shift+Tab で移動、Enter で決定（実行）、Esc で閉じる
- 候補のクリックでも実行可能

## OS別ガイド

### macOS
- 対応: macOS 11 Big Sur 以降（Intel / Apple Silicon）
- グローバルショートカット:
  - 即解説: Option+A（競合時は Cmd+Option+A に自動切替）
  - 詳細解説: Option+Shift+A（競合時は Cmd+Option+Shift+A に自動切替）
  - スクリーンショット解説: Option+S（競合時は Cmd+Option+S に自動切替）
  - スクリーンショット解説（詳しく）: Option+Shift+S（競合時は Cmd+Option+Shift+S に自動切替）
- 権限: 初回に「アクセシビリティ」の許可が必要な場合があります（自動コピーに使用）
  - システム設定 > プライバシーとセキュリティ > アクセシビリティ で付与
  - 権限がない場合は、手動コピー（Cmd+C）→ Option+A でも動作します
- 全アプリ・全スペースで表示: メニュー（表示 > 外観）から ON/OFF 切替可能

### Windows
- 対応: Windows 10 / 11（64bit）
- グローバルショートカット:
  - 即解説: Alt+A（競合時は Ctrl+Alt+A に自動切替）
  - 詳細解説: Alt+Shift+A（競合時は Ctrl+Alt+Shift+A に自動切替）
  - スクリーンショット解説: Alt+S（競合時は Ctrl+Alt+S に自動切替）
  - スクリーンショット解説（詳しく）: Alt+Shift+S（競合時は Ctrl+Alt+Shift+S に自動切替）
  - 実装: WindowsのスニッピングUI（ms-screenclip）を起動し、選択後にクリップボードの画像を読み取ります。
  - 何も起きない場合は、Snipping Tool が有効であること、クリップボードへのアクセスが許可されていることをご確認ください。
  - 追加権限: 不要（アクセシビリティ権限は不要です）

### メニュー（全OS共通）
- 右クリックでアプリメニュー（メニューバー相当）をカーソル位置に表示
- 表示 > 外観: テーマ、ウィンドウ不透明度、「全アプリ・全スペースで表示」を切替
- 言語: 日本語/English を切替
- ロゴ別窓を表示: ロゴの小型フローティングウィンドウをON/OFF

### Linux（実験的）
- 対応: Ubuntu 20.04+（x64/arm64 目安）
- グローバルショートカット:
  - 即解説: Alt+A（競合時は Ctrl+Alt+A に自動切替）
  - 詳細解説: Alt+Shift+A（競合時は Ctrl+Alt+Shift+A に自動切替）
  - スクリーンショット解説: Alt+S（競合時は Ctrl+Alt+S に自動切替）
  - スクリーンショット解説（詳しく）: Alt+Shift+S（競合時は Ctrl+Alt+Shift+S に自動切替）
- 権限: 追加権限は不要
- スクリーンショット解説: 以下の順に実行を試みます — gnome-screenshot、Spectacle、grim+slurp（Wayland）、maim（X11）。いずれも無い場合は何も起きません。
- 注意: Wayland/X11 の構成により挙動が異なります。上記ツールのいずれかをインストールしてください。

## 必要な権限

- macOS: **アクセシビリティ**の許可（Option+A 自動コピーに必要）
  - 自動コピーが不要な場合は手動コピー（Cmd+C）で代替可能
- Windows: 追加権限なし

## 実行のみ（ビルドなし）

本プロジェクトは「git clone → .env.local → npm start」でのローカル実行を前提としています。アプリ配布用のビルドは行いません。

## カスタマイズ

### ロゴとファビコンの変更

アプリ内のアイコン画像を変更するには：

1. **ファビコン**: `/src/renderer/assets/icons/favicon.svg` を置き換え
2. **別窓ロゴ**: `/src/renderer/assets/icons/irukadark_logo.svg` を置き換え

SVGファイルを使用することで、高解像度画面でもクリアに表示されます。

### 推奨仕様
- **ファビコン**: 32x32px、シンプルなデザイン
- **ロゴ**: 40x40px、アプリのテーマに合わせたデザイン

## 補足・注意

- macOS / Windows に対応（Linuxは実験的サポート）
- macOSでは「アクセシビリティ」の許可が必要な場合があります（自動コピー機能）
- Gemini APIキーが必須です
- 企業ネットワーク環境では外向きHTTPS（Gemini API）への接続許可が必要です

## ショートカットと入力

- 送信: Enter（改行は Shift+Enter）
- AI解説（グローバル・簡潔）: mac: Option+A / Win/Linux: Alt+A（競合時は起動時トーストで実際の割当を案内）
- AI解説（グローバル・詳細）: mac: Option+Shift+A / Win/Linux: Alt+Shift+A（競合時は代替キーへ自動切替）
- 右クリック: アプリメニュー（メニューバー相当）をカーソル位置に表示
- 補完操作: 上下矢印 または Tab/Shift+Tab で移動、Enter 決定、Esc 閉じる
- 編集: コピー/貼り付け/全選択など標準ショートカットが有効（Cmd または Ctrl）

## プライバシー

- スクリーンショットは、Option/Alt+S を押して範囲選択した時のみ取得し、解説のために Gemini API へ送信します（保存はしません）。
- Option/Alt+A 使用時は選択テキストを自動取得（macOSはアクセシビリティ権限が必要）
- 自動取得が不要な場合は手動コピー（Cmd/Ctrl+C）で代替可能

## ライセンス

MIT License

詳細はリポジトリの [LICENSE](LICENSE) を参照してください。
