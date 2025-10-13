using System;
using System.IO;
using System.Threading.Tasks;
using IrukaDark.App.Models;
using Windows.Graphics.Capture;
using Windows.Graphics.DirectX;
using Windows.Graphics.DirectX.Direct3D11;
using Windows.Graphics.Imaging;
using Windows.Storage;
using Windows.Storage.Streams;
using WinRT.Interop;

namespace IrukaDark.App.Services;

public class CaptureService
{
    private readonly IDirect3DDevice _device;
    private readonly string _captureDirectory;

    public CaptureService()
    {
        _device = Direct3D11Helper.CreateDevice();
        var appData = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
        _captureDirectory = Path.Combine(appData, "IrukaDark", "captures");
    }

    public async Task<CaptureResult> CaptureInteractiveAsync(IntPtr windowHandle)
    {
        if (!GraphicsCaptureSession.IsSupported())
        {
            return new CaptureResult(false, "Graphics capture is not supported on this device.");
        }

        var picker = new GraphicsCapturePicker();
        InitializeWithWindow.Initialize(picker, windowHandle);
        var item = await picker.PickSingleItemAsync();
        if (item is null)
        {
            return new CaptureResult(false, "Capture canceled by user.");
        }

        var completion = new TaskCompletionSource<CaptureResult>();

        var framePool = Direct3D11CaptureFramePool.CreateFreeThreaded(
            _device,
            DirectXPixelFormat.B8G8R8A8UIntNormalized,
            1,
            item.Size);

        GraphicsCaptureSession? session = null;
        session = framePool.CreateCaptureSession(item);

        framePool.FrameArrived += async (pool, args) =>
        {
            try
            {
                using var frame = pool.TryGetNextFrame();
                if (frame is null)
                {
                    return;
                }

                using var bitmap = await SoftwareBitmap.CreateCopyFromSurfaceAsync(frame.Surface);
                using var converted = SoftwareBitmap.Convert(bitmap, BitmapPixelFormat.Bgra8, BitmapAlphaMode.Premultiplied);

                var path = await SaveBitmapAsync(converted).ConfigureAwait(false);
                completion.TrySetResult(new CaptureResult(true, $"Capture saved: {path}", path));
            }
            catch (Exception ex)
            {
                completion.TrySetResult(new CaptureResult(false, $"Capture failed: {ex.Message}"));
            }
            finally
            {
                session?.Dispose();
                pool.Dispose();
            }
        };

        session.StartCapture();

        var finished = await Task.WhenAny(completion.Task, Task.Delay(TimeSpan.FromSeconds(2))).ConfigureAwait(false);
        if (finished != completion.Task)
        {
            session.Dispose();
            framePool.Dispose();
            return new CaptureResult(false, "Capture timed out.");
        }

        return await completion.Task.ConfigureAwait(false);
    }

    private async Task<string> SaveBitmapAsync(SoftwareBitmap bitmap)
    {
        Directory.CreateDirectory(_captureDirectory);
        var fileName = $"capture_{DateTime.UtcNow:yyyyMMdd_HHmmssfff}.png";
        var folder = await StorageFolder.GetFolderFromPathAsync(_captureDirectory).AsTask().ConfigureAwait(false);
        var file = await folder.CreateFileAsync(fileName, CreationCollisionOption.GenerateUniqueName).AsTask().ConfigureAwait(false);

        using var stream = await file.OpenAsync(FileAccessMode.ReadWrite).AsTask().ConfigureAwait(false);
        var encoder = await BitmapEncoder.CreateAsync(BitmapEncoder.PngEncoderId, stream).AsTask().ConfigureAwait(false);
        encoder.SetSoftwareBitmap(bitmap);
        await encoder.FlushAsync().AsTask().ConfigureAwait(false);
        return file.Path;
    }
}
