# IrukaDark WinUI 3 Prototype

This folder contains the first-pass Windows implementation of IrukaDark built with the Windows App SDK 1.7 stack (`winui3`). The goal is to reproduce the macOS-first experience (always-on-top chat, global shortcuts, capture tooling, Gemini access) with a native Windows shell that can evolve into the primary Windows release.

## Repo structure

```
windows/
└── IrukaDark.WinUI/
    ├── IrukaDark.WinUI.sln
    └── src/IrukaDark.App/
        ├── IrukaDark.App.csproj         # Single-project MSIX WinUI app (net8.0)
        ├── App.xaml / App.xaml.cs       # Host/bootstrap + DI wiring
        ├── MainWindow.xaml(.cs)        # Chat shell + UI chrome
        ├── Services/                   # Always-on-top, hotkeys, capture, Gemini
        ├── ViewModels/MainViewModel.cs # Minimal reactive state
        ├── Models/                     # Hotkey + capture DTOs
        └── appsettings.json            # Gemini defaults (model, etc.)
```

## Feature highlights

- **Always-on-top mode** via `WindowCoordinator.SetAlwaysOnTop`, toggling between `Overlapped` and `CompactOverlay` presenters.
- **Global shortcuts** registered with Win32 `RegisterHotKey` and window subclassing. The UI surfaces registration status and watches for `WM_HOTKEY` to drive actions.
- **Interactive capture** streams frames using `Direct3D11CaptureFramePool` and persists PNGs to `%LocalAppData%\IrukaDark\captures` for Gemini vision requests.
- **Settings bridge** using `PreferencesService` that stores preferences in `%LocalAppData%\IrukaDark\irukadark.prefs.json`, mirroring the macOS schema for cross-platform reuse.
- **Gemini client** implemented with `HttpClient` + JSON payloads. Prompts are centralized in `PromptBuilder` so the eventual clipboard/selection integration just swaps in real text.
- **URL summaries** (`Alt+1`) and **deep dives** (`Alt+Shift+1`) mirror the macOS shortcuts by fetching page content, trimming it to 5 000 characters, and prompting Gemini for a digest or structured analysis.
- **Reply variations** (`Alt+T`), **pronunciation helper** (`Alt+Q`), and **social post drafts** (`Ctrl+Alt+1`) reuse the clipboard selection or detected URL to generate tailored outputs via Gemini.
- **Detailed screenshot analysis** (`Alt+Shift+S`) supplements the standard capture explain workflow with a deeper, structured breakdown.
- **Dependency injection** provided by `Microsoft.Extensions.Hosting` to keep services testable and make future unit tests straightforward.
- **Unit test harness** (`IrukaDark.App.Tests`) exercises prompt generation logic to keep language normalization in sync with macOS behavior.
- **Clipboard preservation** keeps the user's original clipboard contents intact after automation-triggered copies.
- **Transcript tools** add role filters and a draft preview box so QA/product can iterate on prompts without leaving the app.

## How to run (Windows 11 + VS 17.10+)

1. **Install tooling**
   - Visual Studio 2022 17.10 or newer with the _Windows application development_ workload.
   - Windows App SDK 1.7 (NuGet feeds are configured via the project file).
2. **Open the solution**
   - `windows/IrukaDark.WinUI/IrukaDark.WinUI.sln`
   - VS will restore NuGet packages and configure the single-project MSIX packaging tooling.
3. **Configure Gemini**
   - Start the app once, open the _Gemini_ section, paste your API key, press **Save**.
   - Settings persist to `%LocalAppData%\IrukaDark\irukadark.prefs.json`.
4. **Test the core scenarios**
   - Toggle **Always on top** to verify presenter transitions.

- Trigger hotkeys (`Alt+A`, `Alt+Shift+A`, `Alt+T`, `Alt+Q`, `Alt+1`, `Alt+Shift+1`, `Ctrl+Alt+1`, `Alt+R`, `Alt+S`, `Alt+Shift+S`) and confirm the status banner updates.
- Click **Capture Region** to launch the `GraphicsCapturePicker`; the first frame is saved to `%LocalAppData%\IrukaDark\captures` and surfaced in the status panel.
- Verify that clipboard-driven shortcuts push entries into the in-app transcript viewer.
- Use the filter combo box (All/User/Assistant) and preview box to drive manual Gemini calls.

5. **Run unit tests (optional)**
   - `dotnet test windows/IrukaDark.WinUI/IrukaDark.WinUI.sln -c Debug -f net8.0-windows10.0.19041.0`
   - or execute `.\build.ps1` inside `windows/IrukaDark.WinUI` for restore/build/test in one go.

## Next steps

- Hook saved captures into richer explain/translate flows (structured output, follow-up prompt chaining).
- Port the Electron renderer UX (chat transcript, command palette) into WinUI pages and controls, reusing `MainViewModel` as the state holder.
- Add x64 + ARM64 build configurations to your CI, signing the generated MSIX, and wiring winget/Store submission once functionality hardens.
- Introduce accessibility/UX polish (keyboard navigation in transcript filters, high-contrast theme parity).
