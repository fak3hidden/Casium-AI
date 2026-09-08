using System.Windows;
using System.Windows.Controls;
using Casium.Core;
using Casium.Dialogs;
using Casium.Services;
using Casium.Shell;

namespace Casium.Views;

public partial class PromptsView : UserControl
{
    public PromptsView()
    {
        InitializeComponent();
        Bus.PromptsChanged += RefreshList;
        Loaded += (_, _) => RefreshList();
    }

    private void RefreshList()
    {
        PromptList.ItemsSource = null;
        PromptList.ItemsSource = AppServices.Prompts.Items;
        EmptyState.Visibility = AppServices.Prompts.Items.Count == 0 ? Visibility.Visible : Visibility.Collapsed;
    }

    private void NewPrompt_Click(object sender, RoutedEventArgs e)
    {
        var result = PromptDialog.Show(Ui.OwnerWindow(this), null);
        if (result != null)
        {
            AppServices.Prompts.Upsert(result);
            ToastService.Show($"Saved “{result.Name}”", ToastKind.Success);
        }
    }

    private void EditPrompt_Click(object sender, RoutedEventArgs e)
    {
        if ((sender as FrameworkElement)?.DataContext is not PromptItem prompt) return;
        var result = PromptDialog.Show(Ui.OwnerWindow(this), prompt);
        if (result != null)
        {
            AppServices.Prompts.Upsert(result);
            ToastService.Show("Prompt updated", ToastKind.Success);
        }
    }

    private void UseInChat_Click(object sender, RoutedEventArgs e)
    {
        if ((sender as FrameworkElement)?.DataContext is not PromptItem prompt) return;
        AppServices.Prompts.SetDefault(prompt.Id);
        AppServices.Settings.DefaultPromptId = prompt.Id;
        ToastService.Show($"“{prompt.Name}” will be used in new chats", ToastKind.Success);
        MainWindow.Instance?.Navigate("Chat");
    }

    private void DeletePrompt_Click(object sender, RoutedEventArgs e)
    {
        if ((sender as FrameworkElement)?.DataContext is not PromptItem prompt) return;
        var confirmed = ConfirmDialog.Show(
            Ui.OwnerWindow(this),
            "Delete prompt?",
            $"“{prompt.Name}” will be gone for good.",
            "Delete", danger: true);
        if (confirmed != true) return;
        AppServices.Prompts.Delete(prompt.Id);
        ToastService.Show("Prompt deleted");
    }
}
