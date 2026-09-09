using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using Casium.Controls;
using Casium.Core;
using Casium.Services;

namespace Casium.Views;

public partial class SettingsView : UserControl
{
    private bool _loading;

    public SettingsView()
    {
        InitializeComponent();
        Bus.SettingsChanged += OnSettingsChanged;
        Bus.EngineChanged += UpdateEngineStatus;
        Bus.ModelsChanged += LoadValues;
        Bus.PromptsChanged += LoadValues;
        Loaded += OnViewLoaded;
    }

    private async void OnViewLoaded(object sender, RoutedEventArgs e)
    {
        LoadValues();
        await LoadHardwareAsync();
    }

    private void LoadValues()
    {
        _loading = true;
        try
        {
            var settings = AppServices.Settings;
            EndpointBox.Text = settings.OllamaEndpoint;

            AutoStartSwitch.IsChecked = settings.AutoStartEngine;
            ToolsSwitch.IsChecked = settings.EnableTools;

            DefaultModelCombo.ItemsSource = AppServices.Engine.Models;
            var model = AppServices.Engine.Models.FirstOrDefault(m => m.Name == settings.DefaultModel)
                        ?? AppServices.Engine.Models.FirstOrDefault();
            DefaultModelCombo.SelectedItem = model;

            DefaultPromptCombo.ItemsSource = AppServices.Prompts.Items;
            var prompt = AppServices.Prompts.Items.FirstOrDefault(p => p.Id == settings.DefaultPromptId)
                         ?? AppServices.Prompts.Default;
            DefaultPromptCombo.SelectedItem = prompt;

            TemperatureSlider.Value = settings.Temperature;
            TemperatureValue.Text = settings.Temperature.ToString("0.00");

            SelectComboByTag(ContextCombo, settings.ContextLength);
            SelectComboByTag(ToolLoopCombo, settings.ToolLoopMax);

            ThemeMidnight.IsChecked = settings.Theme == "Midnight";
            ThemeDaylight.IsChecked = settings.Theme != "Midnight";
        }
        finally
        {
            _loading = false;
        }
        UpdateEngineStatus();
    }

    private static void SelectComboByTag(ComboBox combo, int value)
    {
        foreach (var item in combo.Items)
        {
            if (item is ComboBoxItem { Tag: string tag } && int.TryParse(tag, out var parsed) && parsed == value)
            {
                combo.SelectedItem = item;
                return;
            }
        }
        if (combo.Items.Count > 0) combo.SelectedIndex = 0;
    }

    private static int? ComboTagValue(ComboBox combo) =>
        combo.SelectedItem is ComboBoxItem { Tag: string tag } && int.TryParse(tag, out var parsed) ? parsed : null;

    private void OnSettingsChanged()
    {
        // Keep sliders/labels in sync if settings changed elsewhere (e.g. from Chat).
        TemperatureValue.Text = AppServices.Settings.Temperature.ToString("0.00");
    }

    private void UpdateEngineStatus()
    {
        if (EnginePill == null) return;
        var online = AppServices.Engine.IsOnline;
        EnginePill.Text = online ? "online" : "offline";
        EnginePill.Kind = online ? PillKind.Success : PillKind.Danger;
    }

    // ================================================================ engine

    private void ApplyEndpoint_Click(object sender, RoutedEventArgs e) => ApplyEndpoint();

    private void EndpointBox_KeyDown(object sender, System.Windows.Input.KeyEventArgs e)
    {
        if (e.Key == System.Windows.Input.Key.Enter)
        {
            e.Handled = true;
            ApplyEndpoint();
        }
    }

    private void ApplyEndpoint()
    {
        AppServices.Settings.OllamaEndpoint = EndpointBox.Text.Trim();
        AppServices.Engine.Poke();
        ToastService.Show("Endpoint saved — connecting…");
    }

    private void AutoStart_Changed(object sender, RoutedEventArgs e)
    {
        if (_loading) return;
        AppServices.Settings.AutoStartEngine = AutoStartSwitch.IsChecked == true;
    }

    private void InstallOllama_Click(object sender, RoutedEventArgs e)
        => Ui.OpenUrl("https://ollama.com/download");

    private void EngineDocs_Click(object sender, RoutedEventArgs e)
        => Ui.OpenUrl("https://ollama.readthedocs.io");

    // ================================================================ chat defaults

    private void DefaultModel_Changed(object sender, SelectionChangedEventArgs e)
    {
        if (_loading) return;
        if (DefaultModelCombo.SelectedItem is OllamaModel model)
            AppServices.Settings.DefaultModel = model.Name;
    }

    private void DefaultPrompt_Changed(object sender, SelectionChangedEventArgs e)
    {
        if (_loading) return;
        if (DefaultPromptCombo.SelectedItem is PromptItem prompt)
            AppServices.Settings.DefaultPromptId = prompt.Id;
    }

    private void Temperature_Changed(object sender, RoutedPropertyChangedEventArgs<double> e)
    {
        if (_loading) return;
        AppServices.Settings.Temperature = Math.Round(TemperatureSlider.Value, 2);
        TemperatureValue.Text = AppServices.Settings.Temperature.ToString("0.00");
    }

    private void Context_Changed(object sender, SelectionChangedEventArgs e)
    {
        if (_loading) return;
        if (ComboTagValue(ContextCombo) is int value)
            AppServices.Settings.ContextLength = value;
    }

    private void Tools_Changed(object sender, RoutedEventArgs e)
    {
        if (_loading) return;
        AppServices.Settings.EnableTools = ToolsSwitch.IsChecked == true;
    }

    private void ToolLoop_Changed(object sender, SelectionChangedEventArgs e)
    {
        if (_loading) return;
        if (ComboTagValue(ToolLoopCombo) is int value)
            AppServices.Settings.ToolLoopMax = value;
    }

    // ================================================================ appearance

    private void Theme_Changed(object sender, RoutedEventArgs e)
    {
        if (_loading) return;
        AppServices.Settings.Theme = ThemeDaylight.IsChecked == true ? "Daylight" : "Midnight";
        ThemeService.Apply(AppServices.Settings.Theme, AppServices.Settings.Accent);
    }

    private void Accent_Click(object sender, RoutedEventArgs e)
    {
        if (_loading) return;
        var accent = (sender as FrameworkElement)?.Name switch
        {
            "AccentBlue" => "Blue",
            "AccentTeal" => "Teal",
            "AccentRose" => "Rose",
            _ => "Violet"
        };
        AppServices.Settings.Accent = accent;
        ThemeService.Apply(AppServices.Settings.Theme, accent);
    }

    // ================================================================ hardware

    private async Task LoadHardwareAsync()
    {
        HardwareRows.Children.Clear();
        HardwareRows.Children.Add(MakeRow("Detecting…", ""));

        HardwareInfo hw;
        try
        {
            hw = await AppServices.HardwareAsync;
        }
        catch
        {
            hw = new HardwareInfo { CpuName = "Unknown CPU" };
        }

        HardwareRows.Children.Clear();
        AddHardwareRow("Processor", $"{hw.CpuName} · {hw.CpuThreads} threads");
        AddHardwareRow("Memory", $"{Format.GB(hw.TotalRamGB)} RAM (≈{hw.CpuBandwidthGBps:F0} GB/s memory bandwidth assumed)");
        if (hw.Gpus.Count == 0)
        {
            AddHardwareRow("Graphics", "No dedicated GPU detected — models will run on CPU");
        }
        else
        {
            foreach (var gpu in hw.Gpus.OrderByDescending(g => g.VramMB))
            {
                AddHardwareRow("Graphics",
                    $"{gpu.Name} · {Format.GB(gpu.VramGB)} VRAM · ≈{gpu.BandwidthGBps} GB/s ({gpu.Source})");
            }
        }
    }

    private void AddHardwareRow(string label, string value)
        => HardwareRows.Children.Add(MakeRow(label, value));

    private static Border MakeRow(string label, string value)
    {
        var grid = new Grid();
        grid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(120) });
        grid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });

        var caption = new TextBlock
        {
            Text = label,
            FontSize = 12.5,
            Foreground = Application.Current.TryFindResource("Brush.Text.Secondary") as Brush,
            VerticalAlignment = VerticalAlignment.Top
        };
        Grid.SetColumn(caption, 0);
        grid.Children.Add(caption);

        var body = new TextBlock
        {
            Text = value,
            FontSize = 12.5,
            Foreground = Application.Current.TryFindResource("Brush.Text.Primary") as Brush,
            TextWrapping = TextWrapping.Wrap
        };
        Grid.SetColumn(body, 1);
        grid.Children.Add(body);

        return new Border
        {
            Child = grid,
            Padding = new Thickness(0, 6, 0, 6)
        };
    }

    private void CopyReport_Click(object sender, RoutedEventArgs e)
    {
        try
        {
            var lines = new List<string>();
            foreach (var border in HardwareRows.Children.OfType<Border>())
            {
                if (border.Child is Grid grid &&
                    grid.Children.Count == 2 &&
                    grid.Children[0] is TextBlock label &&
                    grid.Children[1] is TextBlock value)
                {
                    lines.Add($"{label.Text}: {value.Text}");
                }
            }
            Clipboard.SetText("Casium hardware report\n" + string.Join("\n", lines));
            ToastService.Show("Hardware report copied", ToastKind.Success);
        }
        catch { }
    }

    // ================================================================ about / data

    private void McpDocs_Click(object sender, RoutedEventArgs e)
        => Ui.OpenUrl("https://modelcontextprotocol.io");

    private void OllamaLib_Click(object sender, RoutedEventArgs e)
        => Ui.OpenUrl("https://ollama.com/library");

    private void OpenDataFolder_Click(object sender, RoutedEventArgs e) => OpenFolder(AppData.Root);

    private void OpenLogsFolder_Click(object sender, RoutedEventArgs e)
        => OpenFolder(System.IO.Path.Combine(AppData.Root, "logs"));

    private static void OpenFolder(string path)
    {
        try
        {
            System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo(path)
            {
                UseShellExecute = true
            });
        }
        catch (Exception ex)
        {
            ToastService.Show(ex.Message, ToastKind.Error);
        }
    }

    private void ResetSettings_Click(object sender, RoutedEventArgs e)
    {
        var confirmed = Casium.Dialogs.ConfirmDialog.Show(
            Ui.OwnerWindow(this),
            "Reset all settings?",
            "Endpoints, defaults, theme and accent go back to their first-run values. Your prompts, MCP servers and models are untouched.",
            "Reset", danger: true);
        if (confirmed != true) return;
        AppServices.SettingsService.Reset();
        ThemeService.Apply(AppServices.Settings.Theme, AppServices.Settings.Accent);
        LoadValues();
        ToastService.Show("Settings reset");
    }
}
