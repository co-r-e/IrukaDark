using System.Runtime.InteropServices;
using System.Text;
using IrukaAutomation.IPC;

namespace IrukaAutomation.Services;

/// <summary>
/// Service for clipboard operations.
/// Uses Win32 API for clipboard access.
/// </summary>
public static class ClipboardService
{
    // Win32 API imports
    [DllImport("user32.dll")]
    private static extern int GetClipboardSequenceNumber();

    [DllImport("user32.dll")]
    private static extern bool OpenClipboard(IntPtr hWndNewOwner);

    [DllImport("user32.dll")]
    private static extern bool CloseClipboard();

    [DllImport("user32.dll")]
    private static extern bool EmptyClipboard();

    [DllImport("user32.dll")]
    private static extern IntPtr GetClipboardData(uint uFormat);

    [DllImport("user32.dll")]
    private static extern IntPtr SetClipboardData(uint uFormat, IntPtr hMem);

    [DllImport("user32.dll")]
    private static extern bool IsClipboardFormatAvailable(uint format);

    [DllImport("user32.dll")]
    private static extern uint RegisterClipboardFormat(string lpszFormat);

    [DllImport("kernel32.dll")]
    private static extern IntPtr GlobalLock(IntPtr hMem);

    [DllImport("kernel32.dll")]
    private static extern bool GlobalUnlock(IntPtr hMem);

    [DllImport("kernel32.dll")]
    private static extern IntPtr GlobalAlloc(uint uFlags, UIntPtr dwBytes);

    [DllImport("kernel32.dll")]
    private static extern UIntPtr GlobalSize(IntPtr hMem);

    // Clipboard formats
    private const uint CF_UNICODETEXT = 13;
    private const uint CF_DIB = 8;
    private const uint CF_DIBV5 = 17;
    private const uint GMEM_MOVEABLE = 0x0002;

    // Custom format IDs (registered at runtime)
    private static uint CF_RTF;
    private static uint CF_HTML;

    // Last known clipboard sequence number for change detection
    private static int _lastSequenceNumber;

    static ClipboardService()
    {
        // Register custom clipboard formats
        CF_RTF = RegisterClipboardFormat("Rich Text Format");
        CF_HTML = RegisterClipboardFormat("HTML Format");
        _lastSequenceNumber = GetClipboardSequenceNumber();
    }

    /// <summary>
    /// Check if clipboard content has changed since last check.
    /// </summary>
    public static bool HasClipboardChanged()
    {
        var current = GetClipboardSequenceNumber();
        if (current != _lastSequenceNumber)
        {
            _lastSequenceNumber = current;
            return true;
        }
        return false;
    }

    /// <summary>
    /// Get current clipboard sequence number.
    /// </summary>
    public static int GetSequenceNumber() => GetClipboardSequenceNumber();

    /// <summary>
    /// Update the last known sequence number.
    /// </summary>
    public static void UpdateSequenceNumber()
    {
        _lastSequenceNumber = GetClipboardSequenceNumber();
    }

    /// <summary>
    /// Get current clipboard content as a ClipboardItem.
    /// </summary>
    public static ClipboardItem? GetCurrentClipboardItem()
    {
        var item = new ClipboardItem
        {
            Timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()
        };

        // Try to get text
        item.Text = GetClipboardText();

        // Try to get image
        var imageData = GetClipboardImageAsBase64();
        if (imageData != null)
        {
            item.ImageData = imageData;
            item.ImageDataOriginal = imageData;
        }

        // Try to get rich text
        var richText = GetClipboardRichText();
        if (richText != null)
        {
            item.RichText = richText;
        }

        // Return null if clipboard is empty
        if (string.IsNullOrEmpty(item.Text) && item.ImageData == null)
        {
            return null;
        }

        return item;
    }

    /// <summary>
    /// Get clipboard image as Base64 data URL.
    /// </summary>
    public static string? GetClipboardImageAsBase64()
    {
        if (!OpenClipboard(IntPtr.Zero))
        {
            return null;
        }

        try
        {
            // Check for DIB format
            if (!IsClipboardFormatAvailable(CF_DIB) && !IsClipboardFormatAvailable(CF_DIBV5))
            {
                return null;
            }

            var hMem = GetClipboardData(CF_DIB);
            if (hMem == IntPtr.Zero)
            {
                hMem = GetClipboardData(CF_DIBV5);
            }
            if (hMem == IntPtr.Zero)
            {
                return null;
            }

            var size = (int)(ulong)GlobalSize(hMem);
            if (size <= 0)
            {
                return null;
            }

            var ptr = GlobalLock(hMem);
            if (ptr == IntPtr.Zero)
            {
                return null;
            }

            try
            {
                // Read DIB data
                var data = new byte[size];
                Marshal.Copy(ptr, data, 0, size);

                // Convert DIB to BMP (add BMP file header)
                var bmpData = ConvertDibToBmp(data);
                if (bmpData == null)
                {
                    return null;
                }

                // Convert to Base64 data URL
                var base64 = Convert.ToBase64String(bmpData);
                return $"data:image/bmp;base64,{base64}";
            }
            finally
            {
                GlobalUnlock(hMem);
            }
        }
        finally
        {
            CloseClipboard();
        }
    }

    /// <summary>
    /// Get clipboard RTF and HTML content.
    /// </summary>
    public static RichTextData? GetClipboardRichText()
    {
        if (!OpenClipboard(IntPtr.Zero))
        {
            return null;
        }

        try
        {
            RichTextData? result = null;

            // Get RTF
            if (IsClipboardFormatAvailable(CF_RTF))
            {
                var rtf = GetClipboardDataAsString(CF_RTF, Encoding.Default);
                if (!string.IsNullOrEmpty(rtf))
                {
                    result ??= new RichTextData();
                    result.Rtf = Convert.ToBase64String(Encoding.Default.GetBytes(rtf));
                }
            }

            // Get HTML
            if (IsClipboardFormatAvailable(CF_HTML))
            {
                var html = GetClipboardDataAsString(CF_HTML, Encoding.UTF8);
                if (!string.IsNullOrEmpty(html))
                {
                    result ??= new RichTextData();
                    // Extract actual HTML content from CF_HTML format
                    result.Html = ExtractHtmlFromCfHtml(html);
                }
            }

            return result;
        }
        finally
        {
            CloseClipboard();
        }
    }

    /// <summary>
    /// Set clipboard content from a ClipboardItem.
    /// </summary>
    public static bool SetClipboardItem(ClipboardItem item)
    {
        if (!OpenClipboard(IntPtr.Zero))
        {
            return false;
        }

        try
        {
            EmptyClipboard();

            // Set text
            if (!string.IsNullOrEmpty(item.Text))
            {
                SetClipboardTextInternal(item.Text);
            }

            // Set RTF
            if (item.RichText?.Rtf != null)
            {
                try
                {
                    var rtfBytes = Convert.FromBase64String(item.RichText.Rtf);
                    SetClipboardDataInternal(CF_RTF, rtfBytes);
                }
                catch { }
            }

            // Set HTML
            if (item.RichText?.Html != null)
            {
                var cfHtml = ConvertHtmlToCfHtml(item.RichText.Html);
                var htmlBytes = Encoding.UTF8.GetBytes(cfHtml);
                SetClipboardDataInternal(CF_HTML, htmlBytes);
            }

            // Set image
            if (!string.IsNullOrEmpty(item.ImageDataOriginal))
            {
                SetClipboardImageFromBase64(item.ImageDataOriginal);
            }

            return true;
        }
        finally
        {
            CloseClipboard();
        }
    }

    private static string? GetClipboardDataAsString(uint format, Encoding encoding)
    {
        var hMem = GetClipboardData(format);
        if (hMem == IntPtr.Zero) return null;

        var size = (int)(ulong)GlobalSize(hMem);
        if (size <= 0) return null;

        var ptr = GlobalLock(hMem);
        if (ptr == IntPtr.Zero) return null;

        try
        {
            var data = new byte[size];
            Marshal.Copy(ptr, data, 0, size);

            // Find null terminator
            int nullIndex = Array.IndexOf(data, (byte)0);
            if (nullIndex >= 0)
            {
                size = nullIndex;
            }

            return encoding.GetString(data, 0, size);
        }
        finally
        {
            GlobalUnlock(hMem);
        }
    }

    private static bool SetClipboardTextInternal(string text)
    {
        var bytes = (text.Length + 1) * 2;
        var hMem = GlobalAlloc(GMEM_MOVEABLE, (UIntPtr)bytes);
        if (hMem == IntPtr.Zero) return false;

        var ptr = GlobalLock(hMem);
        if (ptr == IntPtr.Zero) return false;

        try
        {
            Marshal.Copy(text.ToCharArray(), 0, ptr, text.Length);
            Marshal.WriteInt16(ptr, text.Length * 2, 0);
        }
        finally
        {
            GlobalUnlock(hMem);
        }

        SetClipboardData(CF_UNICODETEXT, hMem);
        return true;
    }

    private static bool SetClipboardDataInternal(uint format, byte[] data)
    {
        var hMem = GlobalAlloc(GMEM_MOVEABLE, (UIntPtr)(data.Length + 1));
        if (hMem == IntPtr.Zero) return false;

        var ptr = GlobalLock(hMem);
        if (ptr == IntPtr.Zero) return false;

        try
        {
            Marshal.Copy(data, 0, ptr, data.Length);
            Marshal.WriteByte(ptr, data.Length, 0);
        }
        finally
        {
            GlobalUnlock(hMem);
        }

        SetClipboardData(format, hMem);
        return true;
    }

    private static bool SetClipboardImageFromBase64(string dataUrl)
    {
        try
        {
            // Parse data URL
            var base64 = dataUrl;
            if (dataUrl.StartsWith("data:"))
            {
                var commaIndex = dataUrl.IndexOf(',');
                if (commaIndex > 0)
                {
                    base64 = dataUrl[(commaIndex + 1)..];
                }
            }

            var imageData = Convert.FromBase64String(base64);

            // Convert BMP to DIB (remove BMP file header)
            if (imageData.Length > 14 && imageData[0] == 'B' && imageData[1] == 'M')
            {
                var dibData = new byte[imageData.Length - 14];
                Array.Copy(imageData, 14, dibData, 0, dibData.Length);
                imageData = dibData;
            }

            var hMem = GlobalAlloc(GMEM_MOVEABLE, (UIntPtr)imageData.Length);
            if (hMem == IntPtr.Zero) return false;

            var ptr = GlobalLock(hMem);
            if (ptr == IntPtr.Zero) return false;

            try
            {
                Marshal.Copy(imageData, 0, ptr, imageData.Length);
            }
            finally
            {
                GlobalUnlock(hMem);
            }

            SetClipboardData(CF_DIB, hMem);
            return true;
        }
        catch
        {
            return false;
        }
    }

    private static byte[]? ConvertDibToBmp(byte[] dibData)
    {
        if (dibData.Length < 40) return null;

        // Read BITMAPINFOHEADER
        var width = BitConverter.ToInt32(dibData, 4);
        var height = BitConverter.ToInt32(dibData, 8);
        var bitCount = BitConverter.ToInt16(dibData, 14);
        var compression = BitConverter.ToInt32(dibData, 16);

        // Calculate file size
        var rowSize = ((width * bitCount + 31) / 32) * 4;
        var imageSize = rowSize * Math.Abs(height);
        var fileSize = 14 + dibData.Length;

        // Create BMP file header
        var bmpHeader = new byte[14];
        bmpHeader[0] = (byte)'B';
        bmpHeader[1] = (byte)'M';
        BitConverter.GetBytes(fileSize).CopyTo(bmpHeader, 2);
        BitConverter.GetBytes(14 + 40).CopyTo(bmpHeader, 10); // Offset to pixel data

        // Combine header and DIB data
        var bmpData = new byte[14 + dibData.Length];
        bmpHeader.CopyTo(bmpData, 0);
        dibData.CopyTo(bmpData, 14);

        return bmpData;
    }

    private static string ExtractHtmlFromCfHtml(string cfHtml)
    {
        // CF_HTML format has headers like:
        // Version:0.9
        // StartHTML:0000000105
        // EndHTML:0000000231
        // StartFragment:0000000141
        // EndFragment:0000000195

        var startHtmlMatch = System.Text.RegularExpressions.Regex.Match(cfHtml, @"StartHTML:(\d+)");
        var endHtmlMatch = System.Text.RegularExpressions.Regex.Match(cfHtml, @"EndHTML:(\d+)");

        if (startHtmlMatch.Success && endHtmlMatch.Success)
        {
            var start = int.Parse(startHtmlMatch.Groups[1].Value);
            var end = int.Parse(endHtmlMatch.Groups[1].Value);
            if (start < cfHtml.Length && end <= cfHtml.Length && start < end)
            {
                return cfHtml[start..end];
            }
        }

        return cfHtml;
    }

    private static string ConvertHtmlToCfHtml(string html)
    {
        var header = new StringBuilder();
        header.AppendLine("Version:0.9");
        header.AppendLine("StartHTML:PLACEHOLDER1");
        header.AppendLine("EndHTML:PLACEHOLDER2");
        header.AppendLine("StartFragment:PLACEHOLDER3");
        header.AppendLine("EndFragment:PLACEHOLDER4");

        var htmlStart = "<!--StartFragment-->";
        var htmlEnd = "<!--EndFragment-->";

        var content = $"<html><body>{htmlStart}{html}{htmlEnd}</body></html>";

        var headerStr = header.ToString();
        var startHtml = headerStr.Length;
        var startFragment = startHtml + content.IndexOf(htmlStart) + htmlStart.Length;
        var endFragment = startHtml + content.IndexOf(htmlEnd);
        var endHtml = startHtml + content.Length;

        headerStr = headerStr.Replace("PLACEHOLDER1", startHtml.ToString("D10"));
        headerStr = headerStr.Replace("PLACEHOLDER2", endHtml.ToString("D10"));
        headerStr = headerStr.Replace("PLACEHOLDER3", startFragment.ToString("D10"));
        headerStr = headerStr.Replace("PLACEHOLDER4", endFragment.ToString("D10"));

        return headerStr + content;
    }

    /// <summary>
    /// Get selected text using Ctrl+C clipboard method.
    /// </summary>
    /// <param name="timeoutMs">Timeout in milliseconds</param>
    /// <returns>BridgeOutput with selected text or error</returns>
    public static BridgeOutput GetSelectedTextViaClipboard(int timeoutMs)
    {
        try
        {
            // Save current clipboard content
            var savedText = GetClipboardText();
            var baselineSequence = GetClipboardSequenceNumber();

            // Send Ctrl+C
            if (!InputSimulator.SendCtrlC())
            {
                return BridgeOutput.Error(ErrorCodes.CopyDispatchFailed, "Failed to send Ctrl+C");
            }

            // Wait for clipboard change
            var deadline = DateTime.Now.AddMilliseconds(timeoutMs);
            while (DateTime.Now < deadline)
            {
                Thread.Sleep(20);
                if (GetClipboardSequenceNumber() != baselineSequence)
                {
                    break;
                }
            }

            // Check if clipboard changed
            if (GetClipboardSequenceNumber() == baselineSequence)
            {
                // Restore original clipboard content
                if (savedText != null)
                {
                    SetClipboardText(savedText);
                }
                return BridgeOutput.Error(ErrorCodes.PasteboardTimeout, "Clipboard did not change");
            }

            // Get new clipboard content
            var newText = GetClipboardText();

            // Restore original clipboard content
            if (savedText != null)
            {
                SetClipboardText(savedText);
            }

            if (string.IsNullOrEmpty(newText))
            {
                return BridgeOutput.Error(ErrorCodes.PasteboardEmpty, "Clipboard is empty");
            }

            return BridgeOutput.Ok(newText, "clipboard");
        }
        catch (Exception ex)
        {
            return BridgeOutput.Error(ErrorCodes.Unknown, ex.Message);
        }
    }

    /// <summary>
    /// Get text from clipboard.
    /// </summary>
    public static string? GetClipboardText()
    {
        if (!OpenClipboard(IntPtr.Zero))
        {
            return null;
        }

        try
        {
            var hMem = GetClipboardData(CF_UNICODETEXT);
            if (hMem == IntPtr.Zero)
            {
                return null;
            }

            var ptr = GlobalLock(hMem);
            if (ptr == IntPtr.Zero)
            {
                return null;
            }

            try
            {
                return Marshal.PtrToStringUni(ptr);
            }
            finally
            {
                GlobalUnlock(hMem);
            }
        }
        finally
        {
            CloseClipboard();
        }
    }

    /// <summary>
    /// Set text to clipboard.
    /// </summary>
    public static bool SetClipboardText(string text)
    {
        if (!OpenClipboard(IntPtr.Zero))
        {
            return false;
        }

        try
        {
            EmptyClipboard();

            var bytes = (text.Length + 1) * 2;
            var hMem = GlobalAlloc(GMEM_MOVEABLE, (UIntPtr)bytes);
            if (hMem == IntPtr.Zero)
            {
                return false;
            }

            var ptr = GlobalLock(hMem);
            if (ptr == IntPtr.Zero)
            {
                return false;
            }

            try
            {
                Marshal.Copy(text.ToCharArray(), 0, ptr, text.Length);
                Marshal.WriteInt16(ptr, text.Length * 2, 0);
            }
            finally
            {
                GlobalUnlock(hMem);
            }

            SetClipboardData(CF_UNICODETEXT, hMem);
            return true;
        }
        finally
        {
            CloseClipboard();
        }
    }
}
