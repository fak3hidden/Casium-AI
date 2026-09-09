using System.Collections.ObjectModel;
using System.Windows.Threading;
using Casium.Controls;
using Casium.Core;

namespace Casium.Chat;

public sealed class UserChatItem
{
    public string Text { get; set; } = "";
    public DateTime Time { get; } = DateTime.Now;
}

/// <summary>
/// One assistant message. During streaming, tokens append to <see cref="Text"/> and the
/// markdown blocks are re-rendered at most every ~120 ms (not per token — that storms the
/// layout pipeline), then once more, authoritatively, when <see cref="Finish"/> is called.
/// </summary>
public sealed class AssistantChatItem : ObservableObject
{
    private string _text = "";
    private string _stats = "";
    private bool _streaming = true;
    private DispatcherTimer? _rebuildTimer;

    public string Model { get; set; } = "";
    public DateTime Time { get; } = DateTime.Now;
    public ObservableCollection<object> Blocks { get; } = new();

    public string Text
    {
        get => _text;
        set
        {
            _text = value;
            OnPropertyChanged(nameof(Text));
            Rebuild();
        }
    }

    public string Stats
    {
        get => _stats;
        set => Set(ref _stats, value);
    }

    public bool Streaming
    {
        get => _streaming;
        set => Set(ref _streaming, value);
    }

    public void Append(string delta)
    {
        _text += delta;
        OnPropertyChanged(nameof(Text));
        ScheduleRebuild();
    }

    /// <summary>Call once the stream is over: final render of the full markdown.</summary>
    public void Finish()
    {
        _rebuildTimer?.Stop();
        _rebuildTimer = null;
        Rebuild();
    }

    private void ScheduleRebuild()
    {
        if (_rebuildTimer != null) return;
        var timer = new DispatcherTimer(DispatcherPriority.Background)
        {
            Interval = TimeSpan.FromMilliseconds(120)
        };
        timer.Tick += (_, _) =>
        {
            timer.Stop();
            if (ReferenceEquals(_rebuildTimer, timer)) _rebuildTimer = null;
            Rebuild();
        };
        _rebuildTimer = timer;
        timer.Start();
    }

    public void Rebuild()
    {
        Blocks.Clear();
        foreach (var block in Markdown.ParseBlocks(_text))
            Blocks.Add(block);
    }
}

public sealed class ToolChatItem : ObservableObject
{
    private string _resultText = "";
    private string _statusText = "Running…";
    private PillKind _statusKind = PillKind.Neutral;

    public string Server { get; set; } = "";
    public string Tool { get; set; } = "";
    public string ArgsJson { get; set; } = "";

    public string ResultText
    {
        get => _resultText;
        set => Set(ref _resultText, value);
    }

    public string StatusText
    {
        get => _statusText;
        set => Set(ref _statusText, value);
    }

    public PillKind StatusKind
    {
        get => _statusKind;
        set => Set(ref _statusKind, value);
    }

    public string Title
    {
        get
        {
            var server = string.IsNullOrEmpty(Server) ? "mcp" : Server;
            return $"{server} · {Tool}";
        }
    }

    public bool HasArgs => ArgsJson.Length > 0 && ArgsJson != "{}";
}

public enum NoticeKind
{
    Info,
    Warning,
    Error
}

public sealed class NoticeChatItem
{
    public string Text { get; set; } = "";
    public NoticeKind Kind { get; set; } = NoticeKind.Info;
}
