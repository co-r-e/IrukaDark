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

    public string BuildScreenshotDetailedPrompt()
    {
        const string instruction =
            "Provide a structured explanation for non-experts covering: key points, why they matter, concrete examples, and any risks or caveats. Use bullet lists where helpful and keep the tone clear and reassuring.";
        return BuildScreenshotPrompt(instruction);
    }

    public string BuildUrlSummaryPrompt(string url, string content, bool truncated)
    {
        var trimmedUrl = string.IsNullOrWhiteSpace(url) ? "Unknown URL" : url.Trim();
        var body = content?.Trim() ?? string.Empty;
        var note = truncated ? "\n\nNote: The captured page text was truncated to 5000 characters." : string.Empty;

        return
            "You are IrukaDark, an AI assistant. Produce a four-sentence digest of the linked page using the following order:\n" +
            "1) Top takeaway\n" +
            "2) Why it matters\n" +
            "3) Recommended next step\n" +
            "4) Risk or caveat to watch\n\n" +
            $"Source URL: {trimmedUrl}\n\n" +
            "Source text:\n" +
            body +
            note;
    }

    public string BuildUrlDetailedPrompt(string url, string content, bool truncated)
    {
        var trimmedUrl = string.IsNullOrWhiteSpace(url) ? "Unknown URL" : url.Trim();
        var body = content?.Trim() ?? string.Empty;
        var note = truncated ? "\n\nNote: The captured page text was truncated to 5000 characters." : string.Empty;

        return
            "You are IrukaDark, an AI assistant. Provide a structured deep dive of the linked page with the sections:\n" +
            "Overview, Key Points, Background, Risks, Recommended Actions. Keep each section concise but informative.\n\n" +
            $"Source URL: {trimmedUrl}\n\n" +
            "Source text:\n" +
            body +
            note;
    }

    public string BuildEmpathyPrompt(string text)
    {
        var trimmed = text?.Trim();
        if (string.IsNullOrEmpty(trimmed))
        {
            return "You are IrukaDark. Offer a gentle, empathetic check-in.";
        }

        return
            "You are IrukaDark, an empathetic assistant. The user highlighted the passage below. Detect the language and craft a brief, warm response in that language.\n" +
            "Guidelines:\n" +
            "- Acknowledge the user's feelings with genuine understanding.\n" +
            "- Offer encouragement or validation without sounding dismissive.\n" +
            "- Stay within 2 sentences and avoid emojis or excessive punctuation.\n\n" +
            "Highlighted text:\n" +
            trimmed;
    }

    public string BuildReplyVariationsPrompt(string text, string menuLanguage)
    {
        var trimmed = text?.Trim();
        if (string.IsNullOrEmpty(trimmed))
        {
            return "You are IrukaDark. No reply variations are required.";
        }

        var uiLanguageName = NormalizeLanguage(menuLanguage);
        var uiLanguageCode = GetLanguageCode(menuLanguage);

        return
            $"You are IrukaDark. Propose five alternative replies to the original message below.\n\n" +
            "Instructions:\n" +
            "- Detect the language of the original message and write each reply in that language.\n" +
            "- Keep each reply to 1-2 sentences with a relaxed but respectful tone. Avoid emojis and hashtags.\n" +
            $"- After every reply, add a paraphrase in {uiLanguageName} ({uiLanguageCode}) on the next line starting with \"Paraphrase ({uiLanguageName}):\".\n" +
            $"- Follow the paraphrase with an explanation line in {uiLanguageName} ({uiLanguageCode}) starting with \"Explanation ({uiLanguageName}):\" that clarifies the intent.\n" +
            "- Present the output as a numbered Markdown list (1. …, 2. …) exactly as shown in the format example.\n" +
            "- Keep each explanation concise and helpful.\n\n" +
            "Original message:\n" +
            trimmed +
            "\n\n" +
            "Format example:\n" +
            "1. Reply: <reply text>\n" +
            $"   Paraphrase ({uiLanguageName}): <paraphrase>\n" +
            $"   Explanation ({uiLanguageName}): <explanation>";
    }

    public string BuildSnsPostPrompt(string url, string content, bool truncated, string menuLanguage)
    {
        var trimmedUrl = string.IsNullOrWhiteSpace(url) ? "Unknown URL" : url.Trim();
        var body = content?.Trim() ?? string.Empty;
        var note = truncated
            ? "\n- Mention that only part of the page was captured due to length (if relevant)."
            : string.Empty;
        var uiLanguageName = NormalizeLanguage(menuLanguage);
        var uiLanguageCode = GetLanguageCode(menuLanguage);

        return
            "You are IrukaDark, drafting a short social post inspired by the article below.\n\n" +
            $"Target post language: {uiLanguageName} ({uiLanguageCode})\n" +
            "Platform: X / Twitter style.\n\n" +
            "Instructions:\n" +
            "- Summarize the key takeaway from the article in a friendly, conversational tone.\n" +
            "- Keep the post under 500 characters.\n" +
            "- End with 2-3 relevant hashtags (e.g., #TechTips) without repeating the same word.\n" +
            "- Avoid emojis and direct quotations longer than a short phrase." +
            note +
            "\n\n" +
            $"Article URL: {trimmedUrl}\n\n" +
            "Article text:\n" +
            body +
            "\n\n" +
            "Write the post:";
    }

    public string BuildPronouncePrompt(string text, string menuLanguage)
    {
        var trimmed = text?.Trim();
        if (string.IsNullOrEmpty(trimmed))
        {
            return "You are IrukaDark. Provide a pronunciation guide for an empty selection.";
        }

        var code = NormalizeLanguageCode(menuLanguage);
        var languageName = NormalizeLanguage(menuLanguage);
        return code switch
        {
            "ja" => $"次のテキストを日本語の読み（発音）に変換してください。\n要件:\n- 行や句読点などの構造は維持し、漢字はひらがな、外来語や固有名詞はカタカナで表記する\n- 長音は「ー」、促音は小さい「っ」で示す\n- 読みのみを出力し、原文や解説は書かない\n- 語のまとまりはスペースまたは・で区切って自然な読みになるよう調整する\n\nテキスト:\n{trimmed}",
            "zh-hans" or "zh-cn" or "zh" => $"Convert the text to Mandarin pronunciation written in Hanyu Pinyin with tone marks (mā, méi, wǒ).\nRequirements:\n- Preserve the original line breaks and punctuation\n- Separate syllables with spaces\n- Output only the Pinyin transcription without the original Hanzi or commentary\n- Use tone marks above vowels; if a tone mark cannot be applied, append the tone number.\n\nText:\n{trimmed}",
            "zh-hant" or "zh-tw" => $"Convert the text to Mandarin pronunciation written in Hanyu Pinyin with tone marks (mā, méi, wǒ).\nRequirements:\n- Keep the same line and punctuation layout\n- Separate syllables with spaces\n- Output only the Pinyin transcription (no Hanzi, no explanations)\n- Use tone marks above vowels or append the tone number when necessary.\n\nText:\n{trimmed}",
            "ko" => $"다음 문장을 실제 발음대로 한글로 표기하세요.\n요구 사항:\n- 원문의 줄바꿈과 구두점은 유지하고, 단어는 자연스러운 발음대로 띄어 쓴다\n- 로마자 표기나 설명을 덧붙이지 않는다\n- 받침과 연음 등 발음 변화를 반영한 한글 표기를 출력한다\n\n문장:\n{trimmed}",
            "th" => $"Transcribe the text into Thai pronunciation using Royal Thai General System (RTGS) romanization with tone numbers (1–5).\nRequirements:\n- Maintain the original line breaks and punctuation\n- Separate words with spaces and append tone numbers directly after each syllable\n- Output only the RTGS transcription (no Thai script, no explanations)\n\nText:\n{trimmed}",
            _ => $"Convert the text into its pronunciation notation for {languageName} using the International Phonetic Alphabet (IPA).\nRequirements:\n- Preserve the original line breaks and bullet structure while replacing words with their IPA transcription\n- Separate words with spaces and use syllable dots if they aid readability\n- Output only the IPA transcription without the original text or any commentary\n\nText:\n{trimmed}",
        };
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

    private static string GetLanguageCode(string language)
    {
        return NormalizeLanguageCode(language);
    }

    private static string NormalizeLanguageCode(string language)
    {
        if (string.IsNullOrWhiteSpace(language))
        {
            return "en";
        }

        var trimmed = language.Trim();
        var lower = trimmed.ToLowerInvariant();
        return lower switch
        {
            "en" or "english" => "en",
            "ja" or "japanese" => "ja",
            "zh-hans" or "zh_cn" or "zh-cn" or "simplified chinese" => "zh-Hans",
            "zh-hant" or "zh_tw" or "zh-tw" or "traditional chinese" => "zh-Hant",
            "zh" or "chinese" => "zh",
            "ko" or "korean" => "ko",
            "th" or "thai" => "th",
            "fr" or "french" => "fr",
            "de" or "german" => "de",
            "es" or "spanish" => "es",
            "pt" or "portuguese" => "pt",
            "pt-br" or "pt_br" or "brazilian portuguese" => "pt-BR",
            "it" or "italian" => "it",
            "ru" or "russian" => "ru",
            "id" or "indonesian" => "id",
            "vi" or "vietnamese" => "vi",
            "tr" or "turkish" => "tr",
            "ar" or "arabic" => "ar",
            _ => trimmed,
        };
    }
}
