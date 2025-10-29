using System;
using System.IO;
using System.Text.RegularExpressions;
using IrukaDark.App.Services;
using IrukaDark.App.ViewModels;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using WinRT.Interop;

namespace IrukaDark.App;

public sealed partial class MainWindow : Window
{
    private readonly WindowCoordinator _windowCoordinator;
    private readonly CaptureService _captureService;
    private readonly PreferencesService _preferencesService;
    private readonly HotkeyManager _hotkeyManager;
    private readonly ClipboardSelectionService _clipboardSelectionService;
    private readonly GeminiClient _geminiClient;
    private readonly UrlContentService _urlContentService;
    private readonly PromptBuilder _promptBuilder;

    public MainViewModel ViewModel { get; }

    public MainWindow(
        WindowCoordinator windowCoordinator,
        CaptureService captureService,
        PreferencesService preferencesService,
        HotkeyManager hotkeyManager,
        ClipboardSelectionService clipboardSelectionService,
        GeminiClient geminiClient,
        UrlContentService urlContentService,
        PromptBuilder promptBuilder,
        MainViewModel viewModel)
    {
        InitializeComponent();

        _windowCoordinator = windowCoordinator;
        _captureService = captureService;
        _preferencesService = preferencesService;
        _hotkeyManager = hotkeyManager;
        _clipboardSelectionService = clipboardSelectionService;
        _geminiClient = geminiClient;
        _urlContentService = urlContentService;
        _promptBuilder = promptBuilder;
        ViewModel = viewModel;
        ViewModel.ApiKey = preferencesService.GetApiKey();
        ViewModel.StatusMessage = "Ready.";

        Title = "IrukaDark";

        ExtendsContentIntoTitleBar = true;
        SetTitleBar(new Grid());

        DataContext = this;

        RefreshHotkeys();
        _hotkeyManager.HotkeyActivated += HotkeyManagerOnHotkeyActivated;
        Closed += OnClosed;
    }

    private async void CaptureButton_OnClick(object sender, RoutedEventArgs e)
    {
        ViewModel.StatusMessage = "Starting capture…";
        var windowHandle = WindowNative.GetWindowHandle(this);
        var result = await _captureService.CaptureInteractiveAsync(windowHandle);
        ViewModel.StatusMessage = result.Message;
    }

    private void OnTopToggle_OnToggled(object sender, RoutedEventArgs e)
    {
        if (sender is ToggleSwitch toggle)
        {
            _windowCoordinator.SetAlwaysOnTop(toggle.IsOn);
        }
    }

    private async void SaveApiKey_OnClick(object sender, RoutedEventArgs e)
    {
        await _preferencesService.SetApiKeyAsync(ViewModel.ApiKey);
        ViewModel.StatusMessage = "API key saved.";
    }

    public void RefreshHotkeys()
    {
        ViewModel.RegisteredHotkeys.Clear();
        foreach (var hotkey in _hotkeyManager.DescribeRegisteredHotkeys())
        {
            ViewModel.RegisteredHotkeys.Add(hotkey);
        }
    }

    private void OnClosed(object sender, WindowEventArgs e)
    {
        _hotkeyManager.HotkeyActivated -= HotkeyManagerOnHotkeyActivated;
        _hotkeyManager.Dispose();
    }

    private void FilterCombo_OnSelectionChanged(object sender, SelectionChangedEventArgs e)
    {
        if (sender is ComboBox combo && combo.SelectedItem is ComboBoxItem item && item.Tag is string tag)
        {
            ViewModel.TranscriptFilter = tag;
        }
    }

    private async void PreviewSend_OnClick(object sender, RoutedEventArgs e)
    {
        var draft = ViewModel.DraftMessage?.Trim();
        if (string.IsNullOrEmpty(draft))
        {
            ViewModel.StatusMessage = "Enter text to preview.";
            return;
        }

        ViewModel.Transcript.Add(new Models.ChatMessage("User", draft));
        ViewModel.StatusMessage = "Previewing with Gemini…";
        var prompt = _promptBuilder.BuildExplainPrompt(draft, detailed: false);
        var response = await _geminiClient.GenerateAsync(prompt);
        ViewModel.StatusMessage = response;
        ViewModel.Transcript.Add(new Models.ChatMessage("IrukaDark", response));
        ViewModel.DraftMessage = string.Empty;
    }

    private async void HotkeyManagerOnHotkeyActivated(object? sender, Models.HotkeyRegistration e)
    {
        try
        {
            switch (e.Action)
            {
                case Models.HotkeyActions.ExplainCompact:
                case Models.HotkeyActions.ExplainDetailed:
                {
                    var detailed = e.Action == Models.HotkeyActions.ExplainDetailed;
                    var selected = await _clipboardSelectionService.CaptureSelectedTextAsync();
                    if (string.IsNullOrWhiteSpace(selected))
                    {
                        ViewModel.StatusMessage = "No selectable text detected.";
                        return;
                    }

                    ViewModel.Transcript.Add(new Models.ChatMessage("User", selected));
                    var prompt = _promptBuilder.BuildExplainPrompt(selected, detailed);
                    ViewModel.StatusMessage = "Requesting Gemini response…";
                    var response = await _geminiClient.GenerateAsync(prompt);
                    ViewModel.StatusMessage = response;
                    ViewModel.Transcript.Add(new Models.ChatMessage("IrukaDark", response));
                    break;
                }
                case Models.HotkeyActions.Translate:
                {
                    var selected = await _clipboardSelectionService.CaptureSelectedTextAsync();
                    if (string.IsNullOrWhiteSpace(selected))
                    {
                        ViewModel.StatusMessage = "No selectable text detected.";
                        return;
                    }

                    ViewModel.Transcript.Add(new Models.ChatMessage("User", selected));
                    var targetLanguage = _preferencesService.GetMenuLanguage();
                    var prompt = _promptBuilder.BuildTranslatePrompt(selected, targetLanguage);
                    ViewModel.StatusMessage = "Translating with Gemini…";
                    var response = await _geminiClient.GenerateAsync(prompt);
                    ViewModel.StatusMessage = response;
                    ViewModel.Transcript.Add(new Models.ChatMessage("IrukaDark", response));
                    break;
                }
                case Models.HotkeyActions.UrlSummary:
                case Models.HotkeyActions.UrlDetailed:
                {
                    var detailed = e.Action == Models.HotkeyActions.UrlDetailed;
                    var selected = await _clipboardSelectionService.CaptureSelectedTextAsync();
                    if (string.IsNullOrWhiteSpace(selected))
                    {
                        ViewModel.StatusMessage = "No selectable text detected.";
                        return;
                    }

                    ViewModel.StatusMessage = "Fetching URL content…";
                    var url = ExtractFirstUrl(selected) ?? selected;
                    var urlResult = await _urlContentService.FetchAsync(url);
                    if (!urlResult.Success || string.IsNullOrWhiteSpace(urlResult.Text))
                    {
                        ViewModel.StatusMessage = urlResult.Message;
                        return;
                    }

                    ViewModel.StatusMessage = urlResult.Message;
                    var finalUrl = urlResult.FinalUrl ?? selected;
                    var label = detailed ? "[URL detailed]" : "[URL summary]";
                    ViewModel.Transcript.Add(new Models.ChatMessage("User", $"{label} {finalUrl}"));

                    var prompt = detailed
                        ? _promptBuilder.BuildUrlDetailedPrompt(finalUrl, urlResult.Text!, urlResult.Truncated)
                        : _promptBuilder.BuildUrlSummaryPrompt(finalUrl, urlResult.Text!, urlResult.Truncated);

                    ViewModel.StatusMessage = detailed
                        ? "Analyzing URL with Gemini…"
                        : "Summarizing URL with Gemini…";

                    var response = await _geminiClient.GenerateAsync(prompt);
                    ViewModel.StatusMessage = response;
                    ViewModel.Transcript.Add(new Models.ChatMessage("IrukaDark", response));
                    break;
                }
                case Models.HotkeyActions.Empathy:
                {
                    var selected = await _clipboardSelectionService.CaptureSelectedTextAsync();
                    if (string.IsNullOrWhiteSpace(selected))
                    {
                        ViewModel.StatusMessage = "No selectable text detected.";
                        return;
                    }

                    ViewModel.Transcript.Add(new Models.ChatMessage("User", $"[Empathy] {selected}"));
                    ViewModel.StatusMessage = "Drafting empathy reply…";
                    var prompt = _promptBuilder.BuildEmpathyPrompt(selected);
                    var response = await _geminiClient.GenerateAsync(prompt);
                    ViewModel.StatusMessage = response;
                    ViewModel.Transcript.Add(new Models.ChatMessage("IrukaDark", response));
                    break;
                }
                case Models.HotkeyActions.ReplyVariations:
                {
                    var selected = await _clipboardSelectionService.CaptureSelectedTextAsync();
                    if (string.IsNullOrWhiteSpace(selected))
                    {
                        ViewModel.StatusMessage = "No selectable text detected.";
                        return;
                    }

                    ViewModel.Transcript.Add(new Models.ChatMessage("User", $"[Reply variations] {selected}"));
                    ViewModel.StatusMessage = "Generating reply variations…";
                    var uiLanguage = _preferencesService.GetMenuLanguage();
                    var prompt = _promptBuilder.BuildReplyVariationsPrompt(selected, uiLanguage);
                    var response = await _geminiClient.GenerateAsync(prompt);
                    ViewModel.StatusMessage = response;
                    ViewModel.Transcript.Add(new Models.ChatMessage("IrukaDark", response));
                    break;
                }
                case Models.HotkeyActions.Pronounce:
                {
                    var selected = await _clipboardSelectionService.CaptureSelectedTextAsync();
                    if (string.IsNullOrWhiteSpace(selected))
                    {
                        ViewModel.StatusMessage = "No selectable text detected.";
                        return;
                    }

                    ViewModel.Transcript.Add(new Models.ChatMessage("User", $"[Pronounce] {selected}"));
                    ViewModel.StatusMessage = "Generating pronunciation…";
                    var uiLanguage = _preferencesService.GetMenuLanguage();
                    var prompt = _promptBuilder.BuildPronouncePrompt(selected, uiLanguage);
                    var response = await _geminiClient.GenerateAsync(prompt);
                    ViewModel.StatusMessage = response;
                    ViewModel.Transcript.Add(new Models.ChatMessage("IrukaDark", response));
                    break;
                }
                case Models.HotkeyActions.SnsPost:
                {
                    var selected = await _clipboardSelectionService.CaptureSelectedTextAsync();
                    if (string.IsNullOrWhiteSpace(selected))
                    {
                        ViewModel.StatusMessage = "No selectable text detected.";
                        return;
                    }

                    ViewModel.StatusMessage = "Fetching URL content…";
                    var url = ExtractFirstUrl(selected) ?? selected;
                    var urlResult = await _urlContentService.FetchAsync(url);
                    if (!urlResult.Success || string.IsNullOrWhiteSpace(urlResult.Text))
                    {
                        ViewModel.StatusMessage = urlResult.Message;
                        return;
                    }

                    ViewModel.StatusMessage = urlResult.Message;
                    var finalUrl = urlResult.FinalUrl ?? url;
                    ViewModel.Transcript.Add(new Models.ChatMessage("User", $"[Social post] {finalUrl}"));

                    var uiLanguage = _preferencesService.GetMenuLanguage();
                    var prompt = _promptBuilder.BuildSnsPostPrompt(finalUrl, urlResult.Text!, urlResult.Truncated, uiLanguage);
                    ViewModel.StatusMessage = "Drafting social post…";
                    var response = await _geminiClient.GenerateAsync(prompt);
                    ViewModel.StatusMessage = response;
                    ViewModel.Transcript.Add(new Models.ChatMessage("IrukaDark", response));
                    break;
                }
                case Models.HotkeyActions.ScreenshotDetailed:
                {
                    ViewModel.StatusMessage = "Starting capture…";
                    var windowHandle = WindowNative.GetWindowHandle(this);
                    var result = await _captureService.CaptureInteractiveAsync(windowHandle);
                    ViewModel.StatusMessage = result.Message;
                    if (!result.Success || string.IsNullOrEmpty(result.FilePath))
                    {
                        return;
                    }

                    ViewModel.Transcript.Add(new Models.ChatMessage("User", $"[Screenshot detailed] {Path.GetFileName(result.FilePath)}"));
                    var prompt = _promptBuilder.BuildScreenshotDetailedPrompt();
                    ViewModel.StatusMessage = "Analyzing screenshot (detailed)…";
                    var response = await _geminiClient.GenerateFromImageAsync(prompt, result.FilePath);
                    ViewModel.StatusMessage = response;
                    ViewModel.Transcript.Add(new Models.ChatMessage("IrukaDark", response));
                    break;
                }
                case Models.HotkeyActions.Screenshot:
                {
                    ViewModel.StatusMessage = "Starting capture…";
                    var windowHandle = WindowNative.GetWindowHandle(this);
                    var result = await _captureService.CaptureInteractiveAsync(windowHandle);
                    ViewModel.StatusMessage = result.Message;
                    if (!result.Success || string.IsNullOrEmpty(result.FilePath))
                    {
                        return;
                    }

                    ViewModel.Transcript.Add(new Models.ChatMessage("User", $"[Screenshot] {Path.GetFileName(result.FilePath)}"));
                    var prompt = _promptBuilder.BuildScreenshotPrompt();
                    ViewModel.StatusMessage = "Analyzing screenshot with Gemini…";
                    var response = await _geminiClient.GenerateFromImageAsync(prompt, result.FilePath);
                    ViewModel.StatusMessage = response;
                    ViewModel.Transcript.Add(new Models.ChatMessage("IrukaDark", response));
                    break;
                }
                default:
                    ViewModel.StatusMessage = $"Shortcut triggered: {e.DisplayGesture}";
                    break;
            }
        }
        catch (Exception ex)
        {
            ViewModel.StatusMessage = $"Error handling hotkey: {ex.Message}";
        }
    }

    private static string? ExtractFirstUrl(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return null;
        }

        const string pattern = @"https?://[^\s<>()]+";
        var match = Regex.Match(value, pattern, RegexOptions.IgnoreCase);
        if (!match.Success)
        {
            return null;
        }

        var candidate = match.Value.TrimEnd('.', ',', ';', ')', ']', '}', '"', '\'');
        return candidate;
    }
}
