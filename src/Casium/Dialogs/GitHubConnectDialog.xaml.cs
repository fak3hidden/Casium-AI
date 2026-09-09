using System.Windows;
using System.Windows.Media;
using Casium.Core;
using Casium.Services;

namespace Casium.Dialogs;

public partial class GitHubConnectDialog : Window
{
    private GitHubUser? _user;

    private GitHubConnectDialog()
    {
        InitializeComponent();
    }

    /// <summary>The token that was verified (only set on success).</summary>
    public string Token { get; private set; } = "";

    /// <summary>
    /// Runs the connect flow. Returns true when a token was verified; the caller then
    /// wires up (or updates) the GitHub MCP server with <see cref="Token"/> and <see cref="User"/>.
    /// </summary>
    public static bool Show(Window? owner, out GitHubUser? user, out string token)
    {
        var dialog = new GitHubConnectDialog { Owner = owner };
        var ok = dialog.ShowDialog() == true;
        user = dialog._user;
        token = dialog.Token;
        return ok && user != null && token.Length > 0;
    }

    private void TokenBox_TextChanged(object sender, System.Windows.Controls.TextChangedEventArgs e)
        => StatusText.Text = "";

    private void OpenTokenPage_Click(object sender, RoutedEventArgs e)
        => Ui.OpenUrl(GitHubClient.NewTokenUrl);

    private async void Connect_Click(object sender, RoutedEventArgs e)
    {
        var token = TokenBox.Text.Trim();
        if (token.Length < 10)
        {
            Status("Paste the token GitHub shows you first.", warning: true);
            return;
        }

        ConnectButton.IsEnabled = false;
        Status("Checking with GitHub…", warning: false);
        try
        {
            var user = await GitHubClient.ValidateTokenAsync(token);
            if (user == null || user.Login.Length == 0)
            {
                Status("GitHub didn't return a user for that token.", warning: true);
                return;
            }
            _user = user;
            Token = token;
            Status($"✓ Connected as @{user.Login}" +
                   (user.Name.Length > 0 ? $" — {user.Name}" : ""), warning: false, success: true);
            await System.Threading.Tasks.Task.Delay(700);
            DialogResult = true;
        }
        catch (Exception ex)
        {
            Status(ex.Message, warning: true);
        }
        finally
        {
            ConnectButton.IsEnabled = true;
        }
    }

    private void Status(string text, bool warning, bool success = false)
    {
        StatusText.Text = text;
        StatusText.Foreground = TryFindResource(success ? "Brush.Success"
            : warning ? "Brush.Warning" : "Brush.Text.Muted") as Brush
            ?? Brushes.Gray;
    }

    private void Cancel_Click(object sender, RoutedEventArgs e) => DialogResult = false;

    private void Close_Click(object sender, RoutedEventArgs e) => DialogResult = false;
}
