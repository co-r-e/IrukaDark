using System.Text.Json.Serialization;

namespace IrukaAutomation.IPC;

/// <summary>
/// JSON serialization context for AOT compatibility.
/// </summary>
[JsonSerializable(typeof(BridgeOutput))]
[JsonSerializable(typeof(DaemonEvent))]
[JsonSerializable(typeof(DaemonCommand))]
[JsonSerializable(typeof(DaemonPayload))]
[JsonSerializable(typeof(ClipboardItem))]
[JsonSerializable(typeof(RichTextData))]
[JsonSerializable(typeof(List<ClipboardItem>))]
[JsonSerializable(typeof(ClipboardPopupInput))]
public partial class JsonContext : JsonSerializerContext
{
}

/// <summary>
/// Input format for clipboard-popup command (stdin).
/// </summary>
public class ClipboardPopupInput
{
    [JsonPropertyName("items")]
    public List<ClipboardItem>? Items { get; set; }

    [JsonPropertyName("isDarkMode")]
    public bool IsDarkMode { get; set; }

    [JsonPropertyName("opacity")]
    public double Opacity { get; set; } = 1.0;

    [JsonPropertyName("activeTab")]
    public string? ActiveTab { get; set; }

    [JsonPropertyName("snippetDataPath")]
    public string? SnippetDataPath { get; set; }
}
