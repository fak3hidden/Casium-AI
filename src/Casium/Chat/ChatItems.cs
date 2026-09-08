using System.Collections.ObjectModel;
using Casium.Controls;
using Casium.Core;

namespace Casium.Chat;

public sealed class UserChatItem
{
    public string Text { get; set; } = "";
    public DateTime Time { get; } = DateTime.Now;
}

public sealed class AssistantChatItem : ObservableObject
{
    private string _text = "";
    private string _stats = "";
    private bool _streaming = true;

    public string Model { get; set; } = "";
    public DateTime Time { get; } = DateTime.Now;
    public ObservableCollection<object> Blocks { get; } = new();

    public string Text
    {
        get => _text;
        set
        {
            _text = value;
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
        Rebuild();
    }

    public void Rebuild()
    {
        Blocks.Clear();
        foreach (var block in Markdown.ParseBlocks(_text))
            Blocks.Add(block);
        OnPropertyChanged(nameof(Text));
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
