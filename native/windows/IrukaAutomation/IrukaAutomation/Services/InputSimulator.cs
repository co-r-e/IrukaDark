using System.Runtime.InteropServices;

namespace IrukaAutomation.Services;

/// <summary>
/// Service for simulating keyboard input using Win32 SendInput API.
/// </summary>
public static class InputSimulator
{
    // Win32 API imports
    [DllImport("user32.dll", SetLastError = true)]
    private static extern uint SendInput(uint nInputs, INPUT[] pInputs, int cbSize);

    [DllImport("user32.dll")]
    private static extern IntPtr GetForegroundWindow();

    [DllImport("user32.dll")]
    private static extern bool SetForegroundWindow(IntPtr hWnd);

    // Virtual key codes
    private const ushort VK_CONTROL = 0x11;
    private const ushort VK_C = 0x43;
    private const ushort VK_V = 0x56;

    // Input type constants
    private const uint INPUT_KEYBOARD = 1;
    private const uint KEYEVENTF_KEYUP = 0x0002;
    private const uint KEYEVENTF_EXTENDEDKEY = 0x0001;

    [StructLayout(LayoutKind.Sequential)]
    private struct INPUT
    {
        public uint type;
        public INPUTUNION union;
    }

    [StructLayout(LayoutKind.Explicit)]
    private struct INPUTUNION
    {
        [FieldOffset(0)]
        public KEYBDINPUT ki;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct KEYBDINPUT
    {
        public ushort wVk;
        public ushort wScan;
        public uint dwFlags;
        public uint time;
        public IntPtr dwExtraInfo;
    }

    /// <summary>
    /// Send Ctrl+C keystroke to copy selected text.
    /// </summary>
    /// <returns>True if successful</returns>
    public static bool SendCtrlC()
    {
        return SendKeyCombo(VK_CONTROL, VK_C);
    }

    /// <summary>
    /// Send Ctrl+V keystroke to paste clipboard content.
    /// </summary>
    /// <returns>True if successful</returns>
    public static bool SendCtrlV()
    {
        return SendKeyCombo(VK_CONTROL, VK_V);
    }

    /// <summary>
    /// Send a key combination (modifier + key).
    /// </summary>
    private static bool SendKeyCombo(ushort modifier, ushort key)
    {
        var inputs = new INPUT[4];

        // Modifier key down
        inputs[0].type = INPUT_KEYBOARD;
        inputs[0].union.ki.wVk = modifier;
        inputs[0].union.ki.dwFlags = 0;

        // Key down
        inputs[1].type = INPUT_KEYBOARD;
        inputs[1].union.ki.wVk = key;
        inputs[1].union.ki.dwFlags = 0;

        // Key up
        inputs[2].type = INPUT_KEYBOARD;
        inputs[2].union.ki.wVk = key;
        inputs[2].union.ki.dwFlags = KEYEVENTF_KEYUP;

        // Modifier key up
        inputs[3].type = INPUT_KEYBOARD;
        inputs[3].union.ki.wVk = modifier;
        inputs[3].union.ki.dwFlags = KEYEVENTF_KEYUP;

        var result = SendInput(4, inputs, Marshal.SizeOf<INPUT>());
        return result == 4;
    }

    /// <summary>
    /// Get the current foreground window handle.
    /// </summary>
    public static IntPtr GetCurrentForegroundWindow()
    {
        return GetForegroundWindow();
    }

    /// <summary>
    /// Set the foreground window.
    /// </summary>
    public static bool SetCurrentForegroundWindow(IntPtr hWnd)
    {
        return SetForegroundWindow(hWnd);
    }
}
