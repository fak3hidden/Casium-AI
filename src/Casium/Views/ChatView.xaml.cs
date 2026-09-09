using System.Collections.ObjectModel;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using Casium.Chat;
using Casium.Controls;
using Casium.Core;
using Casium.Services;
using Casium.Shell;

namespace Casium.Views;

public partial class ChatView : UserControl
{
    private static readonly PromptItem NoSystemPrompt = new()
    {
        Id = "",
        Name = "None",
        Content = ""
    };

    /// <summary>Model to preselect on the next appearance (set by other views).</summary>
    public static string? DesiredModel { get; set; }

    private readonly ObservableCollection<object> _items = new();
    private readonly List<ChatTurn> _convo = new();
    private CancellationTokenSource? _cts;
    private bool _busy;
    private bool _stickToBottom = true;
    private string _model = "";
    private bool _updatingSelections;

    public ChatView()
    {
        InitializeComponent();
        Messages.ItemsSource = _items;
        _items.CollectionChanged += (_, _) => AutoScroll();

        // Send button lights up only when there's something to send.
        SendButton.IsEnabled = false;
        Input.TextChanged += (_, _) => SendButton.IsEnabled = Input.Text.Trim().Length > 0;

        Bus.EngineChanged += RefreshEngineState;
        Bus.ModelsChanged += RefreshModels;
        Bus.PromptsChanged += RefreshPrompts;
        Bus.McpChanged += UpdateToolsChip;
        Bus.PullsChanged += RefreshModels;

        Loaded += OnViewLoaded;
    }

    private void OnViewLoaded(object sender, RoutedEventArgs e)
    {
        RefreshEngineState();
        RefreshModels();
        RefreshPrompts();
        UpdateToolsChip();
        Keyboard.Focus(Input);
    }

    // ================================================================ header state

    private void RefreshEngineState()
    {
        Onboarding.Visibility = AppServices.Engine.IsOnline ? Visibility.Collapsed : Visibility.Visible;
        UpdateEmptyState();
        FooterHint.Text = AppServices.Engine.IsOnline
            ? "Enter to send · Shift+Enter for a new line"
            : "Engine offline — connect Ollama to start chatting";
    }

    private void RefreshModels()
    {
        var previous = _model;
        var desired = DesiredModel;
        DesiredModel = null;

        var models = AppServices.Engine.Models;
        _updatingSelections = true;
        ModelCombo.ItemsSource = null;
        ModelCombo.ItemsSource = models;

        var pick = desired ?? previous ?? "";
        if (desired == null && !models.Any(m => m.Name == pick))
            pick = AppServices.Settings.DefaultModel;
        if (!models.Any(m => m.Name == pick))
            pick = models.Count > 0 ? models[0].Name : "";

        _model = pick;
        ModelCombo.SelectedItem = models.FirstOrDefault(m => m.Name == pick);
        _updatingSelections = false;

        UpdateEmptyState();
    }

    private void RefreshPrompts()
    {
        var selected = (PromptCombo.SelectedItem as PromptItem)?.Id;
        _updatingSelections = true;
        var items = new List<PromptItem> { NoSystemPrompt };
        items.AddRange(AppServices.Prompts.Items);
        PromptCombo.ItemsSource = items;

        if (selected == null) selected = AppServices.Settings.DefaultPromptId;
        var item = items.FirstOrDefault(p => p.Id == selected)
                   ?? items.FirstOrDefault(p => p.IsDefault)
                   ?? NoSystemPrompt;
        PromptCombo.SelectedItem = item;
        _updatingSelections = false;
    }

    private void UpdateToolsChip()
    {
        if (!AppServices.Settings.EnableTools)
        {
            ToolsChipText.Text = "MCP tools off";
            return;
        }
        var count = AppServices.Mcp.ConnectedToolCount();
        ToolsChipText.Text = count > 0 ? $"MCP tools · {count}" : "MCP tools";
    }

    private void UpdateEmptyState()
    {
        var online = AppServices.Engine.IsOnline;
        var empty = _items.Count == 0;
        EmptyState.Visibility = online && empty ? Visibility.Visible : Visibility.Collapsed;

        var hasModels = AppServices.Engine.Models.Count > 0;
        Suggestions.Visibility = hasModels ? Visibility.Visible : Visibility.Collapsed;
        BrowseModelsButton.Visibility = hasModels ? Visibility.Collapsed : Visibility.Visible;
    }

    // ================================================================ header events

    private void ModelCombo_SelectionChanged(object sender, SelectionChangedEventArgs e)
    {
        if (_updatingSelections) return;
        if (ModelCombo.SelectedItem is OllamaModel model)
        {
            _model = model.Name;
            AppServices.Settings.DefaultModel = model.Name;
        }
    }

    private void PromptCombo_SelectionChanged(object sender, SelectionChangedEventArgs e)
    {
        if (_updatingSelections) return;
        if (PromptCombo.SelectedItem is PromptItem prompt)
            AppServices.Settings.DefaultPromptId = prompt.Id;
    }

    private async void RefreshModels_Click(object sender, RoutedEventArgs e)
    {
        await AppServices.Engine.RefreshModelsAsync();
        ToastService.Show("Model list refreshed");
    }

    private void ToolsChip_Click(object sender, RoutedEventArgs e)
        => MainWindow.Instance?.Navigate("Connections");

    private void NewChat_Click(object sender, RoutedEventArgs e)
    {
        StopGeneration();
        _items.Clear();
        _convo.Clear();
        FooterStats.Text = "";
        UpdateEmptyState();
        Keyboard.Focus(Input);
    }

    private void Suggestion_Click(object sender, RoutedEventArgs e)
    {
        if (sender is ContentControl { Content: string text })
        {
            Input.Text = text;
            Input.CaretIndex = Input.Text.Length;
            Keyboard.Focus(Input);
        }
    }

    private void GoBrowse_Click(object sender, RoutedEventArgs e)
        => MainWindow.Instance?.Navigate("Browse models");

    private void InstallOllama_Click(object sender, RoutedEventArgs e)
        => Ui.OpenUrl("https://ollama.com/download");

    private async void RetryEngine_Click(object sender, RoutedEventArgs e)
    {
        AppServices.Engine.Poke();
        await Task.Delay(600);
        AppServices.Engine.Poke();
    }

    private void ChangeEndpoint_Click(object sender, RoutedEventArgs e)
        => MainWindow.Instance?.Navigate("Settings");

    // ================================================================ sending

    private async void Send_Click(object sender, RoutedEventArgs e) => await SendFromInputAsync();

    /// <summary>
    /// Enter sends, Shift+Enter inserts a newline. Handled in the preview (tunneling) phase
    /// so the TextBox's own key handling can never eat the Enter key first.
    /// </summary>
    private async void Input_PreviewKeyDown(object sender, KeyEventArgs e)
    {
        if (e.Key != Key.Enter) return;
        if (Keyboard.Modifiers.HasFlag(ModifierKeys.Shift)) return; // let it make a newline
        e.Handled = true;
        await SendFromInputAsync();
    }

    private async void Input_KeyDown(object sender, KeyEventArgs e)
    {
        // Fallback path (kept for safety): send on Enter if the preview pass somehow didn't.
        if (e.Key == Key.Enter && Keyboard.Modifiers != ModifierKeys.Shift)
        {
            e.Handled = true;
            await SendFromInputAsync();
        }
    }

    private async Task SendFromInputAsync()
    {
        var text = Input.Text.Trim();
        if (text.Length == 0 || _busy) return;

        if (!AppServices.Engine.IsOnline)
        {
            ToastService.Show("Engine is offline — start Ollama first.", ToastKind.Warning);
            return;
        }
        if (_model.Length == 0 || AppServices.Engine.Models.Count == 0)
        {
            ToastService.Show("No model selected — download one from Browse models.", ToastKind.Warning);
            MainWindow.Instance?.Navigate("Browse models");
            return;
        }

        Input.Clear();
        if (_convo.Count == 0)
        {
            var prompt = SelectedPrompt();
            if (prompt != null && !string.IsNullOrWhiteSpace(prompt.Content))
                _convo.Add(ChatTurn.System(prompt.Content));
        }

        _convo.Add(ChatTurn.User(text));
        _items.Add(new UserChatItem { Text = text });
        UpdateEmptyState();

        await RunTurnsAsync();
    }

    private PromptItem? SelectedPrompt() => PromptCombo.SelectedItem as PromptItem;

    private async Task RunTurnsAsync()
    {
        _cts = new CancellationTokenSource();
        var token = _cts.Token;
        SetBusy(true);

        var settings = AppServices.Settings;
        var options = new OllamaChatOptions
        {
            Temperature = settings.Temperature,
            NumCtx = settings.ContextLength
        };

        JsonArray? tools = null;
        if (settings.EnableTools)
        {
            var surface = await AppServices.Mcp.EnsureToolSurfaceAsync();
            foreach (var warning in surface.Warnings)
                _items.Add(new NoticeChatItem { Text = "MCP · " + warning, Kind = NoticeKind.Warning });
            if (surface.ToolCount > 0)
            {
                tools = new JsonArray();
                foreach (var tool in surface.OllamaTools) tools.Add(tool);
            }
            UpdateToolsChip();
        }

        var retriedWithoutTools = false;
        var maxIterations = Math.Max(1, settings.ToolLoopMax);
        var receivedChars = 0L;
        var thinkingChars = 0L;
        var chunkCount = 0;

        for (var iteration = 0; iteration < maxIterations; iteration++)
        {
            var bubble = new AssistantChatItem { Model = _model };
            _items.Add(bubble);
            AutoScroll();

            var final = new ChatChunk();
            receivedChars = 0;
            thinkingChars = 0;
            chunkCount = 0;
            try
            {
                await AppServices.Ollama.ChatStreamAsync(_model, _convo, tools, options, chunk =>
                {
                    if (Dispatcher.HasShutdownStarted) return;
                    try
                    {
                        Dispatcher.Invoke(() =>
                        {
                            chunkCount++;
                            if (chunkCount == 1)
                                Core.Log.Info($"[chat] first chunk from {_model}: " +
                                              $"content={(chunk.Content?.Length ?? 0)} chars, " +
                                              $"thinking={(chunk.Thinking?.Length ?? 0)} chars, done={chunk.Done}");
                            // Reasoning models stream their reasoning separately; render it as a
                            // muted blockquote so the bubble shows something while it thinks.
                            if (chunk.Thinking is { Length: > 0 })
                            {
                                thinkingChars += chunk.Thinking.Length;
                                bubble.Append("> " + chunk.Thinking.Replace("\n", "\n> ") + "\n\n");
                            }
                            if (chunk.Content is { Length: > 0 })
                            {
                                receivedChars += chunk.Content.Length;
                                bubble.Append(chunk.Content);
                            }
                            if (chunk.Done)
                                final = chunk;
                        });
                    }
                    catch
                    {
                        // Window shutting down mid-stream; the token will stop the read loop.
                    }
                }, token);
            }
            catch (OperationCanceledException)
            {
                bubble.Finish();
                bubble.Streaming = false;
                bubble.Stats = "Stopped";
                SetBusy(false);
                return;
            }
            catch (OllamaException ex)
            {
                bubble.Streaming = false;
                if (tools != null && !retriedWithoutTools &&
                    ex.Message.Contains("tool", StringComparison.OrdinalIgnoreCase))
                {
                    retriedWithoutTools = true;
                    _items.Remove(bubble);
                    _items.Add(new NoticeChatItem
                    {
                        Text = $"“{_model}” doesn't support tool calling — continuing without MCP tools.",
                        Kind = NoticeKind.Warning
                    });
                    tools = null;
                    iteration--;
                    continue;
                }
                Core.Log.Warn($"[chat] Ollama error: {ex.Message}");
                _items.Add(new NoticeChatItem { Text = ex.Message, Kind = NoticeKind.Error });
                SetBusy(false);
                return;
            }

            catch (Exception ex)
            {
                Core.Log.Error(ex, "[chat] unexpected");
                _items.Add(new NoticeChatItem { Text = "Unexpected error: " + ex.Message, Kind = NoticeKind.Error });
                SetBusy(false);
                return;
            }

            Core.Log.Info($"[chat] stream complete: {chunkCount} chunks, {receivedChars} chars, " +
                          $"{thinkingChars} thinking chars, eval={final.EvalCount}, doneReason={final.DoneReason ?? "?"}");

            bubble.Finish();
            bubble.Streaming = false;
            bubble.Stats = FormatStats(final);

            if (receivedChars == 0 && thinkingChars == 0 && final.ToolCalls is not { Count: > 0 })
            {
                _items.Add(new NoticeChatItem
                {
                    Text = $"The engine returned no text for this reply — model \u201C{_model}\u201D, " +
                           $"{chunkCount} chunks, eval {final.EvalCount}, reason \u201C{final.DoneReason ?? "?"}\u201D. " +
                           "The log (Settings → Open logs folder) has the raw stream.",
                    Kind = NoticeKind.Warning
                });
            }

            if (final.ToolCalls is { Count: > 0 })
            {
                _convo.Add(ChatTurn.AssistantToolCalls(final.ToolCalls, final.Content ?? ""));
                foreach (var call in final.ToolCalls)
                    await ExecuteToolCallAsync(call, token);
                continue;
            }

            // Send back only the real content — bubble.Text also contains the rendered thinking.
            _convo.Add(ChatTurn.Assistant(final.Content ?? ""));
            SetBusy(false);
            return;
        }

        _items.Add(new NoticeChatItem
        {
            Text = $"Stopped after {maxIterations} tool rounds. Raise the limit in Settings.",
            Kind = NoticeKind.Info
        });
        SetBusy(false);
    }

    private async Task ExecuteToolCallAsync(ToolCallRequest call, CancellationToken token)
    {
        var server = AppServices.Mcp.GetServerForTool(call.Name) ?? "mcp";
        var toolItem = new ToolChatItem
        {
            Server = server,
            Tool = call.Name,
            ArgsJson = PrettyJson(call.Arguments)
        };
        _items.Add(toolItem);
        AutoScroll();

        try
        {
            var result = await AppServices.Mcp.CallToolAsync(call.Name, call.Arguments, token);
            var text = result.Text.Length > 6000
                ? result.Text[..6000] + "\n… (truncated)"
                : result.Text;
            toolItem.ResultText = text;
            toolItem.StatusText = "Done";
            toolItem.StatusKind = PillKind.Success;
            _convo.Add(ChatTurn.ToolResult(call.Name, text));
        }
        catch (Exception ex)
        {
            toolItem.ResultText = ex.Message;
            toolItem.StatusText = "Error";
            toolItem.StatusKind = PillKind.Danger;
            _convo.Add(ChatTurn.ToolResult(call.Name, "Error: " + ex.Message));
        }
    }

    private static string PrettyJson(JsonObject node)
    {
        try
        {
            return node.ToJsonString(new JsonSerializerOptions { WriteIndented = true });
        }
        catch
        {
            return "{}";
        }
    }

    private static string FormatStats(ChatChunk chunk)
    {
        if (chunk.EvalCount <= 0 || chunk.EvalDuration <= 0) return "";
        var tps = chunk.TokensPerSecond;
        var seconds = chunk.TotalDuration / 1e9;
        return $"{Format.TokensPerSecond(tps)} tok/s · {chunk.EvalCount} tokens · {seconds:F1}s";
    }

    private void StopGeneration()
    {
        try { _cts?.Cancel(); } catch { }
    }

    private void Stop_Click(object sender, RoutedEventArgs e) => StopGeneration();

    private void SetBusy(bool busy)
    {
        _busy = busy;
        SendButton.Visibility = busy ? Visibility.Collapsed : Visibility.Visible;
        StopButton.Visibility = busy ? Visibility.Visible : Visibility.Collapsed;
        if (!busy)
        {
            _cts?.Dispose();
            _cts = null;
        }
    }

    // ================================================================ message actions

    private void CopyMessage_Click(object sender, RoutedEventArgs e)
    {
        if ((sender as FrameworkElement)?.DataContext is AssistantChatItem item)
        {
            try { Clipboard.SetText(item.Text); ToastService.Show("Message copied"); }
            catch { }
        }
    }

    private void CopyCode_Click(object sender, RoutedEventArgs e)
    {
        if ((sender as FrameworkElement)?.DataContext is MdCode code)
        {
            try { Clipboard.SetText(code.Code); ToastService.Show("Code copied"); }
            catch { }
        }
    }

    private void Regenerate_Click(object sender, RoutedEventArgs e)
    {
        if (_busy) return;
        var lastUser = _items.OfType<UserChatItem>().LastOrDefault();
        if (lastUser == null) return;

        var index = _items.IndexOf(lastUser);
        for (var i = _items.Count - 1; i > index; i--)
            _items.RemoveAt(i);

        _convo.Clear();
        var prompt = SelectedPrompt();
        if (prompt != null && !string.IsNullOrWhiteSpace(prompt.Content))
            _convo.Add(ChatTurn.System(prompt.Content));
        _convo.Add(ChatTurn.User(lastUser.Text));

        _ = RunTurnsAsync();
    }

    // ================================================================ scrolling

    private void Scroller_ScrollChanged(object sender, ScrollChangedEventArgs e)
    {
        if (e.ExtentHeightChange > 0.5)
        {
            if (_stickToBottom)
                Scroller.ScrollToEnd();
        }
        else if (e.ExtentHeightChange == 0)
        {
            // A user-initiated scroll: stick to bottom unless they moved away from it.
            _stickToBottom = Scroller.VerticalOffset >= Scroller.ExtentHeight - Scroller.ViewportHeight - 90;
        }
    }

    private void AutoScroll()
    {
        if (!_stickToBottom) return;
        Dispatcher.BeginInvoke(() =>
        {
            if (_stickToBottom) Scroller.ScrollToEnd();
        }, System.Windows.Threading.DispatcherPriority.Background);
    }
}
