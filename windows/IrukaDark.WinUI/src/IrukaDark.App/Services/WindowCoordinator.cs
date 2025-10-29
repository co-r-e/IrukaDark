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
    private static readonly IntPtr HwndTopMost = new(-1);
    private static readonly IntPtr HwndNoTopMost = new(-2);
    private const uint SwpNosize = 0x0001;
    private const uint SwpNomove = 0x0002;
    private const uint SwpNoactivate = 0x0010;
    private const uint SwpShowwindow = 0x0040;

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
        if (_windowHandle == IntPtr.Zero)
        {
            return;
        }

        if (!SetWindowPos(
                _windowHandle,
                isEnabled ? HwndTopMost : HwndNoTopMost,
                0,
                0,
                0,
                0,
                SwpNomove | SwpNosize | SwpNoactivate | SwpShowwindow))
        {
            return;
        }

        if (!isEnabled && _appWindow is not null)
        {
            _appWindow.SetPresenter(AppWindowPresenterKind.Overlapped);
        }
    }

    [System.Runtime.InteropServices.DllImport("user32.dll", SetLastError = true)]
    private static extern bool SetWindowPos(
        IntPtr hWnd,
        IntPtr hWndInsertAfter,
        int X,
        int Y,
        int cx,
        int cy,
        uint uFlags);

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
