using System.Text.Json;
using System.Text.Json.Serialization;

namespace IrukaAutomation.IPC;

/// <summary>
/// Daemon event format compatible with macOS Swift bridge.
/// </summary>
public class DaemonEvent
{
    [JsonPropertyName("event")]
    public string Event { get; set; } = "";

    [JsonPropertyName("text")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? Text { get; set; }

    [JsonPropertyName("imageDataOriginal")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? ImageDataOriginal { get; set; }

    [JsonPropertyName("code")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? Code { get; set; }

    [JsonPropertyName("message")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? Message { get; set; }

    public static DaemonEvent Ready() => new() { Event = "ready" };
    public static DaemonEvent Pong() => new() { Event = "pong" };
    public static DaemonEvent Hidden() => new() { Event = "hidden" };
    public static DaemonEvent Shown() => new() { Event = "shown" };

    public static DaemonEvent ItemPasted(string? text, string? imageDataOriginal = null)
    {
        return new DaemonEvent
        {
            Event = "item_pasted",
            Text = text,
            ImageDataOriginal = imageDataOriginal
        };
    }

    public static DaemonEvent Error(string code, string? message = null)
    {
        return new DaemonEvent
        {
            Event = "error",
            Code = code,
            Message = message
        };
    }

    public string ToJson()
    {
        return JsonSerializer.Serialize(this, JsonContext.Default.DaemonEvent);
    }

    public void WriteToConsole()
    {
        ConsoleOutput.WriteLine(ToJson());
    }
}

/// <summary>
/// Daemon command received from stdin.
/// </summary>
public class DaemonCommand
{
    [JsonPropertyName("command")]
    public string Command { get; set; } = "";

    [JsonPropertyName("payload")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public DaemonPayload? Payload { get; set; }
}

/// <summary>
/// Daemon command payload.
/// </summary>
public class DaemonPayload
{
    [JsonPropertyName("items")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public List<ClipboardItem>? Items { get; set; }

    [JsonPropertyName("isDarkMode")]
    public bool IsDarkMode { get; set; }

    [JsonPropertyName("opacity")]
    public double Opacity { get; set; } = 1.0;

    [JsonPropertyName("activeTab")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? ActiveTab { get; set; }

    [JsonPropertyName("snippetDataPath")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? SnippetDataPath { get; set; }
}

/// <summary>
/// Clipboard item format compatible with macOS Swift bridge.
/// </summary>
public class ClipboardItem
{
    [JsonPropertyName("text")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? Text { get; set; }

    [JsonPropertyName("imageData")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? ImageData { get; set; }

    [JsonPropertyName("imageDataOriginal")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? ImageDataOriginal { get; set; }

    [JsonPropertyName("timestamp")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public long? Timestamp { get; set; }

    [JsonPropertyName("richText")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public RichTextData? RichText { get; set; }
}

/// <summary>
/// Rich text data (RTF/HTML/Markdown).
/// </summary>
public class RichTextData
{
    [JsonPropertyName("rtf")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? Rtf { get; set; }

    [JsonPropertyName("html")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? Html { get; set; }

    [JsonPropertyName("markdown")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? Markdown { get; set; }
}
