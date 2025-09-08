# インストール手順（署名なし配布）

このドキュメントはストア未掲載・未署名ビルドの導入手順です。企業配布や個人検証向けに最小限の手順だけまとめています。

## macOS

1) DMG を開く（例: `IrukaDark-1.0.0-mac-arm64.dmg`）
2) 表示されたウィンドウで `IrukaDark.app` を `Applications` にドラッグ
3) 初回起動（未署名のため警告回避が必要）
   - Finder で `Applications/IrukaDark.app` を右クリック > 「開く」
   - 表示されたダイアログで「開く」を押す（次回以降は通常起動でOK）
   - 代替: システム設定 > プライバシーとセキュリティ 最下部に現れる許可ボタンからも許可可能

任意（ダウンロード属性の解除）
```
xattr -dr com.apple.quarantine "/Applications/IrukaDark.app"
```

## Windows

1) インストーラ（例: `IrukaDark-1.0.0-win-x64.exe`）を実行
2) SmartScreen が表示されたら「詳細情報」→「実行」を選択
3) 既定設定ではユーザー単位でインストールされます
   - 目安: `%LOCALAPPDATA%\Programs\IrukaDark\IrukaDark.exe`

## Linux

AppImage:
```
chmod +x IrukaDark-1.0.0-linux-x86_64.AppImage
./IrukaDark-1.0.0-linux-x86_64.AppImage
```

Debian/Ubuntu (.deb):
```
sudo apt install ./IrukaDark-1.0.0-linux-amd64.deb
```

arm64 版が必要な場合は、同名の `*-arm64` ビルドをご利用ください。

## ダウンロードの整合性確認（任意）

- macOS / Linux:
```
shasum -a 256 <ファイル名>
```
- Windows（PowerShell）:
```
certUtil -hashfile <ファイル名> SHA256
```
配布元が提示するハッシュ値と一致することを確認してください。

## 初期設定（重要）

- 右クリック > IrukaDark > 「AI設定」から以下を入力
  - `GEMINI_API_KEY`（必須）
  - `GEMINI_MODEL`（任意、例: `gemini-2.5-flash-lite`）
  - `WEB_SEARCH_MODEL`（任意、例: `gemini-2.5-flash`）
- 設定は即時反映・自動保存されます（再起動不要）

## 設定ファイルの保存場所

既定では OS のユーザーデータ領域に保存されます。

- macOS: `~/Library/Application Support/IrukaDark/irukadark.prefs.json`
- Windows: `%APPDATA%/IrukaDark/irukadark.prefs.json`
- Linux: `~/.config/IrukaDark/irukadark.prefs.json`

ポータブルモード（任意）

- 環境変数 `PORTABLE_MODE=1` で起動すると、設定をアプリフォルダの `.env.local` に保存・読み込みします。

## よくある質問

- Q: 署名していませんか？
  - A: はい、未署名ビルドです。上記の手順で初回だけ許可してください。
- Q: 単一のPCでだけ使うのに .env.local を直接いじりたい
  - A: `PORTABLE_MODE=1` で起動するか、AI設定メニューから入力してください。

