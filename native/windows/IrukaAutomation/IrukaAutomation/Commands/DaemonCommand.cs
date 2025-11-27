using System.Text.Json;
using IrukaAutomation.IPC;
using IrukaAutomation.Services;

namespace IrukaAutomation.Commands;

/// <summary>
/// Command to run as a daemon process.
/// Compatible with macOS Swift bridge "daemon" command.
/// Handles clipboard monitoring and popup window management.
/// </summary>
public static class DaemonCommand
{
    // Thread synchronization
    private static readonly object _stateLock = new();

    // State
    private static bool _running = true;
    private static bool _popupShowing = false;
    private static List<ClipboardItem> _currentItems = new();
    private static bool _isDarkMode = false;
    private static double _opacity = 1.0;
    private static string? _activeTab = "history";
    private static string? _snippetDataPath;

    // Clipboard monitoring
    private static Timer? _clipboardMonitorTimer;
    private static int _lastClipboardSequence;

    // Popup manager
    private static PopupManager? _popupManager;

    // Target window to restore focus after popup closes
    private static IntPtr _targetWindow = IntPtr.Zero;

    public static void Run()
    {
        try
        {
            // Initialize clipboard sequence on STA thread
            _lastClipboardSequence = StaHelper.RunSta(() => ClipboardService.GetSequenceNumber());

            // Initialize popup manager
            _popupManager = new PopupManager();
            _popupManager.ItemSelected += OnPopupItemSelected;
            _popupManager.PopupClosed += OnPopupWindowClosed;
            _popupManager.Initialize();

            // Start clipboard monitoring timer (check every 500ms)
            _clipboardMonitorTimer = new Timer(CheckClipboard, null, 500, 500);

            // Signal ready
            DaemonEvent.Ready().WriteToConsole();

            // Process stdin commands
            while (_running)
            {
                var line = Console.ReadLine();
                if (line == null)
                {
                    // stdin closed
                    break;
                }

                if (string.IsNullOrWhiteSpace(line))
                {
                    continue;
                }

                ProcessCommand(line);
            }
        }
        catch (Exception ex)
        {
            DaemonEvent.Error(ErrorCodes.Unknown, ex.Message).WriteToConsole();
        }
        finally
        {
            _clipboardMonitorTimer?.Dispose();
            _popupManager?.Dispose();
        }
    }

    private static void CheckClipboard(object? state)
    {
        try
        {
            // Run clipboard check on STA thread
            var (changed, item) = StaHelper.RunSta(() =>
            {
                var currentSequence = ClipboardService.GetSequenceNumber();
                if (currentSequence != _lastClipboardSequence)
                {
                    _lastClipboardSequence = currentSequence;
                    var clipboardItem = ClipboardService.GetCurrentClipboardItem();
                    return (true, clipboardItem);
                }
                return (false, (ClipboardItem?)null);
            });

            if (changed && item != null)
            {
                // Send clipboard change event
                var clipboardEvent = new DaemonEvent
                {
                    Event = "clipboard_changed",
                    Text = item.Text,
                    ImageDataOriginal = item.ImageDataOriginal
                };
                clipboardEvent.WriteToConsole();
            }
        }
        catch
        {
            // Ignore clipboard monitoring errors silently
        }
    }

    private static void ProcessCommand(string line)
    {
        try
        {
            var command = JsonSerializer.Deserialize(line, JsonContext.Default.DaemonCommand);
            if (command == null)
            {
                DaemonEvent.Error(ErrorCodes.InvalidJson, "Failed to parse command").WriteToConsole();
                return;
            }

            switch (command.Command.ToLowerInvariant())
            {
                case "ping":
                    DaemonEvent.Pong().WriteToConsole();
                    break;

                case "shutdown":
                    _running = false;
                    break;

                case "show":
                    HandleShow(command.Payload);
                    break;

                case "hide":
                    HandleHide();
                    break;

                case "update":
                    HandleUpdate(command.Payload);
                    break;

                default:
                    DaemonEvent.Error(ErrorCodes.UnknownCommand, $"Unknown command: {command.Command}").WriteToConsole();
                    break;
            }
        }
        catch (JsonException ex)
        {
            DaemonEvent.Error(ErrorCodes.InvalidJson, ex.Message).WriteToConsole();
        }
        catch (Exception ex)
        {
            DaemonEvent.Error(ErrorCodes.Unknown, ex.Message).WriteToConsole();
        }
    }

    private static void HandleShow(DaemonPayload? payload)
    {
        if (payload?.Items == null || payload.Items.Count == 0)
        {
            DaemonEvent.Error(ErrorCodes.NoItems, "No items provided").WriteToConsole();
            return;
        }

        lock (_stateLock)
        {
            // Store current state
            _currentItems = payload.Items;
            _isDarkMode = payload.IsDarkMode;
            _opacity = payload.Opacity;
            _activeTab = payload.ActiveTab;
            _snippetDataPath = payload.SnippetDataPath;
            _popupShowing = true;

            // Capture target window BEFORE showing popup
            _targetWindow = InputSimulator.GetCurrentForegroundWindow();
        }

        // Show popup using PopupManager
        _popupManager?.ShowPopup(
            _currentItems,
            _isDarkMode,
            _opacity,
            _activeTab,
            _snippetDataPath
        );

        DaemonEvent.Shown().WriteToConsole();
    }

    private static void HandleHide()
    {
        lock (_stateLock)
        {
            _popupShowing = false;
            _targetWindow = IntPtr.Zero;
        }
        _popupManager?.HidePopup();
        DaemonEvent.Hidden().WriteToConsole();
    }

    private static void HandleUpdate(DaemonPayload? payload)
    {
        if (payload?.Items == null)
        {
            DaemonEvent.Error(ErrorCodes.InvalidPayload, "No items in payload").WriteToConsole();
            return;
        }

        lock (_stateLock)
        {
            _currentItems = payload.Items;

            if (payload.IsDarkMode != _isDarkMode || payload.Opacity != _opacity)
            {
                _isDarkMode = payload.IsDarkMode;
                _opacity = payload.Opacity;
                _popupManager?.UpdateTheme(_isDarkMode, _opacity);
            }
        }

        _popupManager?.UpdateItems(_currentItems);
    }

    /// <summary>
    /// Called when user selects an item from the popup.
    /// </summary>
    private static void OnPopupItemSelected(object? sender, ClipboardItem item)
    {
        OnItemSelected(item);
    }

    /// <summary>
    /// Called when popup is closed without selection.
    /// </summary>
    private static void OnPopupWindowClosed(object? sender, EventArgs e)
    {
        OnPopupClosed();
    }

    /// <summary>
    /// Called when user selects an item from the popup.
    /// Pastes the item and sends the item_pasted event.
    /// </summary>
    public static void OnItemSelected(ClipboardItem item)
    {
        IntPtr targetWindow;
        lock (_stateLock)
        {
            _popupShowing = false;
            targetWindow = _targetWindow;
            _targetWindow = IntPtr.Zero;
        }

        try
        {
            // Set clipboard content on STA thread
            StaHelper.RunSta(() => ClipboardService.SetClipboardItem(item));

            // Wait a bit for clipboard to be set
            Thread.Sleep(50);

            // Small delay to let popup close
            Thread.Sleep(100);

            // Restore focus to original window if needed
            if (targetWindow != IntPtr.Zero)
            {
                InputSimulator.SetCurrentForegroundWindow(targetWindow);
                Thread.Sleep(50);
            }

            // Send Ctrl+V to paste
            InputSimulator.SendCtrlV();

            // Send item_pasted event
            DaemonEvent.ItemPasted(item.Text, item.ImageDataOriginal).WriteToConsole();
        }
        catch (Exception ex)
        {
            DaemonEvent.Error(ErrorCodes.Unknown, $"Paste failed: {ex.Message}").WriteToConsole();
        }
    }

    /// <summary>
    /// Called when popup is closed without selection.
    /// </summary>
    public static void OnPopupClosed()
    {
        lock (_stateLock)
        {
            _popupShowing = false;
            _targetWindow = IntPtr.Zero;
        }
        DaemonEvent.Hidden().WriteToConsole();
    }

    /// <summary>
    /// Check if popup is currently showing.
    /// </summary>
    public static bool IsPopupShowing
    {
        get
        {
            lock (_stateLock)
            {
                return _popupShowing;
            }
        }
    }

    /// <summary>
    /// Get current items.
    /// </summary>
    public static IReadOnlyList<ClipboardItem> CurrentItems
    {
        get
        {
            lock (_stateLock)
            {
                return _currentItems.ToList();
            }
        }
    }

    /// <summary>
    /// Get dark mode setting.
    /// </summary>
    public static bool IsDarkMode
    {
        get
        {
            lock (_stateLock)
            {
                return _isDarkMode;
            }
        }
    }

    /// <summary>
    /// Get opacity setting.
    /// </summary>
    public static double Opacity
    {
        get
        {
            lock (_stateLock)
            {
                return _opacity;
            }
        }
    }

    /// <summary>
    /// Get active tab.
    /// </summary>
    public static string? ActiveTab
    {
        get
        {
            lock (_stateLock)
            {
                return _activeTab;
            }
        }
    }

    /// <summary>
    /// Get snippet data path.
    /// </summary>
    public static string? SnippetDataPath
    {
        get
        {
            lock (_stateLock)
            {
                return _snippetDataPath;
            }
        }
    }
}
