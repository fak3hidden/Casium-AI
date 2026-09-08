using System.Windows;
using System.Windows.Controls;
using Casium.Core;
using Casium.Services;
using Microsoft.Win32;

namespace Casium.Dialogs;

public partial class McpServerDialog : Window
{
    private bool _presetSyncing;

    private McpServerDialog(McpServerConfig config)
    {
        InitializeComponent();
        Config = config;

        PresetCombo.Items.Add(new ComboBoxItem { Content = "— custom —", Tag = null });
        foreach (var preset in McpPresets.All)
            PresetCombo.Items.Add(new ComboBoxItem { Content = preset.Name, Tag = preset });
        PresetCombo.SelectedIndex = 0;

        NameBox.Text = config.Name;
        CommandBox.Text = config.Command;
        ArgsBox.Text = ArgsParser.Join(config.Args);
        EnvBox.Text = ArgsParser.FormatEnvironment(config.Env);
    }

    public McpServerConfig Config { get; private set; }

    public McpServerConfig? Result { get; private set; }

    /// <summary>Opens the editor. Returns the saved config, or null when cancelled.</summary>
    public static McpServerConfig? Show(Window? owner, McpServerConfig? existing)
    {
        var dialog = new McpServerDialog(existing ?? new McpServerConfig { Enabled = true })
        {
            Owner = owner
        };
        var ok = dialog.ShowDialog();
        return ok == true ? dialog.Result : null;
    }

    private void PresetCombo_SelectionChanged(object sender, SelectionChangedEventArgs e)
    {
        if (_presetSyncing) return;
        if (PresetCombo.SelectedItem is not ComboBoxItem { Tag: McpPreset preset }) return;

        _presetSyncing = true;
        try
        {
            // Keep the name the user already typed (it may be de-duplicated).
            CommandBox.Text = preset.Command;
            ArgsBox.Text = ArgsParser.Join(preset.Args);
            EnvBox.Text = ArgsParser.FormatEnvironment(preset.Env);
        }
        finally
        {
            _presetSyncing = false;
        }
    }

    private void BrowseFolder_Click(object sender, RoutedEventArgs e)
    {
        var dialog = new OpenFolderDialog { Title = "Choose a folder" };
        if (dialog.ShowDialog(this) != true) return;
        var current = ArgsBox.Text.TrimEnd();
        ArgsBox.Text = string.IsNullOrEmpty(current)
            ? ArgsParser.Quote(dialog.FolderName)
            : current + " " + ArgsParser.Quote(dialog.FolderName);
    }

    private void Save_Click(object sender, RoutedEventArgs e)
    {
        var name = NameBox.Text.Trim();
        var command = CommandBox.Text.Trim();
        if (name.Length == 0)
        {
            ToastError("Give the server a name.");
            NameBox.Focus();
            return;
        }
        if (command.Length == 0)
        {
            ToastError("A command is required — e.g. npx or docker.");
            CommandBox.Focus();
            return;
        }

        Result = new McpServerConfig
        {
            Name = name,
            Command = command,
            Args = ArgsParser.Split(ArgsBox.Text),
            Env = ArgsParser.ParseEnvironment(EnvBox.Text),
            Enabled = Config.Enabled
        };
        DialogResult = true;
    }

    private void ToastError(string message)
    {
        ToastService.Show(message, ToastKind.Warning);
    }

    private void Cancel_Click(object sender, RoutedEventArgs e) => DialogResult = false;

    private void Close_Click(object sender, RoutedEventArgs e) => DialogResult = false;
}
