using System;
using System.Collections.ObjectModel;
using System.ComponentModel;
using System.Runtime.CompilerServices;
using CommunityToolkit.WinUI.UI;
using IrukaDark.App.Models;

namespace IrukaDark.App.ViewModels;

public class MainViewModel : INotifyPropertyChanged
{
    private string _apiKey = string.Empty;
    private string _statusMessage = string.Empty;
    private string _draftMessage = string.Empty;
    private string _transcriptFilter = "All";

    public ObservableCollection<HotkeyRegistration> RegisteredHotkeys { get; } = new();
    public ObservableCollection<ChatMessage> Transcript { get; } = new();
    public AdvancedCollectionView TranscriptView { get; }

    public MainViewModel()
    {
        TranscriptView = new AdvancedCollectionView(Transcript, true);
        ApplyTranscriptFilter();
    }

    public string ApiKey
    {
        get => _apiKey;
        set => SetField(ref _apiKey, value);
    }

    public string StatusMessage
    {
        get => _statusMessage;
        set => SetField(ref _statusMessage, value);
    }

    public string DraftMessage
    {
        get => _draftMessage;
        set => SetField(ref _draftMessage, value);
    }

    public string TranscriptFilter
    {
        get => _transcriptFilter;
        set
        {
            if (SetField(ref _transcriptFilter, value))
            {
                ApplyTranscriptFilter();
            }
        }
    }

    public void ApplyTranscriptFilter()
    {
        TranscriptView.Filter = item =>
        {
            if (item is not ChatMessage message)
            {
                return false;
            }

            return _transcriptFilter switch
            {
                "User" => string.Equals(message.Role, "User", StringComparison.OrdinalIgnoreCase),
                "Assistant" => string.Equals(message.Role, "IrukaDark", StringComparison.OrdinalIgnoreCase),
                _ => true,
            };
        };

        TranscriptView.Refresh();
    }

    public event PropertyChangedEventHandler? PropertyChanged;

    protected bool SetField<T>(ref T field, T value, [CallerMemberName] string? propertyName = null)
    {
        if (EqualityComparer<T>.Default.Equals(field, value))
        {
            return false;
        }

        field = value;
        PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(propertyName));
        return true;
    }
}
