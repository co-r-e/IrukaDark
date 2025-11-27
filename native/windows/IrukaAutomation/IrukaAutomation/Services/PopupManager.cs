using System.Runtime.InteropServices;
using System.Windows;
using System.Windows.Threading;
using IrukaAutomation.IPC;
using IrukaAutomation.UI.Windows;

namespace IrukaAutomation.Services;

/// <summary>
/// Manages the WPF popup window lifecycle.
/// Handles STA thread requirements and window positioning.
/// </summary>
public class PopupManager : IDisposable
{
    // Win32 API for cursor position
    [DllImport("user32.dll")]
    private static extern bool GetCursorPos(out POINT lpPoint);

    [StructLayout(LayoutKind.Sequential)]
    private struct POINT
    {
        public int X;
        public int Y;
    }

    private Thread? _uiThread;
    private Dispatcher? _dispatcher;
    private ClipboardPopupWindow? _window;
    private readonly ManualResetEventSlim _dispatcherReady = new(false);
    private readonly object _windowLock = new();
    private volatile bool _disposed;
    private volatile bool _isInitialized;

    // Events - raised on the UI thread, caller should handle thread marshaling if needed
    public event EventHandler<ClipboardItem>? ItemSelected;
    public event EventHandler? PopupClosed;

    /// <summary>
    /// Initialize the popup manager and start the STA thread.
    /// </summary>
    public void Initialize()
    {
        if (_isInitialized) return;

        _uiThread = new Thread(UIThreadStart)
        {
            Name = "WPF UI Thread",
            IsBackground = true
        };
        _uiThread.SetApartmentState(ApartmentState.STA);
        _uiThread.Start();

        // Wait for dispatcher to be ready with timeout
        if (!_dispatcherReady.Wait(10000))
        {
            throw new TimeoutException("WPF dispatcher failed to initialize");
        }

        _isInitialized = true;
    }

    private void UIThreadStart()
    {
        try
        {
            // Create dispatcher for this thread
            _dispatcher = Dispatcher.CurrentDispatcher;

            // Signal that dispatcher is ready
            _dispatcherReady.Set();

            // Run the dispatcher message loop
            Dispatcher.Run();
        }
        catch (Exception ex)
        {
            ConsoleOutput.WriteErrorLine($"UI Thread error: {ex.Message}");
        }
    }

    /// <summary>
    /// Show the popup window with the given items.
    /// </summary>
    public void ShowPopup(
        List<ClipboardItem> items,
        bool isDarkMode,
        double opacity,
        string? activeTab,
        string? snippetDataPath)
    {
        if (_disposed) return;

        if (!_isInitialized)
        {
            Initialize();
        }

        if (_dispatcher == null || !_dispatcher.CheckAccess())
        {
            _dispatcher?.BeginInvoke(() =>
            {
                ShowPopupInternal(items, isDarkMode, opacity, activeTab, snippetDataPath);
            });
        }
        else
        {
            ShowPopupInternal(items, isDarkMode, opacity, activeTab, snippetDataPath);
        }
    }

    private void ShowPopupInternal(
        List<ClipboardItem> items,
        bool isDarkMode,
        double opacity,
        string? activeTab,
        string? snippetDataPath)
    {
        try
        {
            lock (_windowLock)
            {
                // Close existing window if any
                if (_window != null)
                {
                    _window.ItemSelected -= Window_ItemSelected;
                    _window.PopupClosed -= Window_PopupClosed;
                    try { _window.Close(); } catch { }
                    _window = null;
                }

                // Get cursor position
                GetCursorPos(out var cursor);

                // Create new window
                _window = new ClipboardPopupWindow();

                // Set theme
                _window.SetDarkMode(isDarkMode);
                _window.Opacity = opacity;

                // Set active tab
                if (!string.IsNullOrEmpty(activeTab))
                {
                    _window.SetActiveTab(activeTab);
                }

                // Convert items to view models
                var viewModels = items.Select(i => new ClipboardItemViewModel
                {
                    Text = i.Text,
                    ImageData = i.ImageData,
                    ImageDataOriginal = i.ImageDataOriginal,
                    Timestamp = i.Timestamp
                }).ToList();

                _window.SetItems(viewModels);

                // Wire up events
                _window.ItemSelected += Window_ItemSelected;
                _window.PopupClosed += Window_PopupClosed;

                // Position window at cursor
                _window.Left = cursor.X;
                _window.Top = cursor.Y;

                // Show window
                _window.Show();
                _window.Activate();
                _window.Focus();
            }
        }
        catch (Exception ex)
        {
            ConsoleOutput.WriteErrorLine($"ShowPopup error: {ex.Message}");
        }
    }

    private void Window_ItemSelected(object? sender, ClipboardItemSelectedEventArgs e)
    {
        // Convert view model back to ClipboardItem
        var item = new ClipboardItem
        {
            Text = e.Item.Text,
            ImageData = e.Item.ImageData,
            ImageDataOriginal = e.Item.ImageDataOriginal,
            Timestamp = e.Item.Timestamp
        };

        // Clean up window reference
        lock (_windowLock)
        {
            if (_window != null)
            {
                _window.ItemSelected -= Window_ItemSelected;
                _window.PopupClosed -= Window_PopupClosed;
                _window = null;
            }
        }

        // Raise event (on UI thread - caller handles marshaling)
        ItemSelected?.Invoke(this, item);
    }

    private void Window_PopupClosed(object? sender, EventArgs e)
    {
        // Clean up
        lock (_windowLock)
        {
            if (_window != null)
            {
                _window.ItemSelected -= Window_ItemSelected;
                _window.PopupClosed -= Window_PopupClosed;
                _window = null;
            }
        }

        // Raise event
        PopupClosed?.Invoke(this, EventArgs.Empty);
    }

    /// <summary>
    /// Hide the popup window.
    /// </summary>
    public void HidePopup()
    {
        if (_disposed) return;

        _dispatcher?.BeginInvoke(() =>
        {
            lock (_windowLock)
            {
                if (_window != null)
                {
                    _window.ItemSelected -= Window_ItemSelected;
                    _window.PopupClosed -= Window_PopupClosed;
                    try { _window.Close(); } catch { }
                    _window = null;
                }
            }
        });
    }

    /// <summary>
    /// Update items in the popup window.
    /// </summary>
    public void UpdateItems(List<ClipboardItem> items)
    {
        if (_disposed) return;

        _dispatcher?.BeginInvoke(() =>
        {
            lock (_windowLock)
            {
                if (_window != null)
                {
                    var viewModels = items.Select(i => new ClipboardItemViewModel
                    {
                        Text = i.Text,
                        ImageData = i.ImageData,
                        ImageDataOriginal = i.ImageDataOriginal,
                        Timestamp = i.Timestamp
                    }).ToList();

                    _window.SetItems(viewModels);
                }
            }
        });
    }

    /// <summary>
    /// Update theme settings.
    /// </summary>
    public void UpdateTheme(bool isDarkMode, double opacity)
    {
        if (_disposed) return;

        _dispatcher?.BeginInvoke(() =>
        {
            lock (_windowLock)
            {
                if (_window != null)
                {
                    _window.SetDarkMode(isDarkMode);
                    _window.Opacity = opacity;
                }
            }
        });
    }

    /// <summary>
    /// Check if popup is currently showing.
    /// </summary>
    public bool IsShowing
    {
        get
        {
            if (_disposed || _dispatcher == null) return false;

            bool result = false;
            try
            {
                _dispatcher.Invoke(() =>
                {
                    lock (_windowLock)
                    {
                        result = _window?.IsVisible ?? false;
                    }
                }, DispatcherPriority.Send, CancellationToken.None, TimeSpan.FromMilliseconds(500));
            }
            catch
            {
                // Timeout or dispatcher shutdown
            }
            return result;
        }
    }

    public void Dispose()
    {
        if (_disposed) return;
        _disposed = true;

        try
        {
            // Close window on UI thread
            if (_dispatcher != null && !_dispatcher.HasShutdownStarted)
            {
                _dispatcher.BeginInvoke(() =>
                {
                    lock (_windowLock)
                    {
                        if (_window != null)
                        {
                            _window.ItemSelected -= Window_ItemSelected;
                            _window.PopupClosed -= Window_PopupClosed;
                            try { _window.Close(); } catch { }
                            _window = null;
                        }
                    }
                });

                // Shutdown dispatcher
                _dispatcher.BeginInvokeShutdown(DispatcherPriority.Background);
            }
        }
        catch
        {
            // Ignore errors during dispose
        }

        _dispatcherReady.Dispose();
    }
}
