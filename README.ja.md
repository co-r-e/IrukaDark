<p align="center">
  <img src="src/renderer/assets/icons/irukadark_logo.svg" alt="IrukaDark" width="120" />
</p>

# IrukaDark

ローカル実行のAIチャット（macOS / Windows / Linux（実験的））。選択テキストの解説・翻訳や通常チャットに加え、範囲選択スクリーンショットの解説も可能です（各OS対応）。

[English](README.md)

- ダウンロードは GitHub Releases を参照（アプリのメニューから「アップデートを確認…」「ダウンロードページを開く」でも移動できます）。

## 機能

- 常に最前面に表示されるチャットウィンドウ（フレームレス・リサイズ可）
- 全アプリ・全スペース（フルスクリーン上含む）で表示（メニューで切替）
- 右クリックでアプリケーションメニューをカーソル位置に表示
- 自己紹介の自動応答（「誰？」「どんなアプリ？」等に短くブランド回答）
- 選択テキストをショートカットで即解説
  - 簡潔: mac: Option+A / Win/Linux: Alt+A
  - 詳細: mac: Option+Shift+A / Win/Linux: Alt+Shift+A
- 選択テキストの翻訳（グローバルショートカット）
  - mac: Option+R / Win/Linux: Alt+R
- 範囲スクリーンショットの解説（対話的な範囲選択）
  - mac: Option+S（詳細: Option+Shift+S）
  - Win/Linux: Alt+S（詳細: Alt+Shift+S）
- Google GenAI SDK（@google/genai）経由のGemini統合（既定: 2.5 Flash Lite）
- ロゴの小さな別窓を表示（メニューからON/OFF）
- ダーク/ライト対応のミニマルUI

## 初心者向けセットアップ（かんたん・丁寧）

以下は「開発をやったことがない」方向けの、最短で動かすための手順です。ゆっくり一歩ずつ進めてください。途中でつまずいたら、最後の「よくあるつまずき」を見てください。

1. 事前に用意するもの（無料）

- インターネット接続
- Google アカウント（Gemini API キーの取得に必要）

2. Node.js を入れる（アプリを動かすための土台）

- 公式サイトから LTS（安定版）をダウンロードしてインストールします。
  - macOS/Windows: https://nodejs.org/ja の「LTS」を選択
  - Linux: ディストリ配布の Node でもOK（18以上）
- 入れたらバージョンを確認します。
  - macOS/Linux: ターミナルを開いて `node -v` と `npm -v`
  - Windows: 「PowerShell」を開いて `node -v` と `npm -v`
  - 目安: Node 18以上 / npm 9以上 が表示されればOK

3. このプロジェクトを手元に用意する

- できれば Git で clone（推奨）
  - macOS/Linux（ターミナル）/Windows（PowerShell）で実行:
    - SSH（SSH鍵を設定済みの方）
      ```bash
      git clone git@github.com:co-r-e/IrukaDark.git
      cd IrukaDark
      ```
    - HTTPS（SSH未設定の方向け）
      ```bash
      git clone https://github.com/co-r-e/IrukaDark.git
      cd IrukaDark
      ```
- 推奨は Git clone ですが、Git がない場合は ZIP でもOK です。
  - GitHub の「Code > Download ZIP」でダウンロード → 解凍（展開）
  - フォルダ名は `IrukaDark-main` などになることがあります（そのままでOK）
  - 次の手順で「そのフォルダをターミナル/PowerShellで開く」か「ターミナルからそのフォルダへ移動（cd）」します。
    - macOS（Finder → ターミナルで開く）
      1. Finderで解凍したフォルダを表示
      2. ターミナルを開く
      3. `cd ` と半角スペースを入力し、フォルダをターミナルへドラッグ&ドロップ → Enter
         （例）`cd /Users/あなたの名前/Downloads/IrukaDark-main`
      4. `pwd` で場所が合っているか確認
    - Windows（エクスプローラー → PowerShellで開く）
      1. エクスプローラーで解凍したフォルダを開く
      2. Windows 11: 右クリック > 「ターミナルで開く」
         Windows 10: フォルダ内の空白で Shift+右クリック > 「PowerShell ウィンドウをここで開く」
         もしくはアドレスバーに `powershell` と入力して Enter
      3. `Get-Location` で場所が合っているか確認
    - Linux（ファイルマネージャ → ターミナルで開く）
      1. ファイルマネージャで解凍したフォルダを開く
      2. 右クリック > 「端末で開く」（ディストリにより表記が異なります）
      3. もしメニューがない場合は、既存の端末で `cd` して移動
         （例）`cd ~/Downloads/IrukaDark-main`

4. 依存パッケージを入れる（少し時間がかかります）

```bash
npm install
```

・途中でWARNINGが出ても、基本は問題ありません。ERROR のときはネット接続やプロキシ設定を確認してください。

5. .env.local を作る（ポータブル運用時のみ・任意）
   注: 現在は既定で `.env.local` は不要です。アプリ内の「AI設定」から API キー等を入力できます。

方法A: 雛形からコピー（いちばん簡単）

- macOS/Linux（ターミナル）:
  ```bash
  cp .env.example .env.local
  ```
- Windows（PowerShell）:
  ```powershell
  Copy-Item .env.example .env.local
  ```

方法B: 右クリック/GUIで新規作成

- Windows（エクスプローラー）
  1. IrukaDark フォルダを開く
  2. 右クリック > 新規作成 > テキスト ドキュメント
  3. できた「新しいテキスト ドキュメント.txt」を「.env.local」にリネーム
  4. 拡張子を変更するか聞かれたら「はい」
  5. 以降はこのファイルをメモ帳で開いて編集します
     （メモ帳から作成する場合: [ファイル] > [名前を付けて保存]、名前を「.env.local」、ファイルの種類を「すべてのファイル」、エンコードは「UTF-8」を選んで保存）
- macOS（Finder + TextEdit）
  1. TextEdit を起動 > 新規作成
  2. メニュー [フォーマット] > [標準テキストにする]（Shift+Cmd+T）
  3. [ファイル] > [保存]、名前を「.env.local」、場所は IrukaDark フォルダを指定
  4. 「.env.local」という名前でそのまま保存（拡張子の警告が出てもOK）
     （Finder単独では拡張子なしの新規ファイルが作りにくいため、TextEditの保存を使うのが確実です）
- Linux（ファイルマネージャ or エディタ）
  1. gedit / Mousepad などのテキストエディタを開く
  2. 空のまま [名前を付けて保存]、名前を「.env.local」、場所は IrukaDark フォルダ
  3. 文字コードは UTF-8 を選択

方法C: コマンドで新規作成

- macOS/Linux:
  ```bash
  touch .env.local
  ```
- Windows（PowerShell）:
  ```powershell
  New-Item -Path .env.local -ItemType File -Force
  ```

できた場所の確認（大事）

- macOS/Linux:
  ```bash
  pwd         # いまの場所が IrukaDark か確認
  ls -la .env.local
  ```
- Windows（PowerShell）:
  ```powershell
  Get-Location        # いまの場所が IrukaDark か確認
  dir -Force .env.local
  ```

6. Gemini API キーを取得する

- ブラウザで Google AI Studio にアクセスし、API キーを作成します（無料枠あり）。
  - キーの名称は何でもOK。発行された英数字の文字列をコピーします。
  - 注意: Vertex AI（サービスアカウント）ではなく「Google AI Studio の API キー」を使ってください。

7. （ポータブル運用時のみ）.env.local を編集してキーを入れる
   編集方法（お好きな方法でOK）

- GUIエディタで開く:
  - Windows: `.env.local` を右クリック > メモ帳で開く > 1行だけ書いて保存
  - macOS: `.env.local` を右クリック > このアプリケーションで開く > テキストエディット
  - Linux: gedit / Mousepad などで開く
- コマンドラインで開く:
  - macOS/Linux: `nano .env.local` で開いて編集、Ctrl+O で保存、Ctrl+X で閉じる
  - Windows（PowerShell）: `notepad .env.local`

書く内容（1行だけ）

```env
GEMINI_API_KEY=ここに発行したキーを貼り付け
```

注意ポイント（超重要）

- `=` の左右にスペースを入れない
- 引用符（`"` や `'`）で囲まない
- 行頭・行末の空白を入れない
- 保存場所が IrukaDark フォルダ直下であること（間違ってホームフォルダに保存しない）
- このファイルは秘密情報です（Git等にアップしない）

保存できたかの確認

- macOS/Linux: `cat .env.local`
- Windows: `type .env.local`

8. アプリを起動する

```bash
npm start
```

- 初回のみ、macOS では「アクセシビリティ」や「画面収録」の許可ダイアログが出ることがあります。指示に従って許可してください（後から「システム設定 > プライバシーとセキュリティ」で変更可）。
- 起動直後にメインウィンドウが表示されます（既定設定）。さらに、画面右寄りに小さなロゴも表示され、クリックでメインウィンドウの表示/非表示を切り替えられます。
- 何か文章を選択して Option/Alt+A を押すと、内容を要約・解説してくれます。

9. よくあるつまずき（まずはここをチェック）

- `API_KEY_INVALID` と表示: `.env.local` のキーが間違っている可能性。貼り付けミス（空白・引用符）やキー種別（Google AI StudioのAPIキーか）を確認。
- `npm install` が失敗: ネットワーク・プロキシの影響が考えられます。時間をおいて再実行、または会社ネットワークのプロキシ設定（HTTPS_PROXY/NO_PROXY）を管理者に相談。
- Option/Alt+A が無反応: macOS は「アクセシビリティ」の許可が必要。Windows/Linux は前面アプリに選択テキストがあるか確認。手動でコピー（Cmd/Ctrl+C）→ すぐに Option/Alt+A でも可。
- ウィンドウが見当たらない: ロゴをクリック、または Option/Alt+A で回答が出ると自動で表示されます。

---

### 前提ソフト/バージョン（共通）

- Node.js 18 以上（LTS 推奨）
- npm 9 以上

## インストール / 配布

- 署名なしビルドの導入手順: `docs/INSTALL.ja.md`
- 配布物（インストーラ/チェックサム）は GitHub Releases に添付されます（アプリのメニューからも開けます）。

## 環境変数

以下の設定はアプリ内の「AI設定」から入力できます（または OS の環境変数や、ポータブル運用時の `.env.local` に指定可能）：

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
- `SHOW_MAIN_ON_START`（任意）: `1` で起動時にメインウィンドウを表示（既定: `1`）
- `POPUP_MARGIN_RIGHT`（任意）: ロゴ別窓の右端からの初期マージン（px）。既定: `0`

### 設定の保存場所とポータブルモード

- 既定では、実行時の各種設定は「ユーザーデータ領域」に保存・参照します（アプリ内の「AI設定」から編集）。
  - macOS: `~/Library/Application Support/IrukaDark/irukadark.prefs.json`
  - Windows: `%APPDATA%/IrukaDark/irukadark.prefs.json`
  - Linux: `~/.config/IrukaDark/irukadark.prefs.json`
- `.env.local` は既定では読み込みません。`PORTABLE_MODE=1` で起動した場合のみ、アプリフォルダ直下の `.env.local` を読み書きします。

## 使用方法

1. アプリを起動
2. テキストを選択してショートカット実行
   - 簡潔: mac: Option+A / Win/Linux: Alt+A
   - 詳細: mac: Option+Shift+A / Win/Linux: Alt+Shift+A
   - 翻訳: mac: Option+R / Win/Linux: Alt+R（UI言語へ純粋に翻訳）
   - スクリーンショット解説: mac: Option+S / Win/Linux: Alt+S（範囲選択して解説）
   - スクリーンショット解説（詳細）: mac: Option+Shift+S / Win/Linux: Alt+Shift+S
3. 通常のチャットとしても利用できます（入力して送信）
4. 右クリックでアプリケーションメニューをカーソル位置に表示
   - 詳細ショートカット中でも「考え中…」表示までは自動でスクロールします。

### クリーンアップ（作業フォルダの掃除）

- ビルド生成物や OS の不要ファイルを削除するユーティリティを用意しました。
  ```bash
  npm run clean       # dist/, build/, .DS_Store, 一部ログを削除
  npm run clean:dry   # 削除対象のプレビュー（実際には削除しません）
  ```

初期配置

- 起動時はロゴ別窓が「画面右寄り・縦中央」に表示され、メインウィンドウは表示（既定、`SHOW_MAIN_ON_START` で変更可）。
- ロゴをクリックするとメインウィンドウの表示/非表示を切替。
- Option/Alt+A で回答が生成された場合は、自動的に非アクティブ表示でメインを復帰します。
- チャット出力中のリンクは、常に既定のブラウザで開きます（アプリ内では遷移しません）。

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
  - 翻訳: Option+R（競合時は Cmd+Option+R に自動切替）
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
  - 翻訳: Alt+R（競合時は Ctrl+Alt+R に自動切替）
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
  - 翻訳: Alt+R（競合時は Ctrl+Alt+R に自動切替）
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

## ビルドと配布（開発者向け）

- 各OS向けにビルド:
  ```bash
  # macOS（Apple Silicon）
  npm run dist:mac
  # macOS Universal（arm64+x64結合）
  npm run dist:mac:universal
  # Windows（x64+arm64）
  npm run dist:win
  # Linux（x64+arm64）
  npm run dist:linux
  ```
- 生成物は `dist/` に出力（`.dmg`, `.exe`, `.AppImage`, `.deb` 等）
- チェックサム生成: `npm run checksums` → `dist/SHA256SUMS.txt` と各 `.sha256`
- 署名は既定で無効です（初回起動時にOSの警告が表示されます）。

### GitHub Actions（自動ビルド/リリース）

- `ci.yml`: PR/`main` への push で実行（format チェック / lint / 速いパック）
- `release.yml`: タグ `v*` の push（または手動起動）で macOS/Windows/Linux を並列ビルド → チェックサム生成 → Draft Release を作成し `dist/**` を全添付

リリース手順（推奨）
- バージョン上げ: `npm version patch|minor|major`
- push: `git push origin main && git push origin --tags`
- 完了後、Draft Release に各OSのインストーラと `SHA256SUMS.txt` が揃います。本文を整えて Publish。

### ポータブルモード（任意）

`.env.local` を使う運用が必要な場合:
```env
GEMINI_API_KEY=発行したキー
GEMINI_MODEL=gemini-2.5-flash-lite
WEB_SEARCH_MODEL=gemini-2.5-flash
```
`PORTABLE_MODE=1` を付けて起動すると `.env.local` を読み書きします。

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
