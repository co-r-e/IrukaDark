namespace IrukaDark.App.Models;

public record UrlContentResult(
    bool Success,
    string Message,
    string? FinalUrl = null,
    string? Text = null,
    bool Truncated = false);
