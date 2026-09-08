using System.Windows;

namespace Casium.Services;

/// <summary>Small WPF helpers shared by the views.</summary>
public static class Ui
{
    public static void OpenUrl(string url)
    {
        try
        {
            System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo(url)
            {
                UseShellExecute = true
            });
        }
        catch (Exception ex)
        {
            Core.Log.Warn("Could not open url " + url + ": " + ex.Message);
        }
    }

    public static Window? OwnerWindow(FrameworkElement element) =>
        element == null ? null : Window.GetWindow(element);
}
