using System.Text.Json;
using IrukaAutomation.IPC;
using IrukaAutomation.Services;

namespace IrukaAutomation.Commands;

/// <summary>
/// Command to show clipboard popup window.
/// Compatible with macOS Swift bridge "clipboard-popup" command.
/// This is a one-shot command that shows popup and exits when closed.
/// For persistent popup, use DaemonCommand instead.
/// </summary>
public static class ClipboardPopupCommand
{
    private static readonly ManualResetEventSlim _popupClosed = new(false);
    private static ClipboardItem? _selectedItem;

    public static void Run()
    {
        try
        {
            // Read input from stdin
            var input = Console.In.ReadToEnd();
            if (string.IsNullOrWhiteSpace(input))
            {
                BridgeOutput.Error(ErrorCodes.InvalidInput, "No input provided").WriteToConsole();
                return;
            }

            // Parse JSON input
            ClipboardPopupInput? popupInput;
            try
            {
                popupInput = JsonSerializer.Deserialize(input, JsonContext.Default.ClipboardPopupInput);
            }
            catch (JsonException ex)
            {
                BridgeOutput.Error(ErrorCodes.InvalidJson, ex.Message).WriteToConsole();
                return;
            }

            if (popupInput?.Items == null || popupInput.Items.Count == 0)
            {
                BridgeOutput.Error(ErrorCodes.NoItems, "No items provided").WriteToConsole();
                return;
            }

            // Run popup on STA thread
            var result = ShowPopupAndWait(popupInput);
            result.WriteToConsole();
        }
        catch (Exception ex)
        {
            BridgeOutput.Error(ErrorCodes.Unknown, ex.Message).WriteToConsole();
        }
    }

    private static BridgeOutput ShowPopupAndWait(ClipboardPopupInput popupInput)
    {
        _popupClosed.Reset();
        _selectedItem = null;

        using var popupManager = new PopupManager();
        popupManager.ItemSelected += OnItemSelected;
        popupManager.PopupClosed += OnPopupClosed;

        try
        {
            popupManager.Initialize();

            // Show popup
            popupManager.ShowPopup(
                popupInput.Items!,
                popupInput.IsDarkMode,
                popupInput.Opacity,
                popupInput.ActiveTab,
                popupInput.SnippetDataPath
            );

            // Wait for popup to close (with timeout of 5 minutes)
            if (!_popupClosed.Wait(TimeSpan.FromMinutes(5)))
            {
                return BridgeOutput.Error(ErrorCodes.Timeout, "Popup timed out");
            }

            // Return result
            if (_selectedItem != null)
            {
                // Set clipboard and paste
                StaHelper.RunSta(() => ClipboardService.SetClipboardItem(_selectedItem));
                Thread.Sleep(50);
                InputSimulator.SendCtrlV();

                return new BridgeOutput
                {
                    Status = "ok",
                    Text = _selectedItem.Text,
                    ImageDataOriginal = _selectedItem.ImageDataOriginal
                };
            }
            else
            {
                return BridgeOutput.Ok(message: "Popup closed without selection");
            }
        }
        finally
        {
            popupManager.ItemSelected -= OnItemSelected;
            popupManager.PopupClosed -= OnPopupClosed;
        }
    }

    private static void OnItemSelected(object? sender, ClipboardItem item)
    {
        _selectedItem = item;
        _popupClosed.Set();
    }

    private static void OnPopupClosed(object? sender, EventArgs e)
    {
        _popupClosed.Set();
    }
}
