using System;
using System.Net.Http;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;
using IrukaDark.App.Models;
using Windows.Data.Html;

namespace IrukaDark.App.Services;

public class UrlContentService
{
    private static readonly Regex Whitespace = new(@"\s+", RegexOptions.Compiled);
    private static readonly TimeSpan DefaultTimeout = TimeSpan.FromSeconds(10);
    private const int MaxLength = 5000;

    private readonly HttpClient _httpClient;

    public UrlContentService(HttpClient httpClient)
    {
        _httpClient = httpClient;
        if (_httpClient.Timeout == Timeout.InfiniteTimeSpan || _httpClient.Timeout > DefaultTimeout)
        {
            _httpClient.Timeout = DefaultTimeout;
        }
    }

    public async Task<UrlContentResult> FetchAsync(string? rawUrl, CancellationToken cancellationToken = default)
    {
        if (!TryNormalizeUrl(rawUrl, out var normalized, out var validationMessage))
        {
            return new UrlContentResult(false, validationMessage ?? "Invalid URL selection.");
        }

        try
        {
            using var request = new HttpRequestMessage(HttpMethod.Get, normalized);
            request.Headers.UserAgent.ParseAdd("IrukaDark-Windows/1.0");
            request.Headers.Accept.ParseAdd("text/html");
            using var response = await _httpClient.SendAsync(request, HttpCompletionOption.ResponseContentRead, cancellationToken).ConfigureAwait(false);
            if (!response.IsSuccessStatusCode)
            {
                return new UrlContentResult(false, $"HTTP {(int)response.StatusCode}: {response.ReasonPhrase ?? "Failed to fetch URL"}");
            }

            var contentType = response.Content.Headers.ContentType?.MediaType;
            if (!string.IsNullOrWhiteSpace(contentType) && !contentType.Contains("html", StringComparison.OrdinalIgnoreCase))
            {
                return new UrlContentResult(false, "URL must return HTML content.");
            }

            var html = await response.Content.ReadAsStringAsync(cancellationToken).ConfigureAwait(false);
            var text = CollapseWhitespace(HtmlUtilities.ConvertToText(html));
            if (string.IsNullOrWhiteSpace(text))
            {
                return new UrlContentResult(false, "No readable text found at URL.");
            }

            var truncated = text.Length > MaxLength;
            if (truncated)
            {
                text = text[..MaxLength];
            }

            return new UrlContentResult(
                true,
                truncated ? "Fetched article text (trimmed to 5000 characters)." : "Fetched article text.",
                response.RequestMessage?.RequestUri?.ToString() ?? normalized,
                text,
                truncated);
        }
        catch (TaskCanceledException)
        {
            return new UrlContentResult(false, "Request timed out.");
        }
        catch (OperationCanceledException)
        {
            return new UrlContentResult(false, "Request canceled.");
        }
        catch (Exception ex)
        {
            return new UrlContentResult(false, $"URL fetch failed: {ex.Message}");
        }
    }

    private static bool TryNormalizeUrl(string? value, out string normalized, out string? error)
    {
        normalized = string.Empty;
        error = null;

        var input = (value ?? string.Empty).Trim();
        if (string.IsNullOrEmpty(input))
        {
            error = "No URL detected in the selection.";
            return false;
        }

        if (!Uri.TryCreate(input, UriKind.Absolute, out var uri))
        {
            error = "URL is invalid.";
            return false;
        }

        if (!string.Equals(uri.Scheme, Uri.UriSchemeHttp, StringComparison.OrdinalIgnoreCase) &&
            !string.Equals(uri.Scheme, Uri.UriSchemeHttps, StringComparison.OrdinalIgnoreCase))
        {
            error = "URL must start with http:// or https://";
            return false;
        }

        normalized = uri.ToString();
        return true;
    }

    private static string CollapseWhitespace(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return string.Empty;
        }

        return Whitespace.Replace(value, " ").Trim();
    }
}
