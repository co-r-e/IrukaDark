<p align="center">
  <img src="src/renderer/assets/icons/irukadark_logo.svg" alt="IrukaDark" width="120" />
</p>

# IrukaDark

ローカル実行のAIチャット（macOS / Windows / Linux（実験的））。選択テキストの解説や通常チャットに加え、範囲選択スクリーンショットの解説も可能です（各OS対応）。

## 機能

- 常に最前面に表示されるチャットウィンドウ（フレームレス・リサイズ可）
- 全アプリ・全スペース（フルスクリーン上含む）で表示（メニューで切替）
- 右クリックでアプリケーションメニューをカーソル位置に表示
- 自己紹介の自動応答（「誰？」「どんなアプリ？」等に短くブランド回答）
- 選択テキストをショートカットで即解説
  - 簡潔: mac: Option+A / Win/Linux: Alt+A
  - 詳細: mac: Option+Shift+A / Win/Linux: Alt+Shift+A
- 範囲スクリーンショットの解説（対話的な範囲選択）
  - mac: Option+S（詳細: Option+Shift+S）
  - Win/Linux: Alt+S（詳細: Alt+Shift+S）
- Google GenAI SDK（@google/genai）経由のGemini統合（既定: 2.5 Flash Lite）
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
   - `.env.local` は配布物に含めません（APIキー保護）。
   

3. アプリの起動:
```bash
npm start
```

### 前提ソフト/バージョン（共通）
- Node.js 18 以上（LTS 推奨）
- npm 9 以上

## 環境変数

`.env.local`ファイルに以下の環境変数を設定してください：

- `GEMINI_API_KEY`（必須）: Google AI Studio の API キー
- 代替: `GOOGLE_GENAI_API_KEY` / `GENAI_API_KEY` / `GOOGLE_API_KEY` / `NEXT_PUBLIC_GEMINI_API_KEY` / `NEXT_PUBLIC_GOOGLE_API_KEY`
- `GEMINI_MODEL`（任意）: 既定は `gemini-2.5-flash-lite`（例: `gemini-1.5-pro`, `gemini-2.0-flash`）
- `WEB_SEARCH_MODEL`（任意）: ウェブ検索併用時に優先するモデル（既定: `gemini-2.5-flash`）
- `MENU_LANGUAGE`（任意）: `en` または `ja`（メニューからも切替可能）
- `UI_THEME`（任意）: `light` または `dark`（メニューからも切替可能）
- `GLASS_LEVEL`（任意）: `low` | `medium` | `high`
- `WINDOW_OPACITY`（任意）: `1`, `0.95`, `0.90`, `0.85`, `0.80`（メニューにも項目あり）
- `PIN_ALL_SPACES`（任意）: `1` で全アプリ・全スペースで前面固定、`0` で現在のスペース内に限定
- `ENABLE_GOOGLE_SEARCH`（任意）: `1` でウェブ検索による根拠付けを有効化（既定: `0`）
- `CLIPBOARD_MAX_WAIT_MS`（任意）: ショートカット後に新規コピーを検知する最大待機時間（既定: 1200ms）
- `SHORTCUT_MAX_TOKENS`（任意）: ショートカット経路（Option/Alt+A,S）の最大出力トークン数。既定 1024、実効範囲 1〜2048
 - `SHOW_MAIN_ON_START`（任意）: `1` で起動時にメインウィンドウを表示（既定: `0` で非表示スタート）
 - `POPUP_MARGIN_RIGHT`（任意）: ロゴ別窓の右端からの初期マージン（px）。既定: `24`

 

## 使用方法

1. アプリを起動
2. テキストを選択してショートカット実行
   - 簡潔: mac: Option+A / Win/Linux: Alt+A
   - 詳細: mac: Option+Shift+A / Win/Linux: Alt+Shift+A
   - スクリーンショット解説: mac: Option+S / Win/Linux: Alt+S（範囲選択して解説）
   - スクリーンショット解説（詳細）: mac: Option+Shift+S / Win/Linux: Alt+Shift+S
3. 通常のチャットとしても利用できます（入力して送信）
4. 右クリックでアプリケーションメニューをカーソル位置に表示
   - 詳細ショートカット中でも「考え中…」表示までは自動でスクロールします。

初期配置
- 起動時はロゴ別窓が「画面右寄り・縦中央」に表示され、メインウィンドウは非表示（既定）。
- ロゴをクリックするとメインウィンドウの表示/非表示を切替。
- Option/Alt+A で回答が生成された場合は、自動的に非アクティブ表示でメインを復帰します。

#### 注意
- 一部のPC環境では、Option/Alt+A の自動コピーがOS設定・権限・他アプリの影響でうまく動作しない場合があります。その際は Option/Alt+S のスクリーンショット解説をお使いください。多くのケースで十分実用的にご利用いただけます。
- macOS では、可能な場合アクセシビリティ（AX）経由で選択テキストを直接取得します。取得できない場合のみ Cmd+C の送出にフォールバックします。
- メインウィンドウを非表示にしていても、Option/Alt+A で回答が生成されたタイミングで自動的にウィンドウを表示します（フォーカスは奪いません）。

### スラッシュコマンド

- `/clear`: チャット履歴をクリア
- `/compact`: 直近の履歴を要約してコンパクト化
- `/next`: 直前のAIメッセージの続きを生成
- `/table`: 直前のAI出力を表形式に再構成
- `/what do you mean?`: 直前のAI出力をやさしく噛み砕いて説明
- `/contact`: 連絡先ページを開く
- `/websearch on|off|status`（`/web` でも可）: ウェブ検索の有効/無効/状態

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
- 権限: 初回起動時に権限のプリフライト（確認）を自動で行います（UI変更なし・非ブロッキング）
  - アクセシビリティ（自動コピーのための Cmd+C 送出）
  - 画面収録（範囲スクリーンショットの取得許可）
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
- 自動コピー: Alt+A で前面アプリに Ctrl+C を送出し、クリップボードを読み取ります。新規コピーを検知できない場合はエラー表示となり、既存のクリップボード内容は使いません。

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
- Alt+A で新規コピーを検知できない場合、PRIMARY 選択（wl-paste/xclip/xsel）を取得できればそれを用います。取得できない場合はエラー表示となります。
- 注意: Wayland/X11 の構成により挙動が異なります。上記ツールのいずれかをインストールしてください。

## 必要な権限

- macOS: **アクセシビリティ**の許可（Option+A の自動コピー／選択テキスト取得に必要）
  - 自動コピーが不要な場合は手動コピー（Cmd+C）でも動作します
- Windows/Linux: 追加権限なし

## 実行のみ（ビルドなし）

本プロジェクトは「git clone → .env.local → npm start」でのローカル実行を前提としています。アプリ配布用のビルドは行いません。

 
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
 - APIキーはElectronのメインプロセスでのみ使用され、レンダラには渡されません。

## ライセンス

MIT License

詳細はリポジトリの [LICENSE](LICENSE) を参照してください。

## 実装メモ
- 可能なら `@google/genai` SDK を使用し、ローカルのSDK形状が合わない場合はRESTにフォールバックします。
- 応答の取り出しは Responses API（`output_text`）と従来の candidates/parts 両形に対応しています。

## トラブルシューティング
- 400 API_KEY_INVALID が出る場合: Google AI Studio の有効なAPIキーを使用してください（一般的なGoogle API Keyでは動作しません）。
- `.env.local` には上記のいずれかのキー変数を設定してください。複数ある場合は `GEMINI_API_KEY` が優先され、無効キーは自動でスキップされます。
- Option/Alt+A がうまく動かない場合: 一度 手動でコピー（mac は Cmd+C、Windows/Linux は Ctrl+C）を押して、すぐに Option/Alt+A を押してみてください。新しいクリップボードの取得を検知できた場合に実行されます。
- フォーカスの注意（Option/Alt+A）: このショートカットは「現在フォーカスされているアプリ」に Cmd/Ctrl+C を送出します。IrukaDark が前面（フォーカス）になっていると、コピー対象が IrukaDark になり新しいクリップボードを検知できず失敗します。対処:
  - 目的のアプリ（テキストを選択しているウィンドウ）を一度クリックして前面にしてから Option/Alt+A を押す。
  - 目的のアプリで手動コピー（mac: Cmd+C／Windows/Linux: Ctrl+C）→ すぐに Option/Alt+A。
  - クリックしづらい場合は、メニュー「表示 > 外観 > 全アプリ・全スペースで表示」を一時的にOFFにして、対象アプリをクリックしてから実行する。
 - メインウィンドウが非表示のときに回答が出ても、自動で非アクティブ表示で復帰します。表示されない場合はメニューから「表示 > 外観 > 全アプリ・全スペースで表示」を確認してください。
