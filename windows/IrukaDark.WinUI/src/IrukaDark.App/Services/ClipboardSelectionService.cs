using System;
using System.Runtime.InteropServices;
using System.Threading.Tasks;
using Microsoft.UI.Dispatching;
using Windows.ApplicationModel.DataTransfer;

namespace IrukaDark.App.Services;

public class ClipboardSelectionService
{
    private const int KEYEVENTF_KEYUP = 0x0002;
    private const byte VK_CONTROL = 0x11;
    private const byte VK_C = 0x43;
    private readonly DispatcherQueue _dispatcherQueue;
    private readonly TimeSpan _copyDelay;

    public ClipboardSelectionService()
    {
        _dispatcherQueue = DispatcherQueue.GetForCurrentThread()
            ?? throw new InvalidOperationException("ClipboardSelectionService must be created on UI thread with a DispatcherQueue.");
        _copyDelay = TimeSpan.FromMilliseconds(180);
    }

    public async Task<string> CaptureSelectedTextAsync()
    {
        var snapshot = await BackupClipboardAsync().ConfigureAwait(false);
        await SimulateCopyGestureAsync().ConfigureAwait(false);
        await Task.Delay(_copyDelay).ConfigureAwait(false);
        var text = await GetClipboardTextAsync().ConfigureAwait(false);
        await RestoreClipboardAsync(snapshot).ConfigureAwait(false);
        return text.Trim();
    }

    private async Task SimulateCopyGestureAsync()
    {
        await EnqueueAsync(() =>
        {
            keybd_event(VK_CONTROL, 0, 0, 0);
            keybd_event(VK_C, 0, 0, 0);
            keybd_event(VK_C, 0, KEYEVENTF_KEYUP, 0);
            keybd_event(VK_CONTROL, 0, KEYEVENTF_KEYUP, 0);
        }).ConfigureAwait(false);
    }

    private async Task<string> GetClipboardTextAsync()
    {
        return await EnqueueAsync(async () =>
        {
            try
            {
                var data = Clipboard.GetContent();
                if (data is null)
                {
                    return string.Empty;
                }

                if (data.Contains(StandardDataFormats.Text))
                {
                    var text = await data.GetTextAsync();
                    return text ?? string.Empty;
                }
            }
            catch
            {
                // ignored
            }

            return string.Empty;
        }).ConfigureAwait(false);
    }

    private Task<ClipboardSnapshot> BackupClipboardAsync()
    {
        return EnqueueAsync(async () =>
        {
            try
            {
                var view = Clipboard.GetContent();
                if (view is null)
                {
                    return ClipboardSnapshot.Empty;
                }

                string? text = null;
                string? html = null;
                string? rtf = null;
                var hadData = false;

                if (view.Contains(StandardDataFormats.Text))
                {
                    text = await view.GetTextAsync();
                    hadData = true;
                }

                if (view.Contains(StandardDataFormats.Html))
                {
                    html = await view.GetHtmlFormatAsync();
                    hadData = true;
                }

                if (view.Contains(StandardDataFormats.Rtf))
                {
                    rtf = await view.GetRtfAsync();
                    hadData = true;
                }

                return new ClipboardSnapshot(text, html, rtf, hadData);
            }
            catch
            {
                return ClipboardSnapshot.Empty;
            }
        }).ConfigureAwait(false);
    }

    private Task RestoreClipboardAsync(ClipboardSnapshot snapshot)
    {
        if (!snapshot.HasData)
        {
            return Task.CompletedTask;
        }

        return EnqueueAsync(() =>
        {
            try
            {
                var package = new DataPackage();
                var setAny = false;

                if (!string.IsNullOrEmpty(snapshot.Text))
                {
                    package.SetText(snapshot.Text);
                    setAny = true;
                }

                if (!string.IsNullOrEmpty(snapshot.Html))
                {
                    package.SetHtmlFormat(snapshot.Html);
                    setAny = true;
                }

                if (!string.IsNullOrEmpty(snapshot.Rtf))
                {
                    package.SetRtf(snapshot.Rtf);
                    setAny = true;
                }

                if (setAny)
                {
                    Clipboard.SetContent(package);
                    Clipboard.Flush();
                }
            }
            catch
            {
                // ignored
            }
        });
    }

    private Task EnqueueAsync(Action action)
    {
        var tcs = new TaskCompletionSource<bool>();
        if (!_dispatcherQueue.TryEnqueue(() =>
            {
                try
                {
                    action();
                    tcs.SetResult(true);
                }
                catch (Exception ex)
                {
                    tcs.SetException(ex);
                }
            }))
        {
            tcs.SetException(new InvalidOperationException("Failed to enqueue clipboard operation."));
        }

        return tcs.Task;
    }

    private Task<T> EnqueueAsync<T>(Func<Task<T>> factory)
    {
        var tcs = new TaskCompletionSource<T>();
        if (!_dispatcherQueue.TryEnqueue(async () =>
            {
                try
                {
                    var result = await factory().ConfigureAwait(false);
                    tcs.SetResult(result);
                }
                catch (Exception ex)
                {
                    tcs.SetException(ex);
                }
            }))
        {
            tcs.SetException(new InvalidOperationException("Failed to enqueue clipboard operation."));
        }

        return tcs.Task;
    }

    [DllImport("user32.dll", SetLastError = true)]
    private static extern void keybd_event(byte bVk, byte bScan, int dwFlags, int dwExtraInfo);

    private readonly record struct ClipboardSnapshot(string? Text, string? Html, string? Rtf, bool HasData)
    {
        public static ClipboardSnapshot Empty => new(null, null, null, false);
    }
}
