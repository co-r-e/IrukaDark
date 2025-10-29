using System;
using Microsoft.UI.Windowing;
using Microsoft.UI.Xaml;
using WinRT.Interop;

namespace IrukaDark.App.Services;

public class WindowCoordinator
{
    private AppWindow? _appWindow;
    private IntPtr _windowHandle;

    private const int DwmAttributeNcRenderingPolicy = 2;
    private const int DwmNcRenderingPolicyEnabled = 1;

    public void Attach(Window window)
    {
        var hwnd = WindowNative.GetWindowHandle(window);
        _windowHandle = hwnd;
        var windowId = Win32Interop.GetWindowIdFromWindow(hwnd);
        _appWindow = AppWindow.GetFromWindowId(windowId);
        EnableDropShadow();
    }

    public void SetAlwaysOnTop(bool isEnabled)
    {
        if (_appWindow is null)
        {
            return;
        }

        if (_appWindow.Presenter is not OverlappedPresenter presenter)
        {
            _appWindow.SetPresenter(AppWindowPresenterKind.Overlapped);
            presenter = _appWindow.Presenter as OverlappedPresenter;
        }

        if (presenter is null)
        {
            return;
        }

        presenter.IsAlwaysOnTop = isEnabled;
    }

    [System.Runtime.InteropServices.DllImport("dwmapi.dll", SetLastError = true)]
    private static extern int DwmSetWindowAttribute(
        IntPtr hwnd,
        int dwAttribute,
        ref int pvAttribute,
        int cbAttribute);

    private void EnableDropShadow()
    {
        if (_windowHandle == IntPtr.Zero)
        {
            return;
        }

        if (_appWindow is not null)
        {
            _appWindow.TitleBar.PreferredCornerRadius = new CornerRadius(12);
        }

        var policy = DwmNcRenderingPolicyEnabled;
        _ = DwmSetWindowAttribute(_windowHandle, DwmAttributeNcRenderingPolicy, ref policy, sizeof(int));
    }
}
