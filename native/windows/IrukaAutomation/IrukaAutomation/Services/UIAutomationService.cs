using System.Windows.Automation;
using IrukaAutomation.IPC;

namespace IrukaAutomation.Services;

/// <summary>
/// Service to get selected text using UI Automation API.
/// Fallback to Ctrl+C clipboard method if UI Automation fails.
/// </summary>
public static class UIAutomationService
{
    /// <summary>
    /// Get selected text from the focused application.
    /// Uses multiple strategies:
    /// 1. UI Automation TextPattern (cleanest, no side effects)
    /// 2. UI Automation ValuePattern (for single-line inputs)
    /// 3. Clipboard fallback with Ctrl+C (most compatible)
    /// </summary>
    /// <param name="timeoutMs">Timeout in milliseconds</param>
    /// <param name="promptAccessibility">Whether to prompt for accessibility permissions (Windows doesn't need this)</param>
    /// <returns>BridgeOutput with selected text or error</returns>
    public static BridgeOutput GetSelectedText(int timeoutMs = 1500, bool promptAccessibility = false)
    {
        try
        {
            // UI Automation requires STA thread
            return StaHelper.RunSta(() =>
            {
                // First, try UI Automation
                var result = TryGetSelectedTextViaUIAutomation();
                if (result != null)
                {
                    return result;
                }

                // Fallback to clipboard method (Ctrl+C)
                return ClipboardService.GetSelectedTextViaClipboard(timeoutMs);
            });
        }
        catch (Exception ex)
        {
            return BridgeOutput.Error(ErrorCodes.Unknown, ex.Message);
        }
    }

    /// <summary>
    /// Try to get selected text using UI Automation API.
    /// This method doesn't modify the clipboard.
    /// </summary>
    /// <returns>BridgeOutput if successful, null if should try fallback</returns>
    private static BridgeOutput? TryGetSelectedTextViaUIAutomation()
    {
        try
        {
            // Get the focused element
            var focusedElement = AutomationElement.FocusedElement;
            if (focusedElement == null)
            {
                return null; // No focused element, try fallback
            }

            // Try TextPattern first (for rich text controls, text areas, etc.)
            var textResult = TryGetSelectedTextFromTextPattern(focusedElement);
            if (textResult != null)
            {
                return textResult;
            }

            // Try TextPattern2 if available (more modern controls)
            var textPattern2Result = TryGetSelectedTextFromTextPattern2(focusedElement);
            if (textPattern2Result != null)
            {
                return textPattern2Result;
            }

            // Try ValuePattern for simple text inputs
            var valueResult = TryGetTextFromValuePattern(focusedElement);
            if (valueResult != null)
            {
                return valueResult;
            }

            // UI Automation didn't work, return null to try clipboard fallback
            return null;
        }
        catch (ElementNotAvailableException)
        {
            // Element is no longer available (window closed, etc.)
            return null;
        }
        catch (Exception)
        {
            // UI Automation failed, try fallback
            return null;
        }
    }

    /// <summary>
    /// Try to get selected text using TextPattern.
    /// </summary>
    private static BridgeOutput? TryGetSelectedTextFromTextPattern(AutomationElement element)
    {
        try
        {
            if (element.TryGetCurrentPattern(TextPattern.Pattern, out var pattern))
            {
                var textPattern = (TextPattern)pattern;
                var selection = textPattern.GetSelection();

                if (selection != null && selection.Length > 0)
                {
                    // Get text from all selected ranges
                    var selectedText = string.Join("", selection.Select(r => r.GetText(-1)));

                    if (!string.IsNullOrEmpty(selectedText))
                    {
                        return BridgeOutput.Ok(selectedText, "uiautomation-textpattern");
                    }
                }
            }
        }
        catch
        {
            // TextPattern not supported or failed
        }

        return null;
    }

    /// <summary>
    /// Try to get selected text using TextPattern2 (newer API).
    /// </summary>
    private static BridgeOutput? TryGetSelectedTextFromTextPattern2(AutomationElement element)
    {
        try
        {
            if (element.TryGetCurrentPattern(TextPattern2.Pattern, out var pattern))
            {
                var textPattern2 = (TextPattern2)pattern;
                var selection = textPattern2.GetSelection();

                if (selection != null && selection.Length > 0)
                {
                    var selectedText = string.Join("", selection.Select(r => r.GetText(-1)));

                    if (!string.IsNullOrEmpty(selectedText))
                    {
                        return BridgeOutput.Success(selectedText, "uiautomation-textpattern2");
                    }
                }
            }
        }
        catch
        {
            // TextPattern2 not supported or failed
        }

        return null;
    }

    /// <summary>
    /// Try to get text from ValuePattern (for simple text inputs).
    /// Note: ValuePattern doesn't support selection, so this only works
    /// if the entire text is "selected" in context.
    /// </summary>
    private static BridgeOutput? TryGetTextFromValuePattern(AutomationElement element)
    {
        try
        {
            if (element.TryGetCurrentPattern(ValuePattern.Pattern, out var pattern))
            {
                var valuePattern = (ValuePattern)pattern;
                var value = valuePattern.Current.Value;

                // ValuePattern doesn't tell us what's selected,
                // so we can't reliably use this for selection.
                // Only return if we can also verify there's a text selection.
                // For now, skip this and let clipboard fallback handle it.

                // However, if the element also supports TextPattern with empty selection,
                // and has a value, we might be dealing with a control where
                // all text is contextually "selected" (like a URL bar on focus)
                // For safety, don't use ValuePattern for selection.
            }
        }
        catch
        {
            // ValuePattern not supported or failed
        }

        return null;
    }

    /// <summary>
    /// Get information about the focused element (for debugging).
    /// </summary>
    public static string GetFocusedElementInfo()
    {
        try
        {
            var element = AutomationElement.FocusedElement;
            if (element == null)
            {
                return "No focused element";
            }

            var info = new List<string>
            {
                $"Name: {element.Current.Name}",
                $"ClassName: {element.Current.ClassName}",
                $"ControlType: {element.Current.ControlType.ProgrammaticName}",
                $"AutomationId: {element.Current.AutomationId}",
                $"ProcessId: {element.Current.ProcessId}"
            };

            // Check supported patterns
            var patterns = new List<string>();
            if (element.TryGetCurrentPattern(TextPattern.Pattern, out _))
                patterns.Add("TextPattern");
            if (element.TryGetCurrentPattern(TextPattern2.Pattern, out _))
                patterns.Add("TextPattern2");
            if (element.TryGetCurrentPattern(ValuePattern.Pattern, out _))
                patterns.Add("ValuePattern");

            info.Add($"SupportedPatterns: {string.Join(", ", patterns)}");

            return string.Join("\n", info);
        }
        catch (Exception ex)
        {
            return $"Error getting element info: {ex.Message}";
        }
    }

    /// <summary>
    /// Check if accessibility/UI Automation is available.
    /// On Windows, this is always available without user permission.
    /// </summary>
    public static bool IsAccessibilityAvailable()
    {
        try
        {
            // Try to get the root element - this should always work on Windows
            var root = AutomationElement.RootElement;
            return root != null;
        }
        catch
        {
            return false;
        }
    }
}
