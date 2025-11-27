using IrukaAutomation.IPC;
using IrukaAutomation.Services;

namespace IrukaAutomation.Commands;

/// <summary>
/// Command to get selected text from the focused application.
/// Compatible with macOS Swift bridge "selected-text" command.
/// </summary>
public static class SelectedTextCommand
{
    public static void Run(string[] args)
    {
        var timeoutMs = ArgumentParser.ParseTimeout(args);
        var promptAccessibility = ArgumentParser.HasFlag(args, "--prompt-accessibility");

        try
        {
            var result = UIAutomationService.GetSelectedText(timeoutMs, promptAccessibility);
            result.WriteToConsole();
        }
        catch (Exception ex)
        {
            BridgeOutput.Error(ErrorCodes.Unknown, ex.Message).WriteToConsole();
        }
    }
}
