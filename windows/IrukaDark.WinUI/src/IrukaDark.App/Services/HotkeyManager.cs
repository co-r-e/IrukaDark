using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using IrukaDark.App.Models;
using Microsoft.UI.Xaml;
using WinRT.Interop;

namespace IrukaDark.App.Services;

public class HotkeyManager : IDisposable
{
    private const int WM_HOTKEY = 0x0312;
    private const nuint SUBCLASS_ID = 0xD4B00A1;

    private readonly Dictionary<int, HotkeyRegistration> _registrations = new();
    private SUBCLASSPROC? _proc;
    private nint _hwnd;
    private bool _isSubclassed;
    private int _nextId = 1;
    private bool _disposed;

    public event EventHandler<HotkeyRegistration>? HotkeyActivated;

    public void Initialize(Window window)
    {
        _hwnd = WindowNative.GetWindowHandle(window);
        if (_hwnd == nint.Zero)
        {
            throw new InvalidOperationException("Unable to obtain window handle for hotkeys.");
        }

        if (!_isSubclassed)
        {
            _proc = WindowProc;
            if (!SetWindowSubclass(_hwnd, _proc, SUBCLASS_ID, 0))
            {
                throw new InvalidOperationException("Failed to subclass window for hotkeys.");
            }

            _isSubclassed = true;
        }
    }

    public void RegisterDefaults()
    {
        RegisterHotkey(HotkeyActions.ExplainCompact, "Explain (compact)", Modifiers.MOD_ALT, VirtualKey.VK_A);
        RegisterHotkey(HotkeyActions.ExplainDetailed, "Explain (detailed)", Modifiers.MOD_ALT | Modifiers.MOD_SHIFT, VirtualKey.VK_A);
        RegisterHotkey(HotkeyActions.Translate, "Translate", Modifiers.MOD_ALT, VirtualKey.VK_R);
        RegisterHotkey(HotkeyActions.Screenshot, "Screenshot", Modifiers.MOD_ALT, VirtualKey.VK_S);
    }

    public IReadOnlyList<HotkeyRegistration> DescribeRegisteredHotkeys()
    {
        return new List<HotkeyRegistration>(_registrations.Values);
    }

    private void RegisterHotkey(string action, string description, Modifiers modifiers, VirtualKey key)
    {
        var id = _nextId++;
        if (!RegisterHotKey(_hwnd, id, (uint)modifiers, (uint)key))
        {
            _registrations[id] = new HotkeyRegistration(action, description, DescribeGesture(modifiers, key), "Registration failed");
            return;
        }

        _registrations[id] = new HotkeyRegistration(action, description, DescribeGesture(modifiers, key), "Ready");
    }

    private string DescribeGesture(Modifiers modifiers, VirtualKey key)
    {
        var parts = new List<string>();
        if (modifiers.HasFlag(Modifiers.MOD_CONTROL)) parts.Add("Ctrl");
        if (modifiers.HasFlag(Modifiers.MOD_ALT)) parts.Add("Alt");
        if (modifiers.HasFlag(Modifiers.MOD_SHIFT)) parts.Add("Shift");
        if (modifiers.HasFlag(Modifiers.MOD_WIN)) parts.Add("Win");
        parts.Add(key.ToString().Replace("VK_", string.Empty));
        return string.Join(" + ", parts);
    }

    private nint WindowProc(nint hwnd, uint msg, nint wParam, nint lParam, nuint uIdSubclass, nuint dwRefData)
    {
        if (msg == WM_HOTKEY)
        {
            var id = wParam.ToInt32();
            if (_registrations.TryGetValue(id, out var registration))
            {
                HotkeyActivated?.Invoke(this, registration);
            }
        }

        return DefSubclassProc(hwnd, msg, wParam, lParam);
    }

    public void Dispose()
    {
        if (_disposed)
        {
            return;
        }

        foreach (var id in new List<int>(_registrations.Keys))
        {
            UnregisterHotKey(_hwnd, id);
        }
        _registrations.Clear();

        if (_isSubclassed && _proc is not null)
        {
            RemoveWindowSubclass(_hwnd, _proc, SUBCLASS_ID);
            _isSubclassed = false;
        }

        _disposed = true;
    }

    [DllImport("user32.dll", SetLastError = true)]
    private static extern bool RegisterHotKey(nint hWnd, int id, uint fsModifiers, uint vk);

    [DllImport("user32.dll", SetLastError = true)]
    private static extern bool UnregisterHotKey(nint hWnd, int id);

    [DllImport("comctl32.dll", SetLastError = true)]
    private static extern bool SetWindowSubclass(nint hWnd, SUBCLASSPROC pfnSubclass, nuint uIdSubclass, nuint dwRefData);

    [DllImport("comctl32.dll", SetLastError = true)]
    private static extern bool RemoveWindowSubclass(nint hWnd, SUBCLASSPROC pfnSubclass, nuint uIdSubclass);

    [DllImport("comctl32.dll", SetLastError = true)]
    private static extern nint DefSubclassProc(nint hWnd, uint msg, nint wParam, nint lParam);

    private delegate nint SUBCLASSPROC(nint hWnd, uint msg, nint wParam, nint lParam, nuint uIdSubclass, nuint dwRefData);

    [Flags]
    private enum Modifiers : uint
    {
        MOD_NONE = 0x0000,
        MOD_ALT = 0x0001,
        MOD_CONTROL = 0x0002,
        MOD_SHIFT = 0x0004,
        MOD_WIN = 0x0008,
    }

    private enum VirtualKey : uint
    {
        VK_A = 0x41,
        VK_R = 0x52,
        VK_S = 0x53,
    }
}
