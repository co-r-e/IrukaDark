using System;
using System.IO;
using System.Net.Http;
using System.Net.Http.Json;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Extensions.Configuration;

namespace IrukaDark.App.Services;

public class GeminiClient
{
    private readonly HttpClient _httpClient;
    private readonly PreferencesService _preferencesService;
    private readonly string _model;

    public GeminiClient(HttpClient httpClient, PreferencesService preferencesService, IConfiguration configuration)
    {
        _httpClient = httpClient;
        _preferencesService = preferencesService;
        _model = configuration["Gemini:Model"] ?? "gemini-2.5-flash-lite";
        _httpClient.BaseAddress ??= new Uri("https://generativelanguage.googleapis.com/");
    }

    public async Task<string> GenerateAsync(string prompt, CancellationToken cancellationToken = default)
    {
        var apiKey = _preferencesService.GetApiKey();
        if (string.IsNullOrWhiteSpace(apiKey))
        {
            return "GEMINI_API_KEY is not set.";
        }

        var requestUri = $"v1beta/models/{_model}:generateContent?key={apiKey}";
        var body = new
        {
            contents = new[]
            {
                new
                {
                    role = "user",
                    parts = new[] { new { text = prompt } }
                }
            }
        };

        try
        {
            using var response = await _httpClient.PostAsJsonAsync(requestUri, body, cancellationToken).ConfigureAwait(false);
            if (!response.IsSuccessStatusCode)
            {
                return $"Gemini request failed: {(int)response.StatusCode} {response.ReasonPhrase}";
            }

            await using var stream = await response.Content.ReadAsStreamAsync(cancellationToken).ConfigureAwait(false);
            using var document = await JsonDocument.ParseAsync(stream, cancellationToken: cancellationToken).ConfigureAwait(false);
            if (!document.RootElement.TryGetProperty("candidates", out var candidates) || candidates.GetArrayLength() == 0)
            {
                return "Gemini response missing candidates.";
            }

            var first = candidates[0];
            if (!first.TryGetProperty("content", out var content) || !content.TryGetProperty("parts", out var parts) || parts.GetArrayLength() == 0)
            {
                return "Gemini response missing content.";
            }

            return parts[0].GetProperty("text").GetString() ?? string.Empty;
        }
        catch (Exception ex)
        {
            return $"Gemini request error: {ex.Message}";
        }
    }

    public async Task<string> GenerateFromImageAsync(string prompt, string imagePath, CancellationToken cancellationToken = default)
    {
        var apiKey = _preferencesService.GetApiKey();
        if (string.IsNullOrWhiteSpace(apiKey))
        {
            return "GEMINI_API_KEY is not set.";
        }

        if (string.IsNullOrWhiteSpace(imagePath) || !File.Exists(imagePath))
        {
            return "Screenshot file is unavailable.";
        }

        var bytes = await File.ReadAllBytesAsync(imagePath, cancellationToken).ConfigureAwait(false);
        var base64 = Convert.ToBase64String(bytes);

        var requestUri = $"v1beta/models/{_model}:generateContent?key={apiKey}";
        var body = new
        {
            contents = new[]
            {
                new
                {
                    role = "user",
                    parts = new object[]
                    {
                        new { text = prompt },
                        new
                        {
                            inlineData = new
                            {
                                mimeType = "image/png",
                                data = base64
                            }
                        }
                    }
                }
            }
        };

        try
        {
            using var response = await _httpClient.PostAsJsonAsync(requestUri, body, cancellationToken).ConfigureAwait(false);
            if (!response.IsSuccessStatusCode)
            {
                return $"Gemini image request failed: {(int)response.StatusCode} {response.ReasonPhrase}";
            }

            await using var stream = await response.Content.ReadAsStreamAsync(cancellationToken).ConfigureAwait(false);
            using var document = await JsonDocument.ParseAsync(stream, cancellationToken: cancellationToken).ConfigureAwait(false);
            if (!document.RootElement.TryGetProperty("candidates", out var candidates) || candidates.GetArrayLength() == 0)
            {
                return "Gemini response missing candidates.";
            }

            var first = candidates[0];
            if (!first.TryGetProperty("content", out var content) || !content.TryGetProperty("parts", out var parts) || parts.GetArrayLength() == 0)
            {
                return "Gemini response missing content.";
            }

            return parts[0].GetProperty("text").GetString() ?? string.Empty;
        }
        catch (Exception ex)
        {
            return $"Gemini image request error: {ex.Message}";
        }
    }
}
