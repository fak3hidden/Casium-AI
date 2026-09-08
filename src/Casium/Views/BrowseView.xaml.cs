using System.Collections.ObjectModel;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Controls.Primitives;
using Casium.Controls;
using Casium.Core;
using Casium.Services;
using Casium.Shell;

namespace Casium.Views;

/// <summary>View-model row for one model size, with its compatibility verdict.</summary>
public sealed class VariantRow
{
    public CatalogVariant Variant { get; }
    public RunAnalysis? Analysis { get; }
    public string Label => Variant.Label;
    public string Tag => Variant.Tag;
    public double SizeGB => Variant.SizeGB;
    public string VerdictLabel { get; }
    public PillKind VerdictKind { get; }

    public VariantRow(CatalogVariant variant, RunAnalysis? analysis)
    {
        Variant = variant;
        Analysis = analysis;
        VerdictLabel = analysis == null ? "?" : CompatibilityEngine.VerdictLabel(analysis.Verdict);
        VerdictKind = analysis?.Verdict switch
        {
            Verdict.Excellent or Verdict.Good => PillKind.Success,
            Verdict.Okay => PillKind.Accent,
            Verdict.Tight or Verdict.Poor => PillKind.Warning,
            Verdict.WontRun => PillKind.Danger,
            _ => PillKind.Neutral
        };
    }
}

public partial class BrowseView : UserControl
{
    private readonly ObservableCollection<CatalogItem> _filtered = new();
    private readonly List<ToggleButton> _chips = new();
    private CatalogItem? _selected;
    private VariantRow? _selectedVariant;
    private HardwareInfo? _hardware;
    private string _category = "All";

    public BrowseView()
    {
        InitializeComponent();
        CatalogList.ItemsSource = _filtered;
        BuildChips();

        Bus.ModelsChanged += RefreshInstalledBadges;
        Bus.PullsChanged += UpdateDownloadButton;
        Loaded += OnViewLoaded;
    }

    private async void OnViewLoaded(object sender, RoutedEventArgs e)
    {
        if (_hardware == null)
        {
            DetailName.Text = "Scanning your hardware…";
            try
            {
                _hardware = await AppServices.HardwareAsync;
            }
            catch
            {
                _hardware = new HardwareInfo { CpuName = "Unknown CPU" };
            }
            ApplyFilter();
            RefreshDetail();
        }
        RefreshInstalledBadges();
        if (CatalogList.SelectedItem == null && _filtered.Count > 0)
            CatalogList.SelectedItem = _filtered[0];
    }

    // ================================================================ filtering

    private void BuildChips()
    {
        var categories = new[] { "All", "General", "Coding", "Reasoning", "Vision" };
        foreach (var category in categories)
        {
            var chip = new ToggleButton
            {
                Style = (Style)FindResource("Chip"),
                Content = category,
                IsChecked = category == "All",
                GroupName = "BrowseCategory",
                Margin = new Thickness(0, 0, 8, 0)
            };
            chip.Checked += (_, _) => { _category = category; ApplyFilter(); };
            _chips.Add(chip);
            CategoryChips.Children.Add(chip);
        }
    }

    private void Search_TextChanged(object sender, TextChangedEventArgs e) => ApplyFilter();

    private void ApplyFilter()
    {
        var query = Search.Text?.Trim().ToLowerInvariant() ?? "";
        var selectedId = _selected?.Id;

        _filtered.Clear();
        foreach (var item in AppServices.Catalog.Items)
        {
            if (_category != "All" && item.Category != _category) continue;
            if (query.Length > 0 &&
                !item.Name.ToLowerInvariant().Contains(query) &&
                !item.Publisher.ToLowerInvariant().Contains(query) &&
                !item.Description.ToLowerInvariant().Contains(query) &&
                !item.Category.ToLowerInvariant().Contains(query) &&
                !item.Capabilities.Any(c => c.Contains(query, StringComparison.InvariantCultureIgnoreCase)))
                continue;
            _filtered.Add(item);
        }

        if (selectedId != null)
        {
            var still = _filtered.FirstOrDefault(i => i.Id == selectedId);
            if (still != null) CatalogList.SelectedItem = still;
        }
    }

    private void RefreshInstalledBadges()
    {
        foreach (var item in AppServices.Catalog.Items)
        {
            var installed = AppServices.Engine.IsFamilyInstalled(item.Id);
            item.InstalledLabel = installed ? "installed" : "";
        }
        // Force re-render of the installed pills by reapplying the filter.
        var selected = CatalogList.SelectedItem as CatalogItem;
        ApplyFilter();
        if (selected != null && _filtered.Contains(selected))
            CatalogList.SelectedItem = selected;
        UpdateDownloadButton();
    }

    // ================================================================ selection

    private void CatalogList_SelectionChanged(object sender, SelectionChangedEventArgs e)
    {
        if (CatalogList.SelectedItem is CatalogItem item)
        {
            _selected = item;
            var variant = item.DefaultVariant;
            if (variant != null)
                SelectVariant(variant);
        }
    }

    private void SelectVariant(CatalogVariant variant)
    {
        var rows = BuildVariantRows(_selected!);
        Variants.ItemsSource = rows;
        var row = rows.FirstOrDefault(r => r.Variant.Tag == variant.Tag);
        Variants.SelectedItem = row;
        _selectedVariant = row;
        RefreshDetail();
    }

    private void Variants_SelectionChanged(object sender, SelectionChangedEventArgs e)
    {
        if (Variants.SelectedItem is VariantRow row)
        {
            _selectedVariant = row;
            RefreshDetail();
        }
    }

    private List<VariantRow> BuildVariantRows(CatalogItem item)
    {
        var rows = new List<VariantRow>();
        foreach (var variant in item.Variants)
        {
            RunAnalysis? analysis = _hardware == null
                ? null
                : CompatibilityEngine.Analyze(variant, _hardware);
            rows.Add(new VariantRow(variant, analysis));
        }
        return rows;
    }

    // ================================================================ detail

    private void RefreshDetail()
    {
        var item = _selected;
        var row = _selectedVariant;
        if (item == null || row == null)
        {
            EmptyDetail.Visibility = Visibility.Visible;
            DetailScroll.Visibility = Visibility.Collapsed;
            return;
        }

        EmptyDetail.Visibility = Visibility.Collapsed;
        DetailScroll.Visibility = Visibility.Visible;

        DetailName.Text = item.Name;
        DetailPublisher.Text = $"{item.Publisher} · {item.Variants.Count} size{(item.Variants.Count == 1 ? "" : "s")}";
        DetailDescription.Text = item.Description;

        DetailPills.Children.Clear();
        AddPill(DetailPills, item.License, PillKind.Neutral);
        if (item.Context.Length > 0) AddPill(DetailPills, item.Context, PillKind.Neutral);
        foreach (var capability in item.Capabilities) AddPill(DetailPills, capability, PillKind.Accent);
        if (AppServices.Engine.IsFamilyInstalled(item.Id))
            AddPill(DetailPills, "in your library", PillKind.Success);

        var analysis = row.Analysis;
        if (analysis == null)
        {
            VerdictTitle.Text = $"{item.Name} {row.Label}";
            VerdictPill.Text = "…";
            VerdictPill.Kind = PillKind.Neutral;
            VerdictSummary.Text = "Detecting your hardware…";
            HardwareLine.Text = "";
            RamBar.Visibility = Visibility.Collapsed;
            VramBar.Visibility = Visibility.Collapsed;
            ModeText.Text = "—";
            SpeedText.Text = "—";
        }
        else
        {
            VerdictTitle.Text = $"{item.Name} {row.Label} · {Format.GB(analysis.SizeGB)} download";
            VerdictPill.Text = CompatibilityEngine.VerdictLabel(analysis.Verdict);
            VerdictPill.Kind = row.VerdictKind;
            VerdictSummary.Text = analysis.Summary;

            var hw = _hardware!;
            HardwareLine.Text =
                $"Your PC — {hw.CpuName} · {Format.GB(hw.TotalRamGB)} RAM" +
                (hw.BestGpu != null
                    ? $" · {hw.BestGpu.ShortName} ({Format.GB(hw.BestGpu.VramGB)} VRAM)"
                    : " · no dedicated GPU detected");

            RamBar.Visibility = Visibility.Visible;
            RamBar.Caption = "System RAM";
            RamBar.ValueText = $"≈ {Format.GB(analysis.RamNeededGB)} needed of {Format.GB(hw.TotalRamGB)}";
            RamBar.Ratio = hw.TotalRamGB > 0 ? analysis.RamNeededGB / hw.TotalRamGB : 1;
            RamBar.Over = !analysis.RamFits;

            var gpu = hw.BestGpu;
            if (gpu != null)
            {
                VramBar.Visibility = Visibility.Visible;
                VramBar.Caption = $"VRAM — {gpu.ShortName}";
                VramBar.ValueText = $"≈ {Format.GB(analysis.VramNeededGB)} needed of {Format.GB(gpu.VramGB)}";
                VramBar.Ratio = analysis.VramNeededGB / gpu.VramGB;
                VramBar.Over = !analysis.VramFits;
            }
            else
            {
                VramBar.Visibility = Visibility.Collapsed;
            }

            ModeText.Text = analysis.ModeText;
            SpeedText.Text = analysis.SpeedText;
        }

        UpdateDownloadButton();
    }

    private static void AddPill(Panel panel, string text, PillKind kind)
    {
        panel.Children.Add(new Pill
        {
            Text = text,
            Kind = kind,
            Margin = new Thickness(0, 0, 8, 0)
        });
    }

    // ================================================================ download

    private void UpdateDownloadButton()
    {
        var row = _selectedVariant;
        if (row == null) return;

        var installed = AppServices.Engine.IsInstalled(row.Variant.Tag, row.Variant.IsDefault);
        var pulling = AppServices.Pulls.IsPulling(row.Variant.Tag);

        if (installed)
        {
            DownloadGlyph.Text = "\uE73E";
            DownloadLabel.Text = "Installed — use it";
            DownloadButton.IsEnabled = true;
            DownloadHint.Text = "This size is already on disk.";
        }
        else if (pulling)
        {
            DownloadGlyph.Text = "\uE72C";
            DownloadLabel.Text = "Downloading…";
            DownloadButton.IsEnabled = false;
            DownloadHint.Text = "Watch progress on the Local models page.";
        }
        else
        {
            DownloadGlyph.Text = "\uE896";
            DownloadLabel.Text = $"Download · {Format.GB(row.SizeGB)}";
            DownloadButton.IsEnabled = true;
            var analysis = row.Analysis;
            DownloadHint.Text = analysis is { RamFits: false }
                ? "Heads-up: this size likely won't fit in your RAM. A smaller size is highlighted above."
                : "Pulled from the public Ollama library. Runs fully offline once downloaded.";
        }
    }

    private void Download_Click(object sender, RoutedEventArgs e)
    {
        var row = _selectedVariant;
        if (row == null) return;

        if (AppServices.Engine.IsInstalled(row.Variant.Tag, row.Variant.IsDefault))
        {
            AppServices.Settings.DefaultModel = row.Variant.Tag;
            ChatView.DesiredModel = row.Variant.Tag;
            MainWindow.Instance?.Navigate("Chat");
            return;
        }

        if (!AppServices.Engine.IsOnline)
        {
            ToastService.Show("Engine is offline — start Ollama to download models.", ToastKind.Warning);
            return;
        }

        AppServices.Pulls.Start(row.Variant.Tag);
        ToastService.Show($"Downloading {row.Variant.Tag}…");
        UpdateDownloadButton();
    }

    private void DetailLink_Click(object sender, RoutedEventArgs e)
    {
        if (_selected != null)
            Ui.OpenUrl("https://ollama.com/library/" + _selected.Id);
    }
}
