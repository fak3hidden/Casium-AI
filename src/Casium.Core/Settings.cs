using System.Text.Json;

namespace Casium.Core;

/// <summary>User-facing settings, persisted to %AppData%\Casium\settings.json.</summary>
public sealed class AppSettings : ObservableObject
{
    private string _ollamaEndpoint = "http://127.0.0.1:11434";
    private bool _autoStartEngine = true;
    private string _defaultModel = "";
    private string _defaultPromptId = "";
    private double _temperature = 0.7;
    private int _contextLength = 8192;
    private string _theme = "Midnight";
    private string _accent = "Violet";
    private bool _enableTools = true;
    private int _toolLoopMax = 6;

    public string OllamaEndpoint { get => _ollamaEndpoint; set { if (Set(ref _ollamaEndpoint, value?.Trim() ?? "")) Bus.RaiseSettingsChanged(); } }
    public bool AutoStartEngine { get => _autoStartEngine; set { if (Set(ref _autoStartEngine, value)) Bus.RaiseSettingsChanged(); } }
    public string DefaultModel { get => _defaultModel; set { if (Set(ref _defaultModel, value ?? "")) Bus.RaiseSettingsChanged(); } }
    public string DefaultPromptId { get => _defaultPromptId; set { if (Set(ref _defaultPromptId, value ?? "")) Bus.RaiseSettingsChanged(); } }
    public double Temperature { get => _temperature; set { if (Set(ref _temperature, Math.Clamp(value, 0, 2))) Bus.RaiseSettingsChanged(); } }
    public int ContextLength { get => _contextLength; set { if (Set(ref _contextLength, value)) Bus.RaiseSettingsChanged(); } }
    public string Theme { get => _theme; set { if (Set(ref _theme, value ?? "Midnight")) Bus.RaiseSettingsChanged(); } }
    public string Accent { get => _accent; set { if (Set(ref _accent, value ?? "Violet")) Bus.RaiseSettingsChanged(); } }
    public bool EnableTools { get => _enableTools; set { if (Set(ref _enableTools, value)) Bus.RaiseSettingsChanged(); } }
    public int ToolLoopMax { get => _toolLoopMax; set { if (Set(ref _toolLoopMax, Math.Clamp(value, 1, 10))) Bus.RaiseSettingsChanged(); } }
}

public sealed class SettingsService
{
    private static readonly JsonSerializerOptions Opts = new() { WriteIndented = true };
    private string Path => System.IO.Path.Combine(AppData.Root, "settings.json");

    public AppSettings Settings { get; private set; } = new();

    public SettingsService()
    {
        Bus.SettingsChanged += () => Save();
    }

    public void Load()
    {
        try
        {
            if (!File.Exists(Path)) return;
            var loaded = JsonSerializer.Deserialize<AppSettings>(File.ReadAllText(Path));
            if (loaded == null) return;

            // Copy into the existing instance: EngineMonitor and others keep a
            // reference to it, so it must never be swapped out from under them.
            Settings.OllamaEndpoint = loaded.OllamaEndpoint;
            Settings.AutoStartEngine = loaded.AutoStartEngine;
            Settings.DefaultModel = loaded.DefaultModel;
            Settings.DefaultPromptId = loaded.DefaultPromptId;
            Settings.Temperature = loaded.Temperature;
            Settings.ContextLength = loaded.ContextLength;
            Settings.Theme = loaded.Theme;
            Settings.Accent = loaded.Accent;
            Settings.EnableTools = loaded.EnableTools;
            Settings.ToolLoopMax = loaded.ToolLoopMax;
        }
        catch (Exception ex)
        {
            Log.Error(ex, "settings load");
        }
    }

    public void Save()
    {
        try
        {
            File.WriteAllText(Path, JsonSerializer.Serialize(Settings, Opts));
        }
        catch (Exception ex)
        {
            Log.Error(ex, "settings save");
        }
    }

    public void Reset()
    {
        try { if (File.Exists(Path)) File.Delete(Path); } catch { }
        Settings = new AppSettings();
        Bus.RaiseSettingsChanged();
    }
}
