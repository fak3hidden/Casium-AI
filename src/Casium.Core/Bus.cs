namespace Casium.Core;

/// <summary>
/// Lightweight application-wide event bus. Events raised from background threads
/// are always marshalled onto the captured UI context before subscribers run.
/// </summary>
public static class Bus
{
    private static SynchronizationContext? _ui;

    public static event Action? EngineChanged;
    public static event Action? ModelsChanged;
    public static event Action? PromptsChanged;
    public static event Action? McpChanged;
    public static event Action? PullsChanged;
    public static event Action? SettingsChanged;

    /// <summary>Capture the UI thread's synchronization context (call once at startup).</summary>
    public static void CaptureUiContext() => _ui = SynchronizationContext.Current;

    public static void RunOnUi(Action action)
    {
        var ctx = _ui;
        if (ctx != null && ctx != SynchronizationContext.Current)
            ctx.Post(_ => action(), null);
        else
            action();
    }

    public static void RaiseEngineChanged() => Fire(EngineChanged);
    public static void RaiseModelsChanged() => Fire(ModelsChanged);
    public static void RaisePromptsChanged() => Fire(PromptsChanged);
    public static void RaiseMcpChanged() => Fire(McpChanged);
    public static void RaisePullsChanged() => Fire(PullsChanged);
    public static void RaiseSettingsChanged() => Fire(SettingsChanged);

    private static void Fire(Action? evt)
    {
        if (evt == null) return;
        foreach (Action a in evt.GetInvocationList())
        {
            var handler = a;
            RunOnUi(handler);
        }
    }
}
