using IrukaDark.App.Services;
using Microsoft.VisualStudio.TestTools.UnitTesting;

namespace IrukaDark.App.Tests;

[TestClass]
public class PromptBuilderTests
{
    private readonly PromptBuilder _builder = new();

    [TestMethod]
    public void BuildExplainPrompt_Concise_IncludesInstruction()
    {
        var prompt = _builder.BuildExplainPrompt("Test concept", detailed: false);
        Assert.IsTrue(prompt.Contains("concise"), "Concise instruction missing");
        Assert.IsTrue(prompt.Contains("Test concept"), "Source text missing");
    }

    [TestMethod]
    public void BuildExplainPrompt_Detailed_RequestsStructure()
    {
        var prompt = _builder.BuildExplainPrompt("Deep dive", detailed: true);
        Assert.IsTrue(prompt.Contains("structured"), "Structured guidance missing");
    }

    [TestMethod]
    public void BuildTranslatePrompt_NormalizesLanguageCode()
    {
        var prompt = _builder.BuildTranslatePrompt("こんにちは", "ja");
        StringAssert.Contains(prompt, "Japanese");
    }

    [TestMethod]
    public void BuildScreenshotPrompt_DefaultInstruction()
    {
        var prompt = _builder.BuildScreenshotPrompt();
        StringAssert.Contains(prompt, "Describe the screenshot");
    }

    [TestMethod]
    public void BuildUrlSummaryPrompt_IncludesOrderedSentences()
    {
        var prompt = _builder.BuildUrlSummaryPrompt("https://example.com", "Sample content", truncated: false);
        StringAssert.Contains(prompt, "four-sentence digest");
        StringAssert.Contains(prompt, "1) Top takeaway");
        StringAssert.Contains(prompt, "Source URL: https://example.com");
    }

    [TestMethod]
    public void BuildUrlDetailedPrompt_IncludesSectionsAndTruncationNote()
    {
        var prompt = _builder.BuildUrlDetailedPrompt("https://example.com", "Sample content", truncated: true);
        StringAssert.Contains(prompt, "Overview, Key Points, Background, Risks, Recommended Actions");
        StringAssert.Contains(prompt, "Source URL: https://example.com");
        StringAssert.Contains(prompt, "truncated to 5000 characters");
    }

    [TestMethod]
    public void BuildEmpathyPrompt_IncludesGuidelines()
    {
        var prompt = _builder.BuildEmpathyPrompt("ありがとう");
        StringAssert.Contains(prompt, "Detect the language");
        StringAssert.Contains(prompt, "2 sentences");
    }

    [TestMethod]
    public void BuildReplyVariationsPrompt_UsesUiLanguage()
    {
        var prompt = _builder.BuildReplyVariationsPrompt("Hello there", "ja");
        StringAssert.Contains(prompt, "Paraphrase (Japanese)");
        StringAssert.Contains(prompt, "Explanation (Japanese)");
        StringAssert.Contains(prompt, "numbered Markdown");
    }

    [TestMethod]
    public void BuildSnsPostPrompt_IncludesHashtagInstruction()
    {
        var prompt = _builder.BuildSnsPostPrompt("https://example.com", "Body text", false, "en");
        StringAssert.Contains(prompt, "End with 2-3 relevant hashtags");
        StringAssert.Contains(prompt, "Article URL: https://example.com");
    }

    [TestMethod]
    public void BuildScreenshotDetailedPrompt_IncludesStructure()
    {
        var prompt = _builder.BuildScreenshotDetailedPrompt();
        StringAssert.Contains(prompt, "structured explanation");
        StringAssert.Contains(prompt, "key points");
    }

    [TestMethod]
    public void BuildPronouncePrompt_Japanese_UsesKanaInstructions()
    {
        var prompt = _builder.BuildPronouncePrompt("ありがとう", "ja");
        StringAssert.Contains(prompt, "ひらがな");
        StringAssert.Contains(prompt, "小さい「っ」");
    }

    [TestMethod]
    public void BuildPronouncePrompt_Default_UsesIpa()
    {
        var prompt = _builder.BuildPronouncePrompt("hello", "en");
        StringAssert.Contains(prompt, "International Phonetic Alphabet");
        StringAssert.Contains(prompt, "Text:\nhello");
    }
}
