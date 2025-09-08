<p align="center">
  <img src="src/renderer/assets/icons/irukadark_logo.svg" alt="IrukaDark" width="120" />
</p>

# IrukaDark

[日本語 (Japanese)](README.ja.md)

Lightweight local AI chat (macOS / Windows / experimental Linux). Explain or translate selected text, or chat normally. Area screenshot explain is available on macOS/Windows/Linux.

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

1) What you need (free)
- Internet connection
- A Google account (to get a Gemini API key)

2) Install Node.js (the runtime the app needs)
- Download and install the LTS version from https://nodejs.org/
- Check versions after install:
  - macOS/Linux (Terminal): `node -v` and `npm -v`
  - Windows (PowerShell): `node -v` and `npm -v`
  - Aim for Node 18+ and npm 9+

3) Get this project onto your computer
- Recommended (Git):
  - SSH (if your SSH key is set up)
    ```bash
    git clone git@github.com:co-r-e/IrukaDark.git
    cd IrukaDark
    ```
  - HTTPS (if you don't use SSH)
    ```bash
    git clone https://github.com/co-r-e/IrukaDark.git
    cd IrukaDark
    ```
- Recommended is Git clone, but ZIP works too if you don’t use Git:
  - Click “Code > Download ZIP” on GitHub, download, then unzip (extract)
  - The folder name may be `IrukaDark-main` (that’s fine)
  - Now open that folder in Terminal/PowerShell or cd into it:
    - macOS (Finder → open in Terminal)
      1) Show the unzipped folder in Finder
      2) Open Terminal
      3) Type `cd ` (note the trailing space), then drag the folder from Finder into Terminal, press Enter
         Example: `cd /Users/you/Downloads/IrukaDark-main`
      4) Check with `pwd`
    - Windows (Explorer → open in PowerShell/Terminal)
      1) Open the unzipped folder in Explorer
      2) Windows 11: Right‑click → “Open in Terminal”
         Windows 10: Shift+Right‑click in the folder background → “Open PowerShell window here”
         Or type `powershell` in the Explorer address bar and press Enter
      3) Check with `Get-Location`
    - Linux (file manager → open in terminal)
      1) Open the unzipped folder
      2) Right‑click → “Open in Terminal” (wording varies by distro)
      3) If not available, use an existing terminal and `cd` there
         Example: `cd ~/Downloads/IrukaDark-main`

4) Install dependencies (takes a few minutes)
```bash
npm install
```
Notes: Warnings are usually fine. If you see ERRORS, check your internet or proxy settings.

5) Create `.env.local` (your private settings)
Goal: create a file named `.env.local` in the project folder (IrukaDark).

Method A: Copy from the template (easiest)
- macOS/Linux:
  ```bash
  cp .env.example .env.local
  ```
- Windows (PowerShell):
  ```powershell
  Copy-Item .env.example .env.local
  ```

Method B: Create it via GUI (right‑click)
- Windows (Explorer)
  1) Open the IrukaDark folder
  2) Right‑click > New > Text Document
  3) Rename the new file to `.env.local`
  4) If Windows warns about changing the extension, click “Yes”
  5) Open it in Notepad and edit it in the next step
  (From Notepad: File > Save As…; File name: `.env.local`; Save as type: “All Files”; Encoding: “UTF‑8”.)
- macOS (Finder + TextEdit)
  1) Open TextEdit > New Document
  2) Format > Make Plain Text (Shift+Cmd+T)
  3) File > Save, name: `.env.local`, location: the IrukaDark folder
  4) Save even if warned about extension
  (Finder itself doesn’t create dotfiles easily; using TextEdit’s Save is the most reliable.)
- Linux (File manager or editor)
  1) Open your text editor (gedit/Mousepad/etc.)
  2) Save As `.env.local` into the IrukaDark folder (UTF‑8)

Method C: Create it with a command
- macOS/Linux:
  ```bash
  touch .env.local
  ```
- Windows (PowerShell):
  ```powershell
  New-Item -Path .env.local -ItemType File -Force
  ```

Verify location (important)
- macOS/Linux:
  ```bash
  pwd
  ls -la .env.local
  ```
- Windows (PowerShell):
  ```powershell
  Get-Location
  dir -Force .env.local
  ```

6) Get a Gemini API key
- Open Google AI Studio and create an API Key (free tier available). Copy the key string.
- Use an AI Studio API key (not a Vertex AI service account key).

7) Put the key into `.env.local`
Edit with whichever you prefer
- GUI editors:
  - Windows: Right‑click `.env.local` > Open with Notepad > add one line then save
  - macOS: Right‑click `.env.local` > Open With > TextEdit
  - Linux: gedit/Mousepad/etc.
- Command line:
  - macOS/Linux: `nano .env.local` (save: Ctrl+O, exit: Ctrl+X)
  - Windows (PowerShell): `notepad .env.local`

Write exactly one line
```env
GEMINI_API_KEY=paste_the_key_here
```

Important tips
- No spaces around `=`
- No quotes around the key
- No leading/trailing spaces
- Save the file inside the IrukaDark folder (not your home folder)
- Keep this file private (don’t upload it to Git)

Confirm it’s saved
- macOS/Linux: `cat .env.local`
- Windows: `type .env.local`

8) Start the app
```bash
npm start
```
First run notes:
- macOS may ask for Accessibility and Screen Recording permissions. Please grant them (you can change later in System Settings).
- The main window opens by default. You’ll also see a small logo near the right edge; click it to show/hide the main window.
- Select some text in any app and press Option/Alt+A to get an instant explanation.

9) Common pitfalls (quick fixes)
- `API_KEY_INVALID`: The key in `.env.local` is wrong or not an AI Studio key. Check for spaces or quotes.
- `npm install` fails: Network/proxy issues are common. Retry later or configure HTTPS proxy (ask your network admin).
- Option/Alt+A does nothing: On macOS, grant Accessibility. On Windows/Linux, make sure text is selected in the foreground app. Manual copy (Cmd/Ctrl+C) then Option/Alt+A also works.
- Can’t find the window: Click the logo; or when Option/Alt+A returns an answer, the app auto‑unhides non‑activating.

### Prerequisites
- Node.js 18+ (LTS recommended)
- npm 9+

## Installation / Distribution

- Unsigned builds installation guide: see `docs/INSTALL.md`.

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

- By default, IrukaDark saves and reads settings only from the user data directory:
  - macOS: `~/Library/Application Support/IrukaDark/irukadark.prefs.json`
  - Windows: `%APPDATA%/IrukaDark/irukadark.prefs.json`
  - Linux: `~/.config/IrukaDark/irukadark.prefs.json`
- `.env.local` is no longer loaded by default (even in development). Use the in‑app menu (Right‑click → IrukaDark → AI Settings) to set `GEMINI_API_KEY`, `GEMINI_MODEL`, and `WEB_SEARCH_MODEL` at runtime.
- Portable mode: enable it via an OS environment variable `PORTABLE_MODE=1` before launching. In portable mode, settings are saved to and read from `.env.local` in the app folder.

## Usage

1) Launch the app
2) Select text and press the global shortcut
   - Concise: mac: Option+A / Win/Linux: Alt+A
   - Detailed: mac: Option+Shift+A / Win/Linux: Alt+Shift+A
   - Translate: mac: Option+R / Win/Linux: Alt+R (pure translation into the UI language)
   - Screenshot explain: mac: Option+S / Win/Linux: Alt+S (interactive area selection)
   - Screenshot explain (detailed): mac: Option+Shift+S / Win/Linux: Alt+Shift+S
3) You can also chat normally by typing and sending
4) Right-click anywhere to open the application menu at the cursor
   - Even in detailed shortcut flows, the view auto-scrolls to the “Thinking…” indicator.

## Build Distributables

1) Install dev deps (electron + electron-builder)
```bash
npm install
```
2) Build for your OS
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
Outputs appear in the `dist/` folder (e.g., `.dmg`, `.exe`, `.AppImage`). For macOS code signing/notarization and Windows code signing, provide credentials via environment variables or electron-builder config as needed. If you don’t sign, macOS Gatekeeper and Windows SmartScreen may warn on first run.

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

### GitHub Actions (CI)
- A cross‑platform workflow is included: `.github/workflows/release.yml`.
- Trigger manually (workflow_dispatch) or by pushing a `v*` tag. Artifacts are uploaded for each OS.

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

## Run-Only (No Build)
Designed for local run: clone → .env.local → npm start. No installer/build artifacts are provided.

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
 
