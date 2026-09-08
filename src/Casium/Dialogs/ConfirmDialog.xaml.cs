using System.Windows;

namespace Casium.Dialogs;

public partial class ConfirmDialog : Window
{
    private ConfirmDialog(string title, string message, string confirmText, bool danger)
    {
        InitializeComponent();
        Title = title;
        TitleText.Text = title;
        MessageText.Text = message;
        ConfirmButton.Content = confirmText;
        if (danger)
            ConfirmButton.Style = (Style)FindResource("Btn.Danger");
    }

    /// <summary>Shows a confirmation. True when the confirm button was pressed.</summary>
    public static bool? Show(Window? owner, string title, string message, string confirmText, bool danger = false)
    {
        var dialog = new ConfirmDialog(title, message, confirmText, danger)
        {
            Owner = owner
        };
        return dialog.ShowDialog();
    }

    private void Confirm_Click(object sender, RoutedEventArgs e) => DialogResult = true;

    private void Cancel_Click(object sender, RoutedEventArgs e) => DialogResult = false;

    private void Close_Click(object sender, RoutedEventArgs e) => DialogResult = false;
}
