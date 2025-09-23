<p align="center">
  <img src="src/renderer/assets/icons/irukadark_logo.svg" alt="IrukaDark" width="120" />
</p>

# IrukaDark

Lightweight local AI chat for macOS. Explain or translate selected text, or chat normally. Area screenshot explain is available.

## Features

- Always-on-top chat window (frameless, resizable)
- Show over all apps/spaces (macOS full-screen too) — toggle from menu
- Right-click anywhere to open the application menu at the cursor
- Identity auto-reply for “who are you?”/“tell me about yourself” prompts (short, branded)
- Explain selected text via global shortcut
  - Concise: Option+A
  - Detailed: Option+Shift+A
- Translate selected text via global shortcut
  - Option+R
- Area screenshot explain (interactive selection)
  - Option+S (detailed: Option+Shift+S)
- Gemini integration via Google GenAI SDK (@google/genai) — default: 2.5 Flash Lite
- Optional floating logo popup window (toggle from menu)
- Clean, minimal UI with dark/light themes
- Slash command palette with suggestions, nested sub-commands, and multi-language `/translate`

## Beginner Setup (Step‑by‑step)

This is a friendly, no‑experience‑required guide from nothing to “running”. Take it slow; you can’t break anything.

1. What you need (free)
   - Internet connection
   - A Google account (to get a Gemini API key)
2. Install Node.js (runtime)
   - Download the LTS version from nodejs.org and install.
   - Verify: `node -v` (18+) and `npm -v` (9+).
3. Get the project
   - Git clone (recommended) or download ZIP and unzip.
4. Install dependencies

```bash
npm install
```

5. Get a Gemini API key
   - Create an API key in Google AI Studio (not Vertex service account).
6. Start the app

```bash
npm start
```

7. Set your API key in‑app (recommended)
   - macOS: App menu IrukaDark → AI Settings → “Set GEMINI_API_KEY”。モデル設定も同メニューから可能です。

Notes

- macOS may ask for Accessibility and Screen Recording permissions.
- The small logo popup toggles the main window; Option+A explains selected text.

Common fixes

- `API_KEY_INVALID`: wrong key type or pasted with spaces/quotes.
- `npm install` errors: check network/proxy.
- Option+A does nothing: ensure selection and required permissions; try manual copy then Option+A.

### Prerequisites

- Node.js 18+ (LTS recommended)
- npm 9+

## Environment Variables

- `GEMINI_API_KEY` (required): Google AI Studio API Key
- Also supported: `GOOGLE_GENAI_API_KEY`, `GENAI_API_KEY`, `GOOGLE_API_KEY`, `NEXT_PUBLIC_GEMINI_API_KEY`, `NEXT_PUBLIC_GOOGLE_API_KEY`
- `GEMINI_MODEL` (optional): Defaults to `gemini-2.5-flash-lite` (e.g. `gemini-1.5-pro`, `gemini-2.0-flash`)
- `WEB_SEARCH_MODEL` (optional): Preferred model when web search is enabled (default: `gemini-2.5-flash`)
- `MENU_LANGUAGE` (optional): `en` or `ja` (can be changed from menu)
- `UI_THEME` (optional): `light` or `dark` (can be changed from menu)
- `GLASS_LEVEL` (optional): `low` | `medium` | `high`
- `WINDOW_OPACITY` (optional): `1`, `0.95`, `0.9`, `0.85`, `0.8` (also in menu)
- `PIN_ALL_SPACES` (optional): `1` to keep windows over all apps/spaces, `0` to limit to current space
- `ENABLE_GOOGLE_SEARCH` (optional): `1` to enable grounded web search (default: `0`)
- `CLIPBOARD_MAX_WAIT_MS` (optional): Max wait for detecting a fresh copy after the shortcut (default: 1200ms)
- `SHORTCUT_MAX_TOKENS` (optional): Max output tokens for shortcut flows (Option+A/S). Default 1024; effective range 1–2048
- `SHOW_MAIN_ON_START` (optional): `1` to show the main window on launch (default: `1`)
- `POPUP_MARGIN_RIGHT` (optional): Initial right margin (in px) for the logo popup. Default: `0`

Notes:

- Only Google AI Studio API Keys are supported; Vertex AI (service account/OAuth) is not wired in this repo.
- If multiple variables are set, the app prefers `GEMINI_API_KEY` and will skip invalid keys automatically.

## Architecture Overview

IrukaDark は Electron をベースに、メインプロセスとレンダラープロセスを薄い責務ごとに分割しています。今後の機能追加時は下記のレイアウトを参考にしてください。

- `src/main.js` — エントリポイント。内部で `src/main/bootstrap/app.js` を呼び出します。
- `src/main/bootstrap/app.js` — アプリの初期化ロジック。ウィンドウ生成、メニュー構築、IPC などの起動フローをここに集約しています。
- `src/main/windows/` — `WindowManager` などウィンドウ関連のユーティリティ。
- `src/main/services/` — 設定永続化 (`preferences.js`) や UI 設定を反映するコントローラ (`settingsController.js`) など、メインプロセスのサービス層。
- `src/main/context.js` — メイン／ポップアップウィンドウを共有するためのシンプルなストア。
- `src/renderer/state/` — UI 言語・トーンなどレンダラーのクライアントサイド状態。
- `src/renderer/features/` — スラッシュコマンド定義など UI 機能単位のヘルパー。
- `src/renderer/app.js` — レンダラーのメイン実装。上記モジュールを読み込みつつ UI を制御します。

構成の要点:

1. **メインプロセスの責務分離** — 設定保存、ウィンドウ制御、メニュー更新、AI リクエストなどをモジュール単位で分割し、新規機能が既存コードを汚さず追加できます。
2. **レンダラーの状態管理の薄型化** — 言語・トーン・スラッシュコマンドなどを別ファイルに切り出し、UI ロジックを読みやすくしています。
3. **再利用しやすい入口** — どのファイルを編集すればよいかが明確になり、開発チームが増えてもキャッチアップしやすい構造です。

### Settings storage and portable mode

- Default: settings live in the user data directory and can be edited in‑app (AI Settings).
  - macOS: `~/Library/Application Support/IrukaDark/irukadark.prefs.json`
- `.env.local` is NOT loaded by default. To use a portable `.env.local`, launch with `PORTABLE_MODE=1`.
- Portable mode reads/writes `.env.local` in the app folder and is handy for USB‑stick style use.

## Usage

1. Launch the app
2. Select text and press the global shortcut
   - Concise: Option+A
   - Detailed: Option+Shift+A
   - Translate: Option+R (pure translation into the UI language)
   - Screenshot explain: Option+S (interactive area selection)
   - Screenshot explain (detailed): Option+Shift+S
3. You can also chat normally by typing and sending
4. Right-click anywhere to open the application menu at the cursor
   - Even in detailed shortcut flows, the view auto-scrolls to the “Thinking…” indicator.

## Cleanup

- Remove build artifacts and OS cruft from your working tree:

```bash
npm run clean        # deletes dist/, build/, .DS_Store, common logs
npm run clean:dry    # preview what would be removed
```

Initial Layout

- On launch the logo popup appears near the right edge, vertically centered. The main window starts shown by default (configurable via `SHOW_MAIN_ON_START`).
- Click the logo to toggle the main window.
- When Option+A produces an answer, the main window auto‑unhides non‑activating so you can see the result if it was hidden.
- Any link in chat output opens in your default browser (never inside the app window).

#### Heads‑up

- On some machines, the auto‑copy used by Option+A can be blocked by OS settings, permissions, or other apps. If quick explain fails, use Option+S (area screenshot explain) instead — it works reliably in most cases and is often sufficient.
- On macOS, the app first tries to read selected text via Accessibility (AX) without touching the clipboard; only if that fails does it fall back to sending Cmd+C.
- If the main window is hidden when Option+A succeeds, it automatically reappears non‑activating so you can see the answer (your current app keeps focus).

### Slash Commands

- `/clear`: Clear chat history
- `/compact`: Summarize and compact recent history
- `/next`: Continue the last AI message
- `/table`: Reformat the last AI output into a table
- `/what do you mean?`: Clarify the last AI output in simpler terms
- `/translate`: Open a submenu with language-specific commands that mirror every UI locale (e.g. `/translate_JA`, `/translate_fr`) to translate the latest AI reply.
- `/web`: Submenu with `/web on`, `/web off`, `/web status`
- `/contact`: Open the contact page
