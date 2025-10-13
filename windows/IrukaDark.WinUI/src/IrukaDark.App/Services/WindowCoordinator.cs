using Microsoft.UI.Windowing;
using Microsoft.UI.Xaml;
using WinRT.Interop;

namespace IrukaDark.App.Services;

public class WindowCoordinator
{
    private AppWindow? _appWindow;

    public void Attach(Window window)
    {
        var hwnd = WindowNative.GetWindowHandle(window);
        var windowId = Win32Interop.GetWindowIdFromWindow(hwnd);
        _appWindow = AppWindow.GetFromWindowId(windowId);
    }

    public void SetAlwaysOnTop(bool isEnabled)
    {
        if (_appWindow is null)
        {
            return;
        }

        var presenter = isEnabled ? AppWindowPresenterKind.CompactOverlay : AppWindowPresenterKind.Overlapped;
        _appWindow.SetPresenter(presenter);
    }
}
