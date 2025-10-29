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
    private const int WH_KEYBOARD_LL = 13;
    private const int WM_KEYDOWN = 0x0100;
    private const int WM_KEYUP = 0x0101;
    private const int WM_SYSKEYDOWN = 0x0104;
    private const int WM_SYSKEYUP = 0x0105;
    private const nuint SUBCLASS_ID = 0xD4B00A1;

    private readonly Dictionary<string, HotkeyRegistration> _registrations = new();
    private readonly Dictionary<int, string> _systemHotkeys = new();
    private readonly Dictionary<(Modifiers modifiers, VirtualKey key), string> _fallbackHotkeys = new();
    private readonly HashSet<(Modifiers modifiers, VirtualKey key)> _activeFallbackKeys = new();

    private SUBCLASSPROC? _proc;
    private nint _hwnd;
    private bool _isSubclassed;
    private int _nextId = 1;
    private bool _disposed;

    private IntPtr _keyboardHook = IntPtr.Zero;
    private LowLevelKeyboardProc? _keyboardProc;
    private Modifiers _modifierState = Modifiers.MOD_NONE;

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
        RegisterHotkey(HotkeyActions.UrlSummary, "URL summary", Modifiers.MOD_ALT, VirtualKey.VK_1);
        RegisterHotkey(HotkeyActions.UrlDetailed, "URL deep dive", Modifiers.MOD_ALT | Modifiers.MOD_SHIFT, VirtualKey.VK_1);
        RegisterHotkey(HotkeyActions.Empathy, "Empathy reply", Modifiers.MOD_ALT | Modifiers.MOD_CONTROL, VirtualKey.VK_Z);
        RegisterHotkey(HotkeyActions.ReplyVariations, "Reply variations", Modifiers.MOD_ALT, VirtualKey.VK_Z);
        RegisterHotkey(HotkeyActions.Translate, "Translate", Modifiers.MOD_ALT, VirtualKey.VK_R);
        RegisterHotkey(HotkeyActions.SnsPost, "Social post", Modifiers.MOD_ALT | Modifiers.MOD_CONTROL, VirtualKey.VK_1);
        RegisterHotkey(HotkeyActions.Screenshot, "Screenshot", Modifiers.MOD_ALT, VirtualKey.VK_S);
        RegisterHotkey(HotkeyActions.ScreenshotDetailed, "Screenshot (detailed)", Modifiers.MOD_ALT | Modifiers.MOD_SHIFT, VirtualKey.VK_S);
        RegisterHotkey(HotkeyActions.Pronounce, "Pronounce selection", Modifiers.MOD_ALT, VirtualKey.VK_Q);
    }

    public IReadOnlyList<HotkeyRegistration> DescribeRegisteredHotkeys()
    {
        return new List<HotkeyRegistration>(_registrations.Values);
    }

    private void RegisterHotkey(string action, string description, Modifiers modifiers, VirtualKey key)
    {
        var gesture = DescribeGesture(modifiers, key);
        var id = _nextId++;

        if (RegisterHotKey(_hwnd, id, (uint)modifiers, (uint)key))
        {
            _systemHotkeys[id] = action;
            _registrations[action] = new HotkeyRegistration(action, description, gesture, "Ready");
            return;
        }

        EnsureKeyboardHook();
        var normalized = NormalizeModifiers(modifiers);
        _fallbackHotkeys[(normalized, key)] = action;
        _registrations[action] = new HotkeyRegistration(action, description, gesture, "Ready (fallback)");
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
            if (_systemHotkeys.TryGetValue(id, out var action) && _registrations.TryGetValue(action, out var registration))
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

        foreach (var id in new List<int>(_systemHotkeys.Keys))
        {
            UnregisterHotKey(_hwnd, id);
        }
        _systemHotkeys.Clear();
        _registrations.Clear();
        _fallbackHotkeys.Clear();
        _activeFallbackKeys.Clear();

        if (_keyboardHook != IntPtr.Zero)
        {
            UnhookWindowsHookEx(_keyboardHook);
            _keyboardHook = IntPtr.Zero;
            _keyboardProc = null;
        }

        if (_isSubclassed && _proc is not null)
        {
            RemoveWindowSubclass(_hwnd, _proc, SUBCLASS_ID);
            _isSubclassed = false;
        }

        _disposed = true;
    }

    private void EnsureKeyboardHook()
    {
        if (_keyboardHook != IntPtr.Zero)
        {
            return;
        }

        _keyboardProc = KeyboardProc;
        var moduleHandle = GetModuleHandle(null);
        _keyboardHook = SetWindowsHookEx(WH_KEYBOARD_LL, _keyboardProc, moduleHandle, 0);
        if (_keyboardHook == IntPtr.Zero)
        {
            _keyboardProc = null;
        }
    }

    private IntPtr KeyboardProc(int nCode, IntPtr wParam, IntPtr lParam)
    {
        if (nCode >= 0 && _fallbackHotkeys.Count > 0)
        {
            var message = wParam.ToInt32();
            if (message is WM_KEYDOWN or WM_SYSKEYDOWN or WM_KEYUP or WM_SYSKEYUP)
            {
                var info = Marshal.PtrToStructure<Kbdllhookstruct>(lParam);
                var key = (VirtualKey)info.VirtualKey;
                var isKeyDown = message is WM_KEYDOWN or WM_SYSKEYDOWN;
                var isKeyUp = message is WM_KEYUP or WM_SYSKEYUP;

                UpdateModifierState(key, isKeyDown, isKeyUp);

                if (isKeyDown)
                {
                    HandleFallbackTrigger(key);
                }
                else if (isKeyUp)
                {
                    HandleFallbackRelease(key);
                }
            }
        }

        return CallNextHookEx(_keyboardHook, nCode, wParam, lParam);
    }

    private void UpdateModifierState(VirtualKey key, bool isKeyDown, bool isKeyUp)
    {
        var modifier = key switch
        {
            VirtualKey.VK_LMENU or VirtualKey.VK_RMENU => Modifiers.MOD_ALT,
            VirtualKey.VK_LCONTROL or VirtualKey.VK_RCONTROL => Modifiers.MOD_CONTROL,
            VirtualKey.VK_LSHIFT or VirtualKey.VK_RSHIFT => Modifiers.MOD_SHIFT,
            VirtualKey.VK_LWIN or VirtualKey.VK_RWIN => Modifiers.MOD_WIN,
            _ => Modifiers.MOD_NONE
        };

        if (modifier == Modifiers.MOD_NONE)
        {
            return;
        }

        if (isKeyDown)
        {
            _modifierState |= modifier;
        }
        else if (isKeyUp)
        {
            _modifierState &= ~modifier;
            _activeFallbackKeys.Clear();
        }
    }

    private void HandleFallbackTrigger(VirtualKey key)
    {
        var normalized = NormalizeModifiers(_modifierState);
        var combination = (normalized, key);

        if (_fallbackHotkeys.TryGetValue(combination, out var action)
            && _activeFallbackKeys.Add(combination)
            && _registrations.TryGetValue(action, out var registration))
        {
            HotkeyActivated?.Invoke(this, registration);
        }
    }

    private void HandleFallbackRelease(VirtualKey key)
    {
        _activeFallbackKeys.RemoveWhere(entry => entry.key == key);
    }

    private static Modifiers NormalizeModifiers(Modifiers modifiers)
    {
        return modifiers & (Modifiers.MOD_ALT | Modifiers.MOD_CONTROL | Modifiers.MOD_SHIFT | Modifiers.MOD_WIN);
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

    [DllImport("user32.dll", SetLastError = true)]
    private static extern IntPtr SetWindowsHookEx(int idHook, LowLevelKeyboardProc lpfn, IntPtr hMod, uint dwThreadId);

    [DllImport("user32.dll", SetLastError = true)]
    private static extern bool UnhookWindowsHookEx(IntPtr hhk);

    [DllImport("user32.dll", SetLastError = true)]
    private static extern IntPtr CallNextHookEx(IntPtr hhk, int nCode, IntPtr wParam, IntPtr lParam);

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern IntPtr GetModuleHandle(string? lpModuleName);

    private delegate nint SUBCLASSPROC(nint hWnd, uint msg, nint wParam, nint lParam, nuint uIdSubclass, nuint dwRefData);

    private delegate IntPtr LowLevelKeyboardProc(int nCode, IntPtr wParam, IntPtr lParam);

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
        VK_1 = 0x31,
        VK_Z = 0x5A,
        VK_R = 0x52,
        VK_S = 0x53,
        VK_Q = 0x51,
        VK_LMENU = 0xA4,
        VK_RMENU = 0xA5,
        VK_LCONTROL = 0xA2,
        VK_RCONTROL = 0xA3,
        VK_LSHIFT = 0xA0,
        VK_RSHIFT = 0xA1,
        VK_LWIN = 0x5B,
        VK_RWIN = 0x5C,
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct Kbdllhookstruct
    {
        public uint VirtualKey;
        public uint ScanCode;
        public KbdllhookstructFlags Flags;
        public uint Time;
        public UIntPtr ExtraInfo;
    }

    [Flags]
    private enum KbdllhookstructFlags : uint
    {
        LLKHF_EXTENDED = 0x01,
        LLKHF_INJECTED = 0x10,
        LLKHF_ALTDOWN = 0x20,
        LLKHF_UP = 0x80,
    }
}
