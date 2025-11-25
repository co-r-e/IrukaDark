# IrukaDark アンインストール手順

macOSからIrukaDarkを完全にアンインストールする手順です。

## 1. アプリを終了する

アンインストール前に、IrukaDarkが実行中の場合は終了してください。

## 2. システム設定からプライバシー許可を削除（手動）

**システム設定 → プライバシーとセキュリティ** で以下の項目から「IrukaDark」を削除してください：

| 項目                 | 確認場所                                          |
| -------------------- | ------------------------------------------------- |
| アクセシビリティ     | プライバシーとセキュリティ → アクセシビリティ     |
| 画面収録             | プライバシーとセキュリティ → 画面収録             |
| オートメーション     | プライバシーとセキュリティ → オートメーション     |
| 入力監視             | プライバシーとセキュリティ → 入力監視             |
| フルディスクアクセス | プライバシーとセキュリティ → フルディスクアクセス |

> **注意**: これらの設定はファイル削除では消えません。必ずUIから手動で削除してください。

## 3. キーチェーンからエントリを削除（手動）

1. **キーチェーンアクセス** アプリを開く
2. 検索欄で「irukadark」を検索
3. 見つかったエントリを削除

## 4. アプリとファイルの削除（コマンド）

ターミナルで以下のコマンドを実行してください：

```bash
# アプリ本体
rm -rf /Applications/IrukaDark.app

# ユーザーデータ・設定
rm -rf ~/Library/Application\ Support/IrukaDark
rm -rf ~/Library/Preferences/com.core.irukadark.plist

# キャッシュ
rm -rf ~/Library/Caches/com.core.irukadark
rm -rf ~/Library/Caches/IrukaDark

# ログ
rm -rf ~/Library/Logs/IrukaDark

# 状態保存
rm -rf ~/Library/Saved\ Application\ State/com.core.irukadark.savedState

# WebKit関連
rm -rf ~/Library/WebKit/com.core.irukadark
rm -rf ~/Library/HTTPStorages/com.core.irukadark
rm -rf ~/Library/Cookies/com.core.irukadark.binarycookies

# クラッシュレポート
rm -rf ~/Library/Application\ Support/CrashReporter/IrukaDark*

# LaunchAgents（自動起動設定）
rm -rf ~/Library/LaunchAgents/com.core.irukadark*

# Containers
rm -rf ~/Library/Containers/com.core.irukadark
rm -rf ~/Library/Group\ Containers/*irukadark*
```

## 5. 一括実行スクリプト

上記のファイル削除をまとめて実行する場合：

```bash
#!/bin/bash
# IrukaDark 完全アンインストールスクリプト

echo "IrukaDarkを削除しています..."

rm -rf /Applications/IrukaDark.app
rm -rf ~/Library/Application\ Support/IrukaDark
rm -rf ~/Library/Preferences/com.core.irukadark.plist
rm -rf ~/Library/Caches/com.core.irukadark
rm -rf ~/Library/Caches/IrukaDark
rm -rf ~/Library/Logs/IrukaDark
rm -rf ~/Library/Saved\ Application\ State/com.core.irukadark.savedState
rm -rf ~/Library/WebKit/com.core.irukadark
rm -rf ~/Library/HTTPStorages/com.core.irukadark
rm -rf ~/Library/Cookies/com.core.irukadark.binarycookies
rm -rf ~/Library/Application\ Support/CrashReporter/IrukaDark*
rm -rf ~/Library/LaunchAgents/com.core.irukadark*
rm -rf ~/Library/Containers/com.core.irukadark
rm -rf ~/Library/Group\ Containers/*irukadark*

echo "ファイルの削除が完了しました。"
echo ""
echo "【重要】システム設定から以下の許可を手動で削除してください："
echo "  - アクセシビリティ"
echo "  - 画面収録"
echo "  - オートメーション"
echo "  - 入力監視"
echo "  - フルディスクアクセス"
```

## トラブルシューティング

### 再インストール後に許可ダイアログが毎回表示される場合

異なる署名のアプリを入れ替えた場合、macOSが古い許可情報を保持していることがあります。

1. 上記の手順で完全にアンインストール
2. **必ずシステム設定からプライバシー許可を削除**
3. 再インストール
4. 許可を再度付与

### アプリ情報

- **アプリ名**: IrukaDark
- **バンドルID**: `com.core.irukadark`
- **開発元**: CORe Inc.
