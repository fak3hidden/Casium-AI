using System.Collections.ObjectModel;
using System.IO;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using Casium.Controls;
using Casium.Core;
using Casium.Dialogs;
using Casium.Services;
using Casium.Shell;
using Microsoft.Win32;

namespace Casium.Views;

/// <summary>View-model row for one configured MCP server.</summary>
public sealed class ServerRow : ObservableObject
{
    private string _statusText = "Not connected";
    private PillKind _statusKind = PillKind.Neutral;
    private Brush? _statusBrush;
    private string _toolsText = "0 tools";
    private List<McpTool> _tools = new();
    private string _errorText = "";
    private bool _busy;

    public ServerRow(McpServerConfig config) => Config = config;

    public McpServerConfig Config { get; }

    public string Name => Config.Name;
    public string Command => Config.DisplayCommand;

    public bool Enabled
    {
        get => Config.Enabled;
        set
        {
            Config.Enabled = value;
            OnPropertyChanged();
        }
    }

    public string StatusText { get => _statusText; set => Set(ref _statusText, value); }
    public PillKind StatusKind { get => _statusKind; set => Set(ref _statusKind, value); }
    public Brush? StatusBrush { get => _statusBrush; set => Set(ref _statusBrush, value); }
    public string ToolsText { get => _toolsText; set => Set(ref _toolsText, value); }
    public List<McpTool> Tools { get => _tools; set => Set(ref _tools, value); }
    public string ErrorText { get => _errorText; set { if (Set(ref _errorText, value)) OnPropertyChanged(nameof(HasError)); } }
    public bool HasError => ErrorText.Length > 0;
    public bool Busy { get => _busy; set { if (Set(ref _busy, value)) OnPropertyChanged(nameof(CanConnect)); } }
    public bool CanConnect => !Busy;

    public void SetStatus(string text, PillKind kind)
    {
        StatusText = text;
        StatusKind = kind;
        StatusBrush = Application.Current?.TryFindResource(kind switch
        {
            PillKind.Success => "Brush.Success",
            PillKind.Danger => "Brush.Danger",
            PillKind.Warning => "Brush.Warning",
            PillKind.Accent => "Brush.Accent",
            _ => "Brush.Text.Muted"
        }) as Brush;
    }
}

public partial class McpView : UserControl
{
    private readonly ObservableCollection<ServerRow> _rows = new();
    private bool _updatingRows;
    private bool _autoConnectStarted;

    public McpView()
    {
        InitializeComponent();
        ServerList.ItemsSource = _rows;
        PresetList.ItemsSource = McpPresets.All;

        Bus.McpChanged += RebuildRows;
        Loaded += OnViewLoaded;
    }

    private void OnViewLoaded(object sender, RoutedEventArgs e)
    {
        ConfigPathRun.Text = AppServices.Mcp.ConfigPath;
        RebuildRows();
        if (!_autoConnectStarted)
        {
            _autoConnectStarted = true;
            _ = ConnectAllAsync();
        }
    }

    // ================================================================ rows

    private void RebuildRows()
    {
        if (_updatingRows) return;
        _updatingRows = true;
        try
        {
            _rows.Clear();
            foreach (var config in AppServices.Mcp.Servers)
            {
                var row = new ServerRow(config);
                RefreshRowStatus(row);
                _rows.Add(row);
            }
            EmptyState.Visibility = _rows.Count == 0 ? Visibility.Visible : Visibility.Collapsed;
        }
        finally
        {
            _updatingRows = false;
        }
    }

    private static void RefreshRowStatus(ServerRow row)
    {
        var client = AppServices.Mcp.GetClient(row.Config.Name);
        if (client != null)
        {
            row.SetStatus("Running", PillKind.Success);
            row.Tools = client.Tools;
            row.ToolsText = $"{client.Tools.Count} tools";
            row.ErrorText = "";
        }
        else if (!row.Config.Enabled)
        {
            row.SetStatus("Disabled", PillKind.Neutral);
            row.Tools = new List<McpTool>();
            row.ToolsText = "—";
        }
        else
        {
            row.SetStatus("Not connected", PillKind.Neutral);
            row.Tools = new List<McpTool>();
            row.ToolsText = "0 tools";
        }
    }

    private async Task ConnectAllAsync()
    {
        foreach (var row in _rows.ToList())
        {
            if (!row.Config.Enabled) continue;
            if (AppServices.Mcp.IsConnected(row.Config.Name)) continue;
            await ConnectRowAsync(row, silent: true);
        }
    }

    // ================================================================ events

    private async void ConnectServer_Click(object sender, RoutedEventArgs e)
    {
        if ((sender as FrameworkElement)?.DataContext is not ServerRow row) return;
        await ConnectRowAsync(row, silent: false);
    }

    private async Task ConnectRowAsync(ServerRow row, bool silent)
    {
        row.Busy = true;
        row.SetStatus("Connecting…", PillKind.Accent);
        row.ErrorText = "";
        try
        {
            var client = await AppServices.Mcp.ConnectAsync(row.Config);
            row.SetStatus("Running", PillKind.Success);
            row.Tools = client.Tools;
            row.ToolsText = $"{client.Tools.Count} tools";
            if (!silent)
                ToastService.Show($"{row.Name} connected — {client.Tools.Count} tools", ToastKind.Success);
        }
        catch (Exception ex)
        {
            Core.Log.Warn($"MCP connect failed for {row.Name}: {ex.Message}");
            row.SetStatus("Not available", PillKind.Danger);
            row.ErrorText = ex.Message;
            if (!silent)
                ToastService.Show($"{row.Name}: {ex.Message}", ToastKind.Error);
        }
        finally
        {
            row.Busy = false;
        }
    }

    private void Enabled_Changed(object sender, RoutedEventArgs e)
    {
        if (_updatingRows) return;
        if (sender is CheckBox box && box.DataContext is ServerRow row)
        {
            _updatingRows = true;
            AppServices.Mcp.SetEnabled(row.Config.Name, box.IsChecked == true);
            row.Enabled = box.IsChecked == true;
            RefreshRowStatus(row);
            _updatingRows = false;
        }
    }

    private void AddServer_Click(object sender, RoutedEventArgs e)
    {
        var result = McpServerDialog.Show(Ui.OwnerWindow(this), null);
        if (result != null)
            ToastService.Show($"Saved server “{result.Name}”");
    }

    // ================================================================ GitHub one-click connect

    private async void ConnectGitHub_Click(object sender, RoutedEventArgs e) => await RunGitHubFlowAsync("GitHub");

    /// <summary>
    /// Arena-style GitHub connect: open the token page (scopes pre-filled), verify the
    /// pasted token against the GitHub API, then create/update the GitHub MCP server with
    /// it — the user never touches command lines or environment variables.
    /// </summary>
    private async Task RunGitHubFlowAsync(string serverName)
    {
        var preset = McpPresets.All.FirstOrDefault(p => p.Name == serverName) ?? new McpPreset
        {
            Name = serverName,
            Command = "npx",
            Args = new List<string> { "-y", "@modelcontextprotocol/server-github" }
        };

        if (!GitHubConnectDialog.Show(Ui.OwnerWindow(this), out var user, out var token))
            return;

        var config = AppServices.Mcp.Find(serverName);
        if (config == null)
        {
            config = new McpServerConfig
            {
                Name = serverName,
                Command = preset.Command,
                Args = new List<string>(preset.Args),
                Enabled = true
            };
        }
        config.Env["GITHUB_PERSONAL_ACCESS_TOKEN"] = token;
        config.Enabled = true;
        AppServices.Mcp.Upsert(config);
        RebuildRows();

        var row = _rows.FirstOrDefault(r => string.Equals(r.Config.Name, serverName, StringComparison.OrdinalIgnoreCase));
        if (row == null) return;

        await ConnectRowAsync(row, silent: true);
        if (AppServices.Mcp.IsConnected(serverName))
        {
            var count = AppServices.Mcp.GetClient(serverName)?.Tools.Count ?? 0;
            ToastService.Show($"GitHub connected as @{user!.Login} — {count} tools ready", ToastKind.Success);
        }
        else
        {
            // Server saved but couldn't launch (e.g. Node.js missing) — the row shows why.
            ToastService.Show($"GitHub token saved as @{user!.Login}, but the server didn't start — see its card for the reason.",
                ToastKind.Warning);
        }
    }

    private async void Preset_Click(object sender, RoutedEventArgs e)
    {
        if ((sender as FrameworkElement)?.DataContext is not McpPreset preset) return;

        // GitHub presets go through the guided connect flow instead of the raw editor.
        if (preset.Name == "GitHub" || preset.Name == "GitHub (official)")
        {
            await RunGitHubFlowAsync(preset.Name);
            return;
        }

        var config = new McpServerConfig
        {
            Name = UniqueName(preset.Name),
            Command = preset.Command,
            Args = new List<string>(preset.Args),
            Env = new Dictionary<string, string>(preset.Env),
            Enabled = true
        };

        if (preset.NeedsFolder)
        {
            var dialog = new OpenFolderDialog
            {
                Title = $"Choose the folder for “{preset.Name}”"
            };
            if (dialog.ShowDialog(Window.GetWindow(this)) == true && config.Args.Count > 0)
                config.Args[^1] = dialog.FolderName; // raw path: quoting happens at process start
        }

        var result = McpServerDialog.Show(Ui.OwnerWindow(this), config);
        if (result != null)
            ToastService.Show($"Saved server “{result.Name}”", ToastKind.Success);
        await Task.CompletedTask;
    }

    private static string UniqueName(string baseName)
    {
        var name = baseName;
        var n = 2;
        while (AppServices.Mcp.Find(name) != null)
            name = $"{baseName} {n++}";
        return name;
    }

    private void EditServer_Click(object sender, RoutedEventArgs e)
    {
        if ((sender as FrameworkElement)?.DataContext is not ServerRow row) return;
        var edited = new McpServerConfig
        {
            Name = row.Config.Name,
            Command = row.Config.Command,
            Args = new List<string>(row.Config.Args),
            Env = new Dictionary<string, string>(row.Config.Env),
            Enabled = row.Config.Enabled
        };
        var result = McpServerDialog.Show(Ui.OwnerWindow(this), edited);
        if (result != null)
            ToastService.Show($"Updated “{result.Name}”");
    }

    private void DeleteServer_Click(object sender, RoutedEventArgs e)
    {
        if ((sender as FrameworkElement)?.DataContext is not ServerRow row) return;
        var confirmed = ConfirmDialog.Show(
            Ui.OwnerWindow(this),
            "Remove server?",
            $"“{row.Name}” will be removed from your MCP configuration. Running processes will be stopped.",
            "Remove", danger: true);
        if (confirmed != true) return;
        AppServices.Mcp.Delete(row.Config.Name);
        ToastService.Show($"Removed {row.Name}");
    }

    private void ExportConfig_Click(object sender, RoutedEventArgs e)
    {
        var dialog = new SaveFileDialog
        {
            Title = "Export MCP config",
            Filter = "JSON config (*.json)|*.json",
            FileName = "mcp.json"
        };
        if (dialog.ShowDialog(Window.GetWindow(this)) != true) return;
        try
        {
            File.Copy(AppServices.Mcp.ConfigPath, dialog.FileName, overwrite: true);
            ToastService.Show("Config exported", ToastKind.Success);
        }
        catch (Exception ex)
        {
            ToastService.Show(ex.Message, ToastKind.Error);
        }
    }
}
