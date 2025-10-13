namespace IrukaDark.App.Services;

public class PromptBuilder
{
    public string BuildExplainPrompt(string text, bool detailed)
    {
        var trimmed = text?.Trim();
        if (string.IsNullOrEmpty(trimmed))
        {
            return "You are IrukaDark, a concise assistant.";
        }

        if (detailed)
        {
            return $"You are IrukaDark, an AI assistant. Provide a structured, detailed explanation for:\n\n{trimmed}";
        }

        return $"You are IrukaDark, an AI assistant. Provide a concise explanation for:\n\n{trimmed}";
    }

    public string BuildTranslatePrompt(string text, string targetLanguage)
    {
        var trimmed = text?.Trim();
        if (string.IsNullOrEmpty(trimmed))
        {
            return "You are IrukaDark. Reply with an empty string.";
        }

        targetLanguage = NormalizeLanguage(targetLanguage);

        return $"You are IrukaDark, an AI translator. Translate the following content into {targetLanguage} without additional commentary:\n\n{trimmed}";
    }

    public string BuildScreenshotPrompt(string? instruction = null)
    {
        var baseInstruction = string.IsNullOrWhiteSpace(instruction)
            ? "Describe the screenshot clearly, list notable elements, and suggest one actionable takeaway."
            : instruction.Trim();

        return $"You are IrukaDark, an AI assistant analyzing a screenshot. {baseInstruction}";
    }

    private static string NormalizeLanguage(string language)
    {
        if (string.IsNullOrWhiteSpace(language))
        {
            return "English";
        }

        var normalized = language.Trim();
        var lower = normalized.ToLowerInvariant();

        return lower switch
        {
            "en" or "english" => "English",
            "ja" or "japanese" => "Japanese",
            "zh" or "chinese" => "Chinese",
            "ko" or "korean" => "Korean",
            _ when normalized.Length > 1 => char.ToUpper(normalized[0]) + normalized[1..],
            _ => normalized.ToUpperInvariant()
        };
    }
}
