namespace Casium.Core;

/// <summary>Composition root for the core services (simple singleton locator).</summary>
public static class AppServices
{
    public static readonly SettingsService SettingsService = new();
    public static AppSettings Settings => SettingsService.Settings;

    public static readonly PromptLibrary Prompts = new();
    public static readonly McpManager Mcp = new();

    public static readonly OllamaClient Ollama = new(Settings.OllamaEndpoint);
    public static readonly EngineMonitor Engine = new(Ollama, Settings);
    public static readonly PullManager Pulls = new(Ollama, Engine);

    public static readonly ModelCatalog Catalog = new();

    private static HardwareInfo? _hardware;

    /// <summary>Synchronous hardware probe (cached). Calls nvidia-smi/registry — prefer <see cref="HardwareAsync"/>.</summary>
    public static HardwareInfo Hardware => _hardware ??= HardwareInfo.Detect();

    /// <summary>Hardware probe off the UI thread (cached).</summary>
    public static Task<HardwareInfo> HardwareAsync => Task.Run(() => Hardware);
}
