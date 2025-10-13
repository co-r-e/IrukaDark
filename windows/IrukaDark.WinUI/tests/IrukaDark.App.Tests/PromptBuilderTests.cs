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
}
