# IrukaDark

[日本語 (Japanese)](README.ja.md)

Lightweight local AI chat (macOS / Windows / experimental Linux). Explain selected text or chat normally. Area screenshot explain is available on macOS/Windows/Linux.

## Features

- Always-on-top chat window (frameless, resizable)
- Show over all apps/spaces (macOS full-screen too) — toggle from menu
- Right-click anywhere to open the application menu at the cursor
- Explain selected text via global shortcut
  - Concise: mac: Option+A / Win/Linux: Alt+A
  - Detailed: mac: Option+Shift+A / Win/Linux: Alt+Shift+A
- Area screenshot explain (interactive selection)
  - mac: Option+S (detailed: Option+Shift+S)
  - Win/Linux: Alt+S (detailed: Alt+Shift+S)
- Gemini 2.5 Flash Lite integration
- Optional floating logo popup window (toggle from menu)
- Clean, minimal UI with dark/light themes

## Setup (Common)

1) Install dependencies
```bash
npm install
```

2) Configure environment variables
```bash
cp .env.example .env.local
# Edit .env.local and set GEMINI_API_KEY
```

3) Start the app
```bash
npm start
```

### Prerequisites
- Node.js 18+ (LTS recommended)
- npm 9+

## Environment Variables

- `GEMINI_API_KEY` (required): Get from Google AI Studio
- `GEMINI_MODEL` (optional): Defaults to `gemini-2.5-flash-lite` (e.g. `gemini-1.5-pro`, `gemini-2.0-flash`)
- `MENU_LANGUAGE` (optional): `en` or `ja` (can be changed from menu)
- `UI_THEME` (optional): `light` or `dark` (can be changed from menu)
- `GLASS_LEVEL` (optional): `low` | `medium` | `high`
- `WINDOW_OPACITY` (optional): `1`, `0.95`, `0.9`, `0.85`, `0.8` (also in menu)
- `PIN_ALL_SPACES` (optional): `1` to keep windows over all apps/spaces, `0` to limit to current space

## Usage

1) Launch the app
2) Select text and press the global shortcut
   - Concise: mac: Option+A / Win/Linux: Alt+A
   - Detailed: mac: Option+Shift+A / Win/Linux: Alt+Shift+A
   - Screenshot explain: mac: Option+S / Win/Linux: Alt+S (interactive area selection)
   - Screenshot explain (detailed): mac: Option+Shift+S / Win/Linux: Alt+Shift+S
3) You can also chat normally by typing and sending
4) Right-click anywhere to open the application menu at the cursor

### Slash Commands
- `/clear`: Clear chat history
- `/compact`: Summarize and compact recent history
- `/next`: Continue the last AI message
- `/contact`: Open the contact page (fixed: https://co-r-e.net/contact)

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
  - Screenshot explain: Option+S (fallback: Cmd+Option+S)
  - Screenshot explain (detailed): Option+Shift+S (fallback: Cmd+Option+Shift+S)
- Permissions: May require Accessibility for auto-copy
  - System Settings > Privacy & Security > Accessibility
  - If not granted, use manual copy (Cmd+C) then Option+A
- Show over all apps/spaces: toggle via View > Appearance > “Show Over All Apps/Spaces”

### Windows
- Supported: Windows 10 / 11 (64-bit)
- Global shortcuts:
  - Quick explain: Alt+A (fallback: Ctrl+Alt+A)
  - Detailed explain: Alt+Shift+A (fallback: Ctrl+Alt+Shift+A)
  - Screenshot explain: Alt+S (fallback: Ctrl+Alt+S)
  - Screenshot explain (detailed): Alt+Shift+S (fallback: Ctrl+Alt+Shift+S)
- Permissions: None required
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
  - Screenshot explain: Alt+S (fallback: Ctrl+Alt+S)
  - Screenshot explain (detailed): Alt+Shift+S (fallback: Ctrl+Alt+Shift+S)
- Permissions: None required
- Screenshot explain attempts (in order): gnome-screenshot, Spectacle, grim+slurp (Wayland), or maim (X11). If none are available, the shortcut does nothing.
- Behavior may differ across Wayland/X11 setups. Ensure one of the above tools is installed for area capture.

## Permissions
- macOS: Accessibility for auto-copy (optional)
- Windows/Linux: No extra permissions

## Run-Only (No Build)
Designed for local run: clone → .env.local → npm start. No installer/build artifacts are provided.

## Shortcuts & Input
- Send: Enter (Shift+Enter for newline)
- Global explain (concise): mac: Option+A / Win/Linux: Alt+A (actual binding is shown via toast on startup if fallback applied)
- Global explain (detailed): mac: Option+Shift+A / Win/Linux: Alt+Shift+A (falls back to Ctrl+Alt+Shift+A where needed)
- Suggestion list: ArrowUp/Down or Tab/Shift+Tab to move, Enter to confirm, Esc to close
- Edit: Standard copy/paste/select-all shortcuts (Cmd or Ctrl)

## Privacy
- Screenshots are captured only when you press Option/Alt+S and choose an area; the captured image is sent to Gemini API for analysis.
- Global explain uses selected text via clipboard (macOS auto-copy requires Accessibility)
- You can always copy manually (Cmd/Ctrl+C) before using the shortcut

## License
MIT License. See `LICENSE`.
