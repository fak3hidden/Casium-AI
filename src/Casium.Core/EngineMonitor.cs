using System.Collections.ObjectModel;
using System.Diagnostics;

namespace Casium.Core;

public enum EngineState
{
    Offline,
    Online
}

/// <summary>
/// Watches the local inference engine (Ollama-compatible HTTP server), keeps a cached
/// model list, and can try to auto-start it. All UI notifications flow through <see cref="Bus"/>.
/// </summary>
public sealed class EngineMonitor
{
    private readonly OllamaClient _client;
    private readonly AppSettings _settings;
    private readonly System.Timers.Timer _timer = new(5000) { AutoReset = true, Enabled = false };
    private int _polling;
    private bool _started;
    private bool _autoStartTried;

    public EngineMonitor(OllamaClient client, AppSettings settings)
    {
        _client = client;
        _settings = settings;
        _client.SetEndpoint(settings.OllamaEndpoint);
        _timer.Elapsed += (_, _) => _ = PollAsync();

        Bus.SettingsChanged += () =>
        {
            if (_client.BaseUrl != _settings.OllamaEndpoint)
            {
                _client.SetEndpoint(_settings.OllamaEndpoint);
                ModelsLoaded = false;
                Bus.RunOnUi(Models.Clear);
                _ = PollAsync();
            }
        };
    }

    public OllamaClient Client => _client;
    public EngineState State { get; private set; } = EngineState.Offline;
    public string? Version { get; private set; }
    public ObservableCollection<OllamaModel> Models { get; } = new();
    public bool ModelsLoaded { get; private set; }
    public string LastError { get; private set; } = "";

    public bool IsOnline => State == EngineState.Online;

    public void Start()
    {
        if (_started) return;
        _started = true;
        _ = PollAsync(startup: true);
        _timer.Start();
    }

    public void Poke() => _ = PollAsync();

    private async Task PollAsync(bool startup = false)
    {
        if (Interlocked.Exchange(ref _polling, 1) == 1) return;
        try
        {
            var version = await _client.GetVersionAsync();
            if (version == null && startup && !_autoStartTried && _settings.AutoStartEngine)
            {
                _autoStartTried = true;
                if (await TryStartEngineAsync())
                    version = await _client.GetVersionAsync(4000);
            }

            var newState = version != null ? EngineState.Online : EngineState.Offline;
            var changed = newState != State || version != Version;
            State = newState;
            Version = version;
            if (changed) Bus.RaiseEngineChanged();

            if (State == EngineState.Online && !ModelsLoaded)
                await RefreshModelsAsync();
        }
        catch (Exception ex)
        {
            Log.Error(ex, "engine poll");
        }
        finally
        {
            Volatile.Write(ref _polling, 0);
        }
    }

    private async Task<bool> TryStartEngineAsync()
    {
        try
        {
            var psi = new ProcessStartInfo
            {
                FileName = "ollama",
                Arguments = "serve",
                UseShellExecute = false,
                CreateNoWindow = true,
                WindowStyle = ProcessWindowStyle.Hidden
            };
            using var process = Process.Start(psi);
            if (process == null) return false;

            for (var i = 0; i < 24; i++)
            {
                await Task.Delay(500);
                if (await _client.GetVersionAsync(1000) != null) return true;
                if (process.HasExited) return false;
            }
            return false;
        }
        catch (Exception ex)
        {
            Log.Warn("Engine auto-start failed: " + ex.Message);
            return false;
        }
    }

    public async Task RefreshModelsAsync()
    {
        if (State != EngineState.Online)
        {
            ModelsLoaded = false;
            return;
        }
        try
        {
            var models = await _client.ListModelsAsync();
            Bus.RunOnUi(() =>
            {
                Models.Clear();
                foreach (var m in models) Models.Add(m);
                ModelsLoaded = true;
            });
            Bus.RaiseModelsChanged();
        }
        catch (Exception ex)
        {
            LastError = ex.Message;
            Log.Error(ex, "refresh models");
        }
    }

    public async Task<bool> DeleteModelAsync(string name)
    {
        try
        {
            await _client.DeleteModelAsync(name);
            await RefreshModelsAsync();
            Bus.RaiseModelsChanged();
            return true;
        }
        catch (Exception ex)
        {
            LastError = ex.Message;
            Log.Error(ex, "delete model " + name);
            return false;
        }
    }

    /// <summary>True when a model with this exact tag (or its :latest alias) is installed.</summary>
    public bool IsInstalled(string tag, bool isDefaultTag)
    {
        for (var i = 0; i < Models.Count; i++)
        {
            var name = Models[i].Name;
            if (name == tag) return true;
            if (isDefaultTag)
            {
                var at = name.IndexOf(':');
                var bare = at > 0 ? name[..at] : name;
                if (bare == tag && (at < 0 || name[(at + 1)..] == "latest")) return true;
            }
        }
        return false;
    }

    /// <summary>True when any size of the given model family (e.g. "llama3.2") is installed.</summary>
    public bool IsFamilyInstalled(string family)
    {
        for (var i = 0; i < Models.Count; i++)
        {
            var name = Models[i].Name;
            var at = name.IndexOf(':');
            if ((at > 0 ? name[..at] : name) == family) return true;
        }
        return false;
    }
}
