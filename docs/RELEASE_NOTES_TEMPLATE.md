# IrukaDark vX.Y.Z — Draft

Thank you for trying IrukaDark. This draft bundles unsigned builds for macOS, Windows, and Linux.

## Highlights

- New cross‑platform distributables
  - mac: Apple Silicon (arm64) and Universal (arm64+x64 via CI)
  - Windows: x64 + arm64 (NSIS installer)
  - Linux: x64 + arm64 (AppImage / deb)
- New icon pipeline using `IrukaDark_desktopicon.png` (transparent dolphin)
  - mac DMG volume iconも同一デザインに統一
- Settings now live in user data (portable mode available)
- In‑app AI Settings for `GEMINI_API_KEY` / `GEMINI_MODEL` / `WEB_SEARCH_MODEL`
- Update notifications (notification‑only; opens Releases page)
- INSTALL guides (EN/JA) and SHA256 checksums included

## What's Changed

- Distribution & CI
  - Added GitHub Actions workflow to build for mac / win (x64+arm64) / linux (x64+arm64) and create a draft Release
  - Added automatic SHA256 generation (`dist/SHA256SUMS.txt` and sidecar `.sha256` files)
- App behavior
  - Settings are saved under user data by default
    - mac: `~/Library/Application Support/IrukaDark/irukadark.prefs.json`
    - Windows: `%APPDATA%/IrukaDark/irukadark.prefs.json`
    - Linux: `~/.config/IrukaDark/irukadark.prefs.json`
  - `.env.local` is no longer loaded by default; use `PORTABLE_MODE=1` to read/write `.env.local`
  - Added Help/IrukaDark menu: “Check for Updates…” and “Open Downloads Page”
  - Removed the initial Accessibility warning message from the chat timeline
- Packaging
  - DMG/NSIS/AppImage/deb outputs, artifact names include OS/arch
  - .icns / .ico generation from a single source PNG (multi‑size, transparent)

## Known Issues

- Unsigned builds will trigger OS warnings on first run.
  - See installation guides in `docs/INSTALL.md` / `docs/INSTALL.ja.md`.
- macOS: Accessibility permission may be required for automatic copy via shortcuts.
- Windows: SmartScreen may show “protected your PC”; click More Info → Run anyway.

## Downloads (Pick one)

- macOS Apple Silicon: `IrukaDark-*-mac-arm64.dmg`
- macOS Universal: `IrukaDark-*-mac-universal.dmg` (if attached)
- Windows (most PCs): `IrukaDark-*-win-x64.exe`
- Linux x64: `IrukaDark-*-linux-x86_64.AppImage` or `.deb`
- Linux arm64: `IrukaDark-*-linux-arm64.AppImage` or `.deb`

## Install Guides

- English: `docs/INSTALL.md`
- 日本語: `docs/INSTALL.ja.md`

## Checksums

- See `dist/SHA256SUMS.txt` or each artifact’s `.sha256` sidecar file.

## Notes

- Portable mode: set environment variable `PORTABLE_MODE=1` to read/write `.env.local` alongside the app.
- This draft is created by CI on tag push (e.g., `vX.Y.Z`) or manual dispatch.
