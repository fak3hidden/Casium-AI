using System.Windows;
using System.Windows.Threading;
using Casium.Core;
using Casium.Services;

namespace Casium;

public partial class App : Application
{
    public App()
    {
        // The bus marshals background events onto the UI thread from here on.
        Bus.CaptureUiContext();
    }

    protected override void OnStartup(StartupEventArgs e)
    {
        Bus.CaptureUiContext();

        AppServices.SettingsService.Load();
        AppServices.Prompts.Load();
        AppServices.Mcp.Load();
        ThemeService.Apply(AppServices.Settings.Theme, AppServices.Settings.Accent);

        DispatcherUnhandledException += OnDispatcherUnhandled;
        AppDomain.CurrentDomain.UnhandledException += (_, args) =>
            Log.Error(args.ExceptionObject as Exception ?? new Exception(args.ExceptionObject.ToString() ?? "?"),
                "domain unhandled");

        base.OnStartup(e);
    }

    private void OnDispatcherUnhandled(object sender, DispatcherUnhandledExceptionEventArgs e)
    {
        Log.Error(e.Exception, "dispatcher unhandled");
        ToastService.TryShow("Something went wrong — details are in the logs.", ToastKind.Error);
        e.Handled = true;
    }

    protected override void OnExit(ExitEventArgs e)
    {
        try
        {
            AppServices.Mcp.DisconnectAll();
            AppServices.SettingsService.Save();
        }
        catch (Exception ex)
        {
            Log.Error(ex, "exit");
        }
        base.OnExit(e);
    }
}
