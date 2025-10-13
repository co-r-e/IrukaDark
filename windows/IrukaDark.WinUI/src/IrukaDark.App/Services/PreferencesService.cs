using System;
using System.Collections.Generic;
using System.IO;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;

namespace IrukaDark.App.Services;

public class PreferencesService
{
    private readonly string _prefsPath;
    private readonly SemaphoreSlim _lock = new(1, 1);

    public PreferencesService()
    {
        var appData = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
        _prefsPath = Path.Combine(appData, "IrukaDark", "irukadark.prefs.json");
    }

    public string GetApiKey()
    {
        var prefs = LoadAsync().GetAwaiter().GetResult();
        return prefs.TryGetValue("GEMINI_API_KEY", out var key) ? key : string.Empty;
    }

    public string GetMenuLanguage()
    {
        var prefs = LoadAsync().GetAwaiter().GetResult();
        if (prefs.TryGetValue("MENU_LANGUAGE", out var lang) && !string.IsNullOrWhiteSpace(lang))
        {
            return lang;
        }
        return "English";
    }

    public async Task SetApiKeyAsync(string apiKey)
    {
        await _lock.WaitAsync().ConfigureAwait(false);
        try
        {
            var prefs = await LoadAsync().ConfigureAwait(false);
            prefs["GEMINI_API_KEY"] = apiKey;
            await SaveAsync(prefs).ConfigureAwait(false);
        }
        finally
        {
            _lock.Release();
        }
    }

    private async Task<Dictionary<string, string>> LoadAsync()
    {
        try
        {
            if (!File.Exists(_prefsPath))
            {
                return new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
            }

            await using var stream = File.OpenRead(_prefsPath);
            var prefs = await JsonSerializer.DeserializeAsync<Dictionary<string, string>>(stream).ConfigureAwait(false);
            return prefs ?? new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        }
        catch
        {
            return new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        }
    }

    private async Task SaveAsync(Dictionary<string, string> prefs)
    {
        var directory = Path.GetDirectoryName(_prefsPath);
        if (!string.IsNullOrEmpty(directory) && !Directory.Exists(directory))
        {
            Directory.CreateDirectory(directory);
        }

        await using var stream = File.Open(_prefsPath, FileMode.Create, FileAccess.Write, FileShare.None);
        await JsonSerializer.SerializeAsync(stream, prefs, new JsonSerializerOptions { WriteIndented = true }).ConfigureAwait(false);
    }
}
