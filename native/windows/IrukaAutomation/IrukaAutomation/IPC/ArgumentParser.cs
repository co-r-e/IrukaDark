namespace IrukaAutomation.IPC;

/// <summary>
/// Command-line argument parser compatible with macOS Swift bridge.
/// Supports both --timeout-ms=1500 and --timeout-ms 1500 formats.
/// </summary>
public static class ArgumentParser
{
    /// <summary>
    /// Parse timeout value from arguments.
    /// </summary>
    /// <param name="args">Command-line arguments</param>
    /// <param name="defaultValue">Default timeout in milliseconds</param>
    /// <returns>Parsed timeout value</returns>
    public static int ParseTimeout(string[] args, int defaultValue = 1500)
    {
        for (int i = 0; i < args.Length; i++)
        {
            // --timeout-ms=1500 format
            if (args[i].StartsWith("--timeout-ms="))
            {
                var value = args[i]["--timeout-ms=".Length..];
                if (int.TryParse(value, out int ms) && ms > 0)
                {
                    return ms;
                }
            }
            // --timeout-ms 1500 format
            else if (args[i] == "--timeout-ms" && i + 1 < args.Length)
            {
                if (int.TryParse(args[i + 1], out int ms) && ms > 0)
                {
                    return ms;
                }
            }
        }
        return defaultValue;
    }

    /// <summary>
    /// Check if a flag is present in arguments.
    /// </summary>
    /// <param name="args">Command-line arguments</param>
    /// <param name="flag">Flag to check (e.g., "--prompt-accessibility")</param>
    /// <returns>True if flag is present</returns>
    public static bool HasFlag(string[] args, string flag)
    {
        return args.Contains(flag);
    }

    /// <summary>
    /// Get the value of a named argument.
    /// </summary>
    /// <param name="args">Command-line arguments</param>
    /// <param name="name">Argument name (e.g., "--config")</param>
    /// <returns>Argument value or null</returns>
    public static string? GetArgument(string[] args, string name)
    {
        for (int i = 0; i < args.Length; i++)
        {
            // --name=value format
            if (args[i].StartsWith($"{name}="))
            {
                return args[i][$"{name}=".Length..];
            }
            // --name value format
            else if (args[i] == name && i + 1 < args.Length)
            {
                return args[i + 1];
            }
        }
        return null;
    }
}
