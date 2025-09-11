<p align="center">
  <img src="src/renderer/assets/icons/irukadark_logo.svg" alt="IrukaDark" width="120" />
</p>

# IrukaDark

[日本語 (Japanese)](README.ja.md)

Lightweight local AI chat (macOS / Windows / experimental Linux). Explain or translate selected text, or chat normally. Area screenshot explain is available on macOS/Windows/Linux.

- Downloads: see GitHub Releases (app shows “Check for Updates…” and “Open Downloads Page”).

## Features

- Always-on-top chat window (frameless, resizable)
- Show over all apps/spaces (macOS full-screen too) — toggle from menu
- Right-click anywhere to open the application menu at the cursor
- Identity auto-reply for “who are you?”/“tell me about yourself” prompts (short, branded)
- Explain selected text via global shortcut
  - Concise: mac: Option+A / Win/Linux: Alt+A
  - Detailed: mac: Option+Shift+A / Win/Linux: Alt+Shift+A
- Translate selected text via global shortcut
  - mac: Option+R / Win/Linux: Alt+R
- Area screenshot explain (interactive selection)
  - mac: Option+S (detailed: Option+Shift+S)
  - Win/Linux: Alt+S (detailed: Alt+Shift+S)
- Gemini integration via Google GenAI SDK (@google/genai) — default: 2.5 Flash Lite
- Optional floating logo popup window (toggle from menu)
- Clean, minimal UI with dark/light themes

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

- macOS: App menu IrukaDark → AI Settings → “Set GEMINI_API_KEY”.
- Windows/Linux: View → AI Settings → “Set GEMINI_API_KEY”.
- You can also set model preferences there.

Notes

- macOS may ask for Accessibility and Screen Recording permissions.
- The small logo popup toggles the main window; Option/Alt+A explains selected text.

Common fixes

- `API_KEY_INVALID`: wrong key type or pasted with spaces/quotes.
- `npm install` errors: check network/proxy.
- Option/Alt+A does nothing: ensure selection and required permissions; try manual copy then Option/Alt+A.

### Prerequisites

- Node.js 18+ (LTS recommended)
- npm 9+

## Installation / Distribution

- Unsigned build install guide: `docs/INSTALL.md` (English) / `docs/INSTALL.ja.md` (日本語)
- Releases: built installers and checksums are attached on the GitHub Releases page. The app can open it from Help/App menu.

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
- `SHORTCUT_MAX_TOKENS` (optional): Max output tokens for shortcut flows (Option/Alt+A,S). Default 1024; effective range 1–2048
- `SHOW_MAIN_ON_START` (optional): `1` to show the main window on launch (default: `1`)
- `POPUP_MARGIN_RIGHT` (optional): Initial right margin (in px) for the logo popup. Default: `0`

Notes:

- Only Google AI Studio API Keys are supported; Vertex AI (service account/OAuth) is not wired in this repo.
- If multiple variables are set, the app prefers `GEMINI_API_KEY` and will skip invalid keys automatically.

### Settings storage and portable mode

- Default: settings live in the user data directory and can be edited in‑app (AI Settings).
  - macOS: `~/Library/Application Support/IrukaDark/irukadark.prefs.json`
  - Windows: `%APPDATA%/IrukaDark/irukadark.prefs.json`
  - Linux: `~/.config/IrukaDark/irukadark.prefs.json`
- `.env.local` is NOT loaded by default. To use a portable `.env.local`, launch with `PORTABLE_MODE=1`.
- Portable mode reads/writes `.env.local` in the app folder and is handy for USB‑stick style use.

## Usage

1. Launch the app
2. Select text and press the global shortcut
   - Concise: mac: Option+A / Win/Linux: Alt+A
   - Detailed: mac: Option+Shift+A / Win/Linux: Alt+Shift+A
   - Translate: mac: Option+R / Win/Linux: Alt+R (pure translation into the UI language)
   - Screenshot explain: mac: Option+S / Win/Linux: Alt+S (interactive area selection)
   - Screenshot explain (detailed): mac: Option+Shift+S / Win/Linux: Alt+Shift+S
3. You can also chat normally by typing and sending
4. Right-click anywhere to open the application menu at the cursor
   - Even in detailed shortcut flows, the view auto-scrolls to the “Thinking…” indicator.

## Build Distributables

1. Install dev deps (electron + electron-builder)

```bash
npm install
```

2. Build for your OS

```bash
# macOS (Apple Silicon only)
npm run dist:mac
# macOS Universal (arm64+x64 merged)
npm run dist:mac:universal
# Windows (x64+arm64)
npm run dist:win
# Linux (x64+arm64)
npm run dist:linux
```

Outputs appear in `dist/` (e.g., `.dmg`, `.exe`, `.AppImage`, `.deb`).

Checksums

- Generate SHA256 sidecars and a manifest: `npm run checksums` → `dist/SHA256SUMS.txt`.

Signing

- Not configured by default. Unsigned builds will show OS warnings.

### Windows

- x64 build（recommended for users): `npm run dist:win:x64`
- arm64 build: `npm run dist:win:arm64`
- both (x64+arm64): `npm run dist:win`
- Produces NSIS installer `.exe` (one‑click). You can enable `createDesktopShortcut` etc. in `package.json > build.nsis` if desired.
- Optional code signing: set your certificate via environment variables supported by electron‑builder.

### Linux

- x64 build（most desktops): `npm run dist:linux:x64`
- arm64 build（e.g. ARM laptops/SBCs): `npm run dist:linux:arm64`
- both (x64+arm64): `npm run dist:linux`
- Produces `.AppImage` and `.deb`. Adjust targets in `package.json > build.linux` as needed.

### GitHub Actions

- `ci.yml`: on PRs/push to `main`, runs format check, lint, and a fast pack (`--dir`).
- `release.yml`: on tags matching `v*` or manual dispatch, builds installers for macOS/Windows/Linux, runs checksums, then drafts a GitHub Release and uploads all files from `dist/**`.

Release flow (recommended)

- Bump version: `npm version patch|minor|major`
- Push: `git push origin main && git push origin --tags`
- Wait for Actions; a Draft Release appears with installers and `SHA256SUMS.txt`. Review notes and Publish.

### Cleanup

- Remove build artifacts and OS cruft from your working tree:
  ```bash
  npm run clean       # deletes dist/, build/, .DS_Store, common logs
  npm run clean:dry   # preview what would be removed
  ```

Initial Layout

- On launch the logo popup appears near the right edge, vertically centered. The main window starts shown by default (configurable via `SHOW_MAIN_ON_START`).
- Click the logo to toggle the main window.
- When Option/Alt+A produces an answer, the main window auto‑unhides non‑activating so you can see the result if it was hidden.
- Any link in chat output opens in your default browser (never inside the app window).

#### Heads‑up

- On some machines, the auto‑copy used by Option/Alt+A can be blocked by OS settings, permissions, or other apps. If quick explain fails, use Option/Alt+S (area screenshot explain) instead — it works reliably in most cases and is often sufficient.
- On macOS, the app first tries to read selected text via Accessibility (AX) without touching the clipboard; only if that fails does it fall back to sending Cmd+C.
- If the main window is hidden when Option/Alt+A succeeds, it automatically reappears non‑activating so you can see the answer (your current app keeps focus).

### Slash Commands

- `/clear`: Clear chat history
- `/compact`: Summarize and compact recent history
- `/next`: Continue the last AI message
- `/table`: Reformat the last AI output into a table
- `/what do you mean?`: Clarify the last AI output in simpler terms
- `/contact`: Open the contact page
- `/websearch on|off|status` (alias: `/web`): Toggle or check web search

### Command Suggestions

- Type `/` in the input to open suggestions
- Navigate with ArrowUp/Down or Tab/Shift+Tab, confirm with Enter, close with Esc
- Click a suggestion to execute

## OS Guides

### macOS

- Supported: macOS 11 Big Sur or later (Intel / Apple Silicon)
- Global shortcuts:
  - Quick explain: Option+A (fallback: Cmd+Option+A)
  - Detailed explain: Option+Shift+A (fallback: Cmd+Option+Shift+A)
  - Translate: Option+R (fallback: Cmd+Option+R)
  - Screenshot explain: Option+S (fallback: Cmd+Option+S)
  - Screenshot explain (detailed): Option+Shift+S (fallback: Cmd+Option+Shift+S)
- Permissions: The app will preflight permissions on first launch (non-blocking)
  - Accessibility for auto-copy (Cmd+C injection)
  - Screen Recording for area screenshots (to allow interactive capture)
  - System Settings > Privacy & Security > Accessibility
  - If not granted, use manual copy (Cmd+C) then Option+A
- Show over all apps/spaces: toggle via View > Appearance > “Show Over All Apps/Spaces”

### Windows

- Supported: Windows 10 / 11 (64-bit)
- Global shortcuts:
  - Quick explain: Alt+A (fallback: Ctrl+Alt+A)
  - Detailed explain: Alt+Shift+A (fallback: Ctrl+Alt+Shift+A)
  - Translate: Alt+R (fallback: Ctrl+Alt+R)
  - Screenshot explain: Alt+S (fallback: Ctrl+Alt+S)
  - Screenshot explain (detailed): Alt+Shift+S (fallback: Ctrl+Alt+Shift+S)
- Permissions: None required
- Auto-copy: On Alt+A the app sends Ctrl+C to the foreground app and then reads the clipboard. If no fresh copy is detected, it shows an error instead of reusing stale clipboard content.
- Screenshot explain launches the Windows Snipping UI (ms-screenclip) for area selection and reads the clipped image from the clipboard.
- If nothing appears, ensure Snipping Tool is enabled and clipboard access is allowed.

### Menu (every OS)

- Right-click anywhere in the window to open the app menu at the cursor
- View > Appearance: theme, window opacity, and “Show Over All Apps/Spaces”
- Language: switch between English and Japanese
- Show Logo Popup: toggle a small floating logo window

### Linux (Experimental)

- Supported: Ubuntu 20.04+ (x64/arm64 indicative)
- Global shortcuts:
  - Quick explain: Alt+A (fallback: Ctrl+Alt+A)
  - Detailed explain: Alt+Shift+A (fallback: Ctrl+Alt+Shift+A)
  - Translate: Alt+R (fallback: Ctrl+Alt+R)
  - Screenshot explain: Alt+S (fallback: Ctrl+Alt+S)
  - Screenshot explain (detailed): Alt+Shift+S (fallback: Ctrl+Alt+Shift+S)
- Permissions: None required
- Screenshot explain attempts (in order): gnome-screenshot, Spectacle, grim+slurp (Wayland), or maim (X11). If none are available, the shortcut does nothing.
- When a fresh clipboard copy is not detected on Alt+A, the app tries to read the PRIMARY selection (wl-paste/xclip/xsel). If that is unavailable or empty, it shows an error.
- Behavior may differ across Wayland/X11 setups. Ensure one of the above tools is installed for area capture.

## Permissions

- macOS: Accessibility for auto-copy and AX selection read (required for Option+A)
- Windows/Linux: No extra permissions

## Portable mode (.env.local) — optional

If you prefer a file‑based configuration for portable use:

- Create `.env.local` in the project/app folder with:
  ```env
  GEMINI_API_KEY=your_key_here
  GEMINI_MODEL=gemini-2.5-flash-lite
  WEB_SEARCH_MODEL=gemini-2.5-flash
  ```
- Launch with `PORTABLE_MODE=1` so the app reads/writes `.env.local`.

## Shortcuts & Input

- Send: Enter (Shift+Enter for newline)
- Global explain (concise): mac: Option+A / Win/Linux: Alt+A (actual binding is shown via toast on startup if fallback applied)
- Global explain (detailed): mac: Option+Shift+A / Win/Linux: Alt+Shift+A (falls back to Ctrl+Alt+Shift+A where needed)
- Translate selection: mac: Option+R / Win/Linux: Alt+R (pure translation into the UI language)
- Suggestion list: ArrowUp/Down or Tab/Shift+Tab to move, Enter to confirm, Esc to close
- Edit: Standard copy/paste/select-all shortcuts (Cmd or Ctrl)

## Privacy

- Screenshots are captured only when you press Option/Alt+S and choose an area; the captured image is sent to Gemini API for analysis.
- Global explain uses selected text via clipboard (macOS auto-copy requires Accessibility)
- You can always copy manually (Cmd/Ctrl+C) before using the shortcut
- API keys are used only in the Electron main process, never exposed to the renderer.

## License

MIT License. See `LICENSE`.

## Implementation Notes

- Primary path: `@google/genai` SDK. If the local SDK shape is incompatible, falls back to Gemini REST.
- Response parsing supports Responses API (`output_text`) and classic candidates/parts shapes.

## Troubleshooting

- 400 API_KEY_INVALID: Use a valid Google AI Studio API Key. Generic Google API keys (e.g., Maps) will not work.
- Ensure `.env.local` contains one of the supported key variables; prefer `GEMINI_API_KEY`.
- If Option/Alt+A doesn’t work: Press manual copy once (mac: Cmd+C; Windows/Linux: Ctrl+C), then immediately press Option/Alt+A. This helps the app detect a fresh clipboard and proceed.
- Focus gotcha (Option/Alt+A): The shortcut sends Cmd/Ctrl+C to the foreground app. If IrukaDark is focused (frontmost), the copy targets IrukaDark, so no fresh clipboard is detected and the action fails. Fix:
  - Click the app that holds the selection to bring it to the front, then press Option/Alt+A.
  - Or press manual copy in that app (mac: Cmd+C; Windows/Linux: Ctrl+C) and immediately press Option/Alt+A.
  - If the floating window makes clicking the target app tricky, temporarily disable View > Appearance > “Show Over All Apps/Spaces”, click the target app, then try again.
- If the main window remains hidden after an answer, it should auto‑unhide non‑activating. If it doesn’t, check View > Appearance > “Show Over All Apps/Spaces”.
