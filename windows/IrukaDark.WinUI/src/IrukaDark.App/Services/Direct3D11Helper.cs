using System;
using System.Runtime.InteropServices;
using Windows.Graphics.DirectX.Direct3D11;

namespace IrukaDark.App.Services;

internal static class Direct3D11Helper
{
    private const int D3D11_SDK_VERSION = 7;
    private const uint D3D11_CREATE_DEVICE_BGRA_SUPPORT = 0x20;
    private static readonly int[] FeatureLevels =
    {
        0x0000C100, // D3D_FEATURE_LEVEL_12_1
        0x0000C000, // 12_0
        0x0000B100, // 11_1
        0x0000B000, // 11_0
        0x0000A100, // 10_1
        0x0000A000, // 10_0
        0x00009101, // 9_3
        0x00009100, // 9_2
        0x000090C0  // 9_1
    };

    public static IDirect3DDevice CreateDevice()
    {
        var createResult = D3D11CreateDevice(
            IntPtr.Zero,
            D3D_DRIVER_TYPE_HARDWARE,
            IntPtr.Zero,
            D3D11_CREATE_DEVICE_BGRA_SUPPORT,
            FeatureLevels,
            FeatureLevels.Length,
            D3D11_SDK_VERSION,
            out var d3dDevicePtr,
            out _,
            out var contextPtr);

        if (createResult < 0)
        {
            Marshal.ThrowExceptionForHR(createResult);
        }

        if (contextPtr != IntPtr.Zero)
        {
            Marshal.Release(contextPtr);
        }

        Guid iidDxgiDevice = new("54ec77fa-1377-44e6-8c32-88fd5f44c84c");
        var hr = Marshal.QueryInterface(d3dDevicePtr, ref iidDxgiDevice, out var dxgiDevicePtr);
        if (hr < 0)
        {
            Marshal.Release(d3dDevicePtr);
            Marshal.ThrowExceptionForHR(hr);
        }

        hr = CreateDirect3D11DeviceFromDXGIDevice(dxgiDevicePtr, out var direct3DDevicePtr);
        Marshal.Release(dxgiDevicePtr);
        if (hr < 0)
        {
            Marshal.Release(d3dDevicePtr);
            Marshal.ThrowExceptionForHR(hr);
        }

        var device = (IDirect3DDevice)Marshal.GetObjectForIUnknown(direct3DDevicePtr);

        Marshal.Release(direct3DDevicePtr);
        Marshal.Release(d3dDevicePtr);

        return device;
    }

    [DllImport("d3d11.dll", ExactSpelling = true)]
    private static extern int D3D11CreateDevice(
        IntPtr pAdapter,
        D3D_DRIVER_TYPE DriverType,
        IntPtr Software,
        uint Flags,
        int[] pFeatureLevels,
        int FeatureLevels,
        int SDKVersion,
        out IntPtr ppDevice,
        out int pFeatureLevel,
        out IntPtr ppImmediateContext);

    [DllImport("d3d11.dll", ExactSpelling = true)]
    private static extern int CreateDirect3D11DeviceFromDXGIDevice(IntPtr dxgiDevice, out IntPtr graphicsDevice);

    private enum D3D_DRIVER_TYPE
    {
        D3D_DRIVER_TYPE_HARDWARE = 1,
        D3D_DRIVER_TYPE_WARP = 5,
        D3D_DRIVER_TYPE_REFERENCE = 4
    }
}
