using IrukaAutomation.Commands;
using IrukaAutomation.IPC;

namespace IrukaAutomation;

/// <summary>
/// IrukaAutomation CLI entry point.
/// Compatible with macOS Swift bridge command structure.
/// </summary>
class Program
{
    private const string Version = "1.0.0";

    static void Main(string[] args)
    {
        if (args.Length < 1)
        {
            PrintUsageAndExit("Missing command.");
            return;
        }

        var command = args[0].ToLowerInvariant();
        var commandArgs = args.Length > 1 ? args[1..] : Array.Empty<string>();

        switch (command)
        {
            case "selected-text":
                SelectedTextCommand.Run(commandArgs);
                break;

            case "ensure-accessibility":
                // On Windows, accessibility is generally available without explicit permission
                BridgeOutput.Ok(message: "accessibility_trusted").WriteToConsole();
                break;

            case "clipboard-popup":
                ClipboardPopupCommand.Run();
                break;

            case "daemon":
                DaemonCommand.Run();
                break;

            case "help":
            case "--help":
            case "-h":
                PrintUsageAndExit(null, exitCode: 0);
                break;

            case "version":
            case "--version":
            case "-v":
                BridgeOutput.Ok(Version).WriteToConsole();
                break;

            default:
                PrintUsageAndExit($"Unknown command: {command}");
                break;
        }
    }

    private static void PrintUsageAndExit(string? errorMessage, int exitCode = 1)
    {
        if (errorMessage != null)
        {
            Console.Error.WriteLine($"Error: {errorMessage}");
            Console.Error.WriteLine();
        }

        Console.Error.WriteLine("IrukaAutomation - Windows automation bridge for IrukaDark");
        Console.Error.WriteLine();
        Console.Error.WriteLine("Usage: IrukaAutomation <command> [options]");
        Console.Error.WriteLine();
        Console.Error.WriteLine("Commands:");
        Console.Error.WriteLine("  selected-text      Get selected text from focused application");
        Console.Error.WriteLine("  ensure-accessibility  Check accessibility permissions");
        Console.Error.WriteLine("  clipboard-popup    Show clipboard popup window");
        Console.Error.WriteLine("  daemon             Run as daemon process");
        Console.Error.WriteLine("  version            Show version");
        Console.Error.WriteLine("  help               Show this help message");
        Console.Error.WriteLine();
        Console.Error.WriteLine("Options for selected-text:");
        Console.Error.WriteLine("  --timeout-ms=<ms>       Timeout in milliseconds (default: 1500)");
        Console.Error.WriteLine("  --prompt-accessibility  Prompt for accessibility permission");
        Console.Error.WriteLine();

        Environment.Exit(exitCode);
    }
}
