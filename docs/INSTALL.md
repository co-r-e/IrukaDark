# Installation (Unsigned Builds)

This guide covers local installation for non‑store, unsigned builds intended for evaluation or internal distribution.

## macOS

1) Open the DMG (e.g., `IrukaDark-1.0.0-mac-arm64.dmg`).
2) Drag `IrukaDark.app` to `Applications`.
3) First run (bypass Gatekeeper for unsigned apps):
   - In Finder, right‑click `Applications/IrukaDark.app` → Open → Open.
   - Alternatively, System Settings → Privacy & Security → Allow Anyway (at the bottom).

Optional (remove quarantine attribute):
```
xattr -dr com.apple.quarantine "/Applications/IrukaDark.app"
```

## Windows

1) Run the installer (e.g., `IrukaDark-1.0.0-win-x64.exe`).
2) If SmartScreen appears, click “More info” → “Run anyway”.
3) Default install is per‑user:
   - Typically: `%LOCALAPPDATA%\Programs\IrukaDark\IrukaDark.exe`

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

Use the `*-arm64` builds on ARM machines.

## Verify Downloads (optional)

- macOS / Linux:
```
shasum -a 256 <file>
```
- Windows (PowerShell):
```
certUtil -hashfile <file> SHA256
```
Compare with the publisher‑provided hash.

## First‑run Configuration (important)

- Right‑click → IrukaDark → “AI Settings”, then set:
  - `GEMINI_API_KEY` (required)
  - `GEMINI_MODEL` (optional, e.g., `gemini-2.5-flash-lite`)
  - `WEB_SEARCH_MODEL` (optional, e.g., `gemini-2.5-flash`)
  - `TONE` (optional: `formal` | `casual`; default: `casual`)
- Settings apply immediately and persist (no restart needed).

## Where settings are stored

By default, in the OS user‑data directory:

- macOS: `~/Library/Application Support/IrukaDark/irukadark.prefs.json`
- Windows: `%APPDATA%/IrukaDark/irukadark.prefs.json`
- Linux: `~/.config/IrukaDark/irukadark.prefs.json`

Portable mode (optional)

- Launch with environment variable `PORTABLE_MODE=1` to read/write `.env.local` next to the app instead.

## FAQ

- Signed?
  - These builds are unsigned. Use the OS steps above to allow the first launch.
- Can I edit `.env.local` directly?
  - Yes, when launching with `PORTABLE_MODE=1`. Otherwise use the in‑app AI Settings.
