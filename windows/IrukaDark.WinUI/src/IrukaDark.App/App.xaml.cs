using System;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.UI.Xaml;
using IrukaDark.App.Services;
using IrukaDark.App.ViewModels;

namespace IrukaDark.App;

public partial class App : Application
{
    private static IHost? _host;
    public static IHost Host => _host ??= CreateHostBuilder().Build();

    public App()
    {
        InitializeComponent();
    }

    protected override async void OnLaunched(LaunchActivatedEventArgs args)
    {
        await Host.StartAsync();

        var window = Host.Services.GetRequiredService<MainWindow>();
        window.Activate();

        var windowCoordinator = Host.Services.GetRequiredService<WindowCoordinator>();
        windowCoordinator.Attach(window);

        var hotkeys = Host.Services.GetRequiredService<HotkeyManager>();
        hotkeys.Initialize(window);
        hotkeys.RegisterDefaults();

        window.RefreshHotkeys();
    }

    private static IHostBuilder CreateHostBuilder() => Microsoft.Extensions.Hosting.Host.CreateDefaultBuilder()
        .ConfigureAppConfiguration((context, config) =>
        {
            config.AddJsonFile("appsettings.json", optional: true, reloadOnChange: true);
        })
        .ConfigureServices((context, services) =>
        {
            services.AddSingleton<PreferencesService>();
            services.AddSingleton<PromptBuilder>();
            services.AddSingleton<HotkeyManager>();
            services.AddSingleton<CaptureService>();
            services.AddSingleton<ClipboardSelectionService>();
            services.AddSingleton<WindowCoordinator>();
            services.AddHttpClient<GeminiClient>();
            services.AddSingleton<MainViewModel>();
            services.AddSingleton<MainWindow>();
        });
}
