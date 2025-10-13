using System;
using System.IO;
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
    private readonly PromptBuilder _promptBuilder;

    public MainViewModel ViewModel { get; }

    public MainWindow(
        WindowCoordinator windowCoordinator,
        CaptureService captureService,
        PreferencesService preferencesService,
        HotkeyManager hotkeyManager,
        ClipboardSelectionService clipboardSelectionService,
        GeminiClient geminiClient,
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
}
