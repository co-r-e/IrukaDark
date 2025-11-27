using System.Text.Json;
using System.Text.Json.Serialization;

namespace IrukaAutomation.IPC;

/// <summary>
/// JSON output format compatible with macOS Swift bridge.
/// </summary>
public class BridgeOutput
{
    [JsonPropertyName("status")]
    public string Status { get; set; } = "ok";

    [JsonPropertyName("text")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? Text { get; set; }

    [JsonPropertyName("source")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? Source { get; set; }

    [JsonPropertyName("code")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? Code { get; set; }

    [JsonPropertyName("message")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? Message { get; set; }

    [JsonPropertyName("imageDataOriginal")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? ImageDataOriginal { get; set; }

    public static BridgeOutput Ok(string? text = null, string? source = null, string? message = null)
    {
        return new BridgeOutput
        {
            Status = "ok",
            Text = text,
            Source = source,
            Message = message
        };
    }

    public static BridgeOutput Error(string code, string? message = null)
    {
        return new BridgeOutput
        {
            Status = "error",
            Code = code,
            Message = message
        };
    }

    public string ToJson()
    {
        return JsonSerializer.Serialize(this, JsonContext.Default.BridgeOutput);
    }

    public void WriteToConsole()
    {
        ConsoleOutput.WriteLine(ToJson());
    }
}

/// <summary>
/// Error codes compatible with macOS Swift bridge.
/// </summary>
public static class ErrorCodes
{
    public const string AccessibilityPermissionDenied = "accessibility_permission_denied";
    public const string CopyDispatchFailed = "copy_dispatch_failed";
    public const string PasteboardTimeout = "pasteboard_timeout";
    public const string PasteboardEmpty = "pasteboard_empty";
    public const string Timeout = "timeout";
    public const string Unknown = "unknown";
    public const string InvalidInput = "invalid_input";
    public const string InvalidJson = "invalid_json";
    public const string NoItems = "no_items";
    public const string InvalidPayload = "invalid_payload";
    public const string UnknownCommand = "unknown_command";
    public const string SerializationFailed = "serialization_failed";
}
