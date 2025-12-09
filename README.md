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
  - When Web Search is enabled, responses include reference badges you can click to view the source links.
- Optional floating logo popup window (toggle from menu)
- Clean, minimal UI with dark/light themes
- Slash command palette with suggestions, nested sub-commands, and multi-language `/translate`
- Clipboard history with color code preview (HEX, RGB, HSL formats)
- Quick restart from tray menu
- Voice input support (speech-to-text for hands-free messaging)
- PDF content extraction (attach PDFs for AI analysis)
- Timer & Stopwatch with audio notifications
- Schedule feature for task management
- Window Control with 17 keyboard shortcuts for precise window positioning (half, quarters, thirds, multi-monitor)
- Custom Instructions to personalize AI response style

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

5. Build the macOS automation helper (macOS only, required once per toolchain update)

```bash
npm run build:swift
```

6. Get a Gemini API key
   - Create an API key in Google AI Studio (not Vertex service account).
7. Start the app

```bash
npm start
```

8. Set your API key in‑app (recommended)
   - macOS: App menu IrukaDark → AI Settings → Set GEMINI_API_KEY. You can also choose the model from the same menu.

Notes

- macOS may ask for Accessibility and Screen Recording permissions.
- The small logo popup toggles the main window; Option+A explains selected text.

Common fixes

- `API_KEY_INVALID`: wrong key type or pasted with spaces/quotes.
- `All model attempts failed`: the chosen model may not support Google Web Search tools, the API key could lack access, or the target site timed out. Switch to `gemini-2.5-flash` or retry later.
- `npm install` errors: check network/proxy.
- Option+A does nothing: ensure selection and required permissions; run `npm run build:swift` once to build the helper, then grant Accessibility access when prompted; try manual copy then Option+A if the selection app blocks automation.

### Prerequisites

- Node.js 18+ (LTS recommended)
- npm 9+
- Xcode Command Line Tools (Swift 5.9+) — required to build the macOS automation bridge helper

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
- `CLIPBOARD_MAX_WAIT_MS` (optional): Max wait for detecting a fresh copy after the shortcut (default: 1500ms)
- `IRUKA_AUTOMATION_BRIDGE_PATH` (optional): Absolute path to the Swift automation helper binary (useful for custom build pipelines)

Notes:

- Only Google AI Studio API Keys are supported; Vertex AI (service account/OAuth) is not wired in this repo.
- If multiple variables are set, the app prefers `GEMINI_API_KEY` and will skip invalid keys automatically.
- The first time you trigger a shortcut that reads the selection, macOS will prompt for Accessibility access for the bundled IrukaAutomation helper; allow it to enable CGEvent copy and AXSelectedText fallback.

## Architecture Overview

IrukaDark is built on Electron and splits the main and renderer responsibilities into small, focused modules. Use the layout below as a guide when adding features.

- `src/main.js` — Entry point that calls `src/main/bootstrap/app.js`.
- `src/main/bootstrap/app.js` — App initialization logic. Centralizes window creation, menu construction, IPC, and other startup flows.
- `src/main/ai.js` — SDK/REST wrapper that calls `@google/genai` `models.generateContent` for text generation (and Web Search tools when needed) through a single interface.
- `src/main/windows/` — Window utilities such as `WindowManager`.
- `src/main/services/` — Main‑process service layer: settings persistence (`preferences.js`) and controllers that apply UI settings (`settingsController.js`).
- `src/main/context.js` — Simple store that shares main and popup windows.
- `src/renderer/state/` — Client‑side renderer state (UI language, tone, etc.).
- `src/renderer/features/` — UI feature helpers such as slash‑command definitions.
- `src/renderer/app.js` — Renderer implementation that wires modules and drives the UI.

Design highlights:

1. Main‑process separation of concerns — settings save, window control, menu updates, and AI requests are split into modules so new features don’t pollute existing code.
2. Lean renderer state — language, tone, and slash commands are factored into separate files to keep UI logic readable.
3. Clear entry points — makes it obvious which files to edit, so new contributors can ramp up quickly.

### Settings storage

- App settings are stored in the user data directory and can be edited from the menu (AI Settings).
  - macOS: `~/Library/Application Support/IrukaDark/irukadark.prefs.json`
- No overrides via `.env.local` or environment variables; change settings from the in‑app menu.

## Usage

1. Launch the app
2. Select text and press the global shortcut
   - Concise: Option+A
   - Detailed: Option+Shift+A
   - URL summary: Option+Q (fetch + sanitize + quick digest)
   - URL analysis: Option+Shift+Q (fetch + sanitize + structured deep dive)
   - Translate: Option+R (pure translation into the UI language)
   - Screenshot explain: Option+S (interactive area selection)
   - Screenshot explain (detailed): Option+Shift+S
3. You can also chat normally by typing and sending
4. Right-click anywhere to open the application menu at the cursor
   - Even in detailed shortcut flows, the view auto-scrolls to the “Thinking…” indicator.

### URL shortcuts

- Summary (`Option+Q`): fetches the selected HTTP(S) URL inside the app, strips scripts/styles/markup, trims to ~5k characters, and prompts Gemini to return a four-sentence digest ordered as takeaway → importance → next step.
- Detailed (`Option+Shift+Q`): performs the same fetch/sanitization but requests a structured deep dive (overview, key points, background, risks, recommended actions) tailored to the UI language/tone.
- Requirements: selection must contain exactly one publicly reachable URL; paywalled or blocked pages may still fail to fetch and will surface an error message with next steps.
- Tips: reselect the URL and press the shortcut again if you want a different tone or model; shortcuts use the configured Gemini model unless overridden by `WEB_SEARCH_MODEL` when web search is enabled.

## Cleanup

- Remove build artifacts and OS cruft from your working tree:

```bash
npm run clean        # deletes dist/, build/, .DS_Store, common logs
npm run clean:dry    # preview what would be removed
```

Initial Layout

- On launch the logo popup appears near the right edge, vertically centered. The main window starts shown by default.
- Click the logo to toggle the main window.
- When Option+A produces an answer, the main window auto‑unhides non‑activating so you can see the result if it was hidden.
- Any link in chat output opens in your default browser (never inside the app window).

#### Heads‑up

- On some machines, the auto-copy used by Option+A can be blocked by OS settings, permissions, or other apps. If quick explain fails, use Option+S (area screenshot explain) instead — it works reliably in most cases and is often sufficient.
- Option+Q / Option+Shift+Q require that the highlighted text is a single HTTP(S) URL. The app fetches the page directly; private, paywalled, or JavaScript‑required sites may fail.
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

## License

IrukaDark is licensed under the GNU Affero General Public License v3.0. See `LICENSE` for the full text and obligations when conveying the application or operating it over a network.
