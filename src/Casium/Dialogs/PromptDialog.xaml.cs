using System.Windows;
using Casium.Core;
using Casium.Services;

namespace Casium.Dialogs;

public partial class PromptDialog : Window
{
    private PromptDialog(PromptItem existing)
    {
        InitializeComponent();
        Existing = existing;
        NameBox.Text = existing.Name;
        ContentBox.Text = existing.Content;
    }

    private PromptItem Existing { get; }

    private PromptItem? Result { get; set; }

    /// <summary>Opens the editor. Returns the saved prompt, or null when cancelled.</summary>
    public static PromptItem? Show(Window? owner, PromptItem? existing)
    {
        var dialog = new PromptDialog(existing ?? new PromptItem())
        {
            Owner = owner
        };
        return dialog.ShowDialog() == true ? dialog.Result : null;
    }

    private void Save_Click(object sender, RoutedEventArgs e)
    {
        var name = NameBox.Text.Trim();
        if (name.Length == 0)
        {
            ToastService.Show("Give the prompt a name.", ToastKind.Warning);
            NameBox.Focus();
            return;
        }

        Result = new PromptItem
        {
            Id = Existing.Id,
            Name = name,
            Content = ContentBox.Text.Trim(),
            IsDefault = Existing.IsDefault
        };
        DialogResult = true;
    }

    private void Cancel_Click(object sender, RoutedEventArgs e) => DialogResult = false;

    private void Close_Click(object sender, RoutedEventArgs e) => DialogResult = false;
}
