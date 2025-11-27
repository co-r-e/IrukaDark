using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Media;
using System.Windows.Media.Imaging;

namespace IrukaAutomation.UI.Windows;

/// <summary>
/// Clipboard popup window for displaying history, images, and snippets.
/// </summary>
public partial class ClipboardPopupWindow : Window
{
    public event EventHandler<ClipboardItemSelectedEventArgs>? ItemSelected;
    public event EventHandler? PopupClosed;

    private List<ClipboardItemViewModel> _items = new();

    public ClipboardPopupWindow()
    {
        InitializeComponent();
        Loaded += Window_Loaded;
    }

    private void Window_Loaded(object sender, RoutedEventArgs e)
    {
        // Focus the list when window loads
        ItemList.Focus();
    }

    /// <summary>
    /// Set clipboard items to display.
    /// </summary>
    public void SetItems(IEnumerable<ClipboardItemViewModel> items)
    {
        _items = items.ToList();
        ItemList.ItemsSource = _items;
        if (ItemList.Items.Count > 0)
        {
            ItemList.SelectedIndex = 0;
            ItemList.ScrollIntoView(ItemList.Items[0]);
        }
    }

    /// <summary>
    /// Apply dark or light theme.
    /// </summary>
    public void SetDarkMode(bool isDark)
    {
        if (isDark)
        {
            Resources["PopupBackground"] = new SolidColorBrush(Color.FromRgb(0x1E, 0x1E, 0x1E));
            Resources["PopupBorder"] = new SolidColorBrush(Color.FromRgb(0x3E, 0x3E, 0x3E));
            Resources["TextPrimary"] = new SolidColorBrush(Color.FromRgb(0xE0, 0xE0, 0xE0));
            Resources["TextMuted"] = new SolidColorBrush(Color.FromRgb(0x80, 0x80, 0x80));
            Resources["ItemBackground"] = new SolidColorBrush(Colors.Transparent);
            Resources["ItemSelectedBackground"] = new SolidColorBrush(Color.FromRgb(0x3E, 0x3E, 0x3E));
            Resources["ItemHoverBackground"] = new SolidColorBrush(Color.FromRgb(0x2E, 0x2E, 0x2E));
            Resources["NumberBadgeBackground"] = new SolidColorBrush(Color.FromRgb(0x4E, 0x4E, 0x4E));
        }
        else
        {
            Resources["PopupBackground"] = new SolidColorBrush(Color.FromRgb(0xF5, 0xF5, 0xF5));
            Resources["PopupBorder"] = new SolidColorBrush(Color.FromRgb(0xD0, 0xD0, 0xD0));
            Resources["TextPrimary"] = new SolidColorBrush(Color.FromRgb(0x20, 0x20, 0x20));
            Resources["TextMuted"] = new SolidColorBrush(Color.FromRgb(0x60, 0x60, 0x60));
            Resources["ItemBackground"] = new SolidColorBrush(Colors.Transparent);
            Resources["ItemSelectedBackground"] = new SolidColorBrush(Color.FromRgb(0xE0, 0xE0, 0xE0));
            Resources["ItemHoverBackground"] = new SolidColorBrush(Color.FromRgb(0xEA, 0xEA, 0xEA));
            Resources["NumberBadgeBackground"] = new SolidColorBrush(Color.FromRgb(0xD0, 0xD0, 0xD0));
        }
    }

    /// <summary>
    /// Set active tab.
    /// </summary>
    public void SetActiveTab(string tab)
    {
        switch (tab.ToLowerInvariant())
        {
            case "history":
                HistoryTab.IsChecked = true;
                break;
            case "historyimage":
                ImageTab.IsChecked = true;
                break;
            case "snippet":
                SnippetTab.IsChecked = true;
                break;
        }
    }

    private void Window_Deactivated(object sender, EventArgs e)
    {
        // Close popup when it loses focus
        PopupClosed?.Invoke(this, EventArgs.Empty);
        Close();
    }

    private void Window_KeyDown(object sender, KeyEventArgs e)
    {
        // Number keys 1-9 for quick selection
        if (e.Key >= Key.D1 && e.Key <= Key.D9)
        {
            int index = e.Key - Key.D1;
            SelectItemByIndex(index);
            e.Handled = true;
            return;
        }

        // Numpad 1-9
        if (e.Key >= Key.NumPad1 && e.Key <= Key.NumPad9)
        {
            int index = e.Key - Key.NumPad1;
            SelectItemByIndex(index);
            e.Handled = true;
            return;
        }

        // Escape to close
        if (e.Key == Key.Escape)
        {
            PopupClosed?.Invoke(this, EventArgs.Empty);
            Close();
            e.Handled = true;
            return;
        }

        // Enter to select
        if (e.Key == Key.Enter && ItemList.SelectedItem is ClipboardItemViewModel item)
        {
            OnItemSelected(item);
            e.Handled = true;
            return;
        }

        // Tab to switch tabs
        if (e.Key == Key.Tab)
        {
            SwitchToNextTab();
            e.Handled = true;
            return;
        }
    }

    private void SelectItemByIndex(int index)
    {
        if (index >= 0 && index < _items.Count)
        {
            OnItemSelected(_items[index]);
        }
    }

    private void SwitchToNextTab()
    {
        if (HistoryTab.IsChecked == true)
        {
            ImageTab.IsChecked = true;
        }
        else if (ImageTab.IsChecked == true)
        {
            SnippetTab.IsChecked = true;
        }
        else
        {
            HistoryTab.IsChecked = true;
        }
    }

    private void ItemList_KeyDown(object sender, KeyEventArgs e)
    {
        if (e.Key == Key.Enter && ItemList.SelectedItem is ClipboardItemViewModel item)
        {
            OnItemSelected(item);
            e.Handled = true;
        }
    }

    private void ItemList_MouseDoubleClick(object sender, MouseButtonEventArgs e)
    {
        if (ItemList.SelectedItem is ClipboardItemViewModel item)
        {
            OnItemSelected(item);
        }
    }

    private void Tab_Checked(object sender, RoutedEventArgs e)
    {
        // TODO: Load different items based on selected tab
        // This would be handled by the parent to send new items
    }

    private void OnItemSelected(ClipboardItemViewModel item)
    {
        ItemSelected?.Invoke(this, new ClipboardItemSelectedEventArgs(item));
        Close();
    }
}

/// <summary>
/// Event args for item selection.
/// </summary>
public class ClipboardItemSelectedEventArgs : EventArgs
{
    public ClipboardItemViewModel Item { get; }

    public ClipboardItemSelectedEventArgs(ClipboardItemViewModel item)
    {
        Item = item;
    }
}

/// <summary>
/// View model for clipboard items.
/// </summary>
public class ClipboardItemViewModel
{
    public string? Text { get; set; }
    public string? ImageData { get; set; }
    public string? ImageDataOriginal { get; set; }
    public long? Timestamp { get; set; }

    public string DisplayText
    {
        get
        {
            if (!string.IsNullOrEmpty(Text))
            {
                // Remove line breaks and truncate
                var singleLine = Text.Replace("\r", "").Replace("\n", " ");
                return singleLine.Length > 50 ? singleLine[..50] + "..." : singleLine;
            }
            return ImageData != null ? "[Image]" : "[Empty]";
        }
    }

    public bool HasImage => !string.IsNullOrEmpty(ImageData);

    public ImageSource? ThumbnailImage
    {
        get
        {
            if (string.IsNullOrEmpty(ImageData)) return null;

            try
            {
                // Parse data URL
                var base64 = ImageData;
                if (ImageData.StartsWith("data:"))
                {
                    var commaIndex = ImageData.IndexOf(',');
                    if (commaIndex > 0)
                    {
                        base64 = ImageData[(commaIndex + 1)..];
                    }
                }

                var bytes = Convert.FromBase64String(base64);
                using var ms = new System.IO.MemoryStream(bytes);
                var image = new BitmapImage();
                image.BeginInit();
                image.StreamSource = ms;
                image.CacheOption = BitmapCacheOption.OnLoad;
                image.DecodePixelWidth = 40; // Thumbnail size
                image.EndInit();
                image.Freeze();
                return image;
            }
            catch
            {
                return null;
            }
        }
    }
}

/// <summary>
/// Converter for item index to display number (1-9).
/// </summary>
public class IndexToNumberConverter : System.Windows.Data.IValueConverter
{
    public object Convert(object value, Type targetType, object parameter, System.Globalization.CultureInfo culture)
    {
        if (value is ListBoxItem listBoxItem)
        {
            var listBox = ItemsControl.ItemsControlFromItemContainer(listBoxItem) as ListBox;
            if (listBox != null)
            {
                int index = listBox.ItemContainerGenerator.IndexFromContainer(listBoxItem);
                if (index >= 0 && index < 9)
                {
                    return (index + 1).ToString();
                }
            }
        }
        return "";
    }

    public object ConvertBack(object value, Type targetType, object parameter, System.Globalization.CultureInfo culture)
    {
        throw new NotImplementedException();
    }
}

/// <summary>
/// Converter for item index to visibility (visible for 1-9, hidden for 10+).
/// </summary>
public class IndexToVisibilityConverter : System.Windows.Data.IValueConverter
{
    public object Convert(object value, Type targetType, object parameter, System.Globalization.CultureInfo culture)
    {
        if (value is ListBoxItem listBoxItem)
        {
            var listBox = ItemsControl.ItemsControlFromItemContainer(listBoxItem) as ListBox;
            if (listBox != null)
            {
                int index = listBox.ItemContainerGenerator.IndexFromContainer(listBoxItem);
                if (index >= 0 && index < 9)
                {
                    return Visibility.Visible;
                }
            }
        }
        return Visibility.Collapsed;
    }

    public object ConvertBack(object value, Type targetType, object parameter, System.Globalization.CultureInfo culture)
    {
        throw new NotImplementedException();
    }
}
