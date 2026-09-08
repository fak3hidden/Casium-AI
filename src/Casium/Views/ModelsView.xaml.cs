using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using Casium.Core;
using Casium.Dialogs;
using Casium.Services;
using Casium.Shell;

namespace Casium.Views;

public partial class ModelsView : UserControl
{
    public ModelsView()
    {
        InitializeComponent();
        PullList.ItemsSource = AppServices.Pulls.Jobs;

        Bus.ModelsChanged += RefreshUi;
        Bus.EngineChanged += RefreshUi;
        Bus.PullsChanged += RefreshUi;
        Loaded += (_, _) => RefreshUi();
    }

    private void RefreshUi()
    {
        var models = AppServices.Engine.Models;
        ModelList.ItemsSource = null;
        ModelList.ItemsSource = models;

        var totalBytes = models.Sum(m => m.SizeBytes);
        Subtitle.Text = models.Count == 0
            ? "Models downloaded to this machine"
            : $"{models.Count} model{(models.Count == 1 ? "" : "s")} · {Format.GB(totalBytes / 1024.0 / 1024 / 1024)} on disk";

        EmptyState.Visibility = models.Count == 0 ? Visibility.Visible : Visibility.Collapsed;

        var anyRunning = false;
        for (var i = 0; i < AppServices.Pulls.Jobs.Count; i++)
            if (AppServices.Pulls.Jobs[i].Running) anyRunning = true;
        PullList.Visibility = AppServices.Pulls.Jobs.Count > 0 ? Visibility.Visible : Visibility.Collapsed;
        _ = anyRunning; // PullList visibility already covers finished jobs for a while.
    }

    private void ChatWithModel_Click(object sender, RoutedEventArgs e)
    {
        if ((sender as FrameworkElement)?.DataContext is not OllamaModel model) return;
        AppServices.Settings.DefaultModel = model.Name;
        ChatView.DesiredModel = model.Name;
        MainWindow.Instance?.Navigate("Chat");
    }

    private async void DeleteModel_Click(object sender, RoutedEventArgs e)
    {
        if ((sender as FrameworkElement)?.DataContext is not OllamaModel model) return;

        var confirmed = ConfirmDialog.Show(
            Ui.OwnerWindow(this),
            "Delete model?",
            $"“{model.Name}” will be removed from disk. You can download it again any time.",
            "Delete", danger: true);
        if (confirmed != true) return;

        var ok = await AppServices.Engine.DeleteModelAsync(model.Name);
        if (ok) ToastService.Show($"Deleted {model.Name}");
        else ToastService.Show(AppServices.Engine.LastError, ToastKind.Error);
    }

    private void Pull_Click(object sender, RoutedEventArgs e) => Pull();

    private void PullInput_KeyDown(object sender, KeyEventArgs e)
    {
        if (e.Key == Key.Enter)
        {
            e.Handled = true;
            Pull();
        }
    }

    private void Pull()
    {
        var tag = PullInput.Text.Trim();
        if (tag.Length == 0) return;

        if (!AppServices.Engine.IsOnline)
        {
            ToastService.Show("Engine is offline — start Ollama to pull models.", ToastKind.Warning);
            return;
        }

        PullInput.Clear();
        AppServices.Pulls.Start(tag);
        ToastService.Show($"Pulling {tag}…");
    }

    private void CancelPull_Click(object sender, RoutedEventArgs e)
    {
        if ((sender as FrameworkElement)?.DataContext is PullJob job)
            AppServices.Pulls.Cancel(job);
    }

    private void GoBrowse_Click(object sender, RoutedEventArgs e)
        => MainWindow.Instance?.Navigate("Browse models");
}
