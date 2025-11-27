namespace IrukaAutomation.IPC;

/// <summary>
/// Thread-safe console output helper.
/// Ensures JSON lines are not interleaved when multiple threads write.
/// </summary>
public static class ConsoleOutput
{
    private static readonly object _lock = new();

    /// <summary>
    /// Write a line to console in a thread-safe manner.
    /// </summary>
    public static void WriteLine(string line)
    {
        lock (_lock)
        {
            Console.WriteLine(line);
            Console.Out.Flush();
        }
    }

    /// <summary>
    /// Write an error line to stderr in a thread-safe manner.
    /// </summary>
    public static void WriteErrorLine(string line)
    {
        lock (_lock)
        {
            Console.Error.WriteLine(line);
            Console.Error.Flush();
        }
    }
}
