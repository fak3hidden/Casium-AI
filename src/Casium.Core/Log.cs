namespace Casium.Core;

/// <summary>Per-user application data folder (%AppData%\Casium) and rolling log files.</summary>
public static class AppData
{
    public static string Root { get; } = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "Casium");

    static AppData()
    {
        try { Directory.CreateDirectory(Root); } catch { /* best effort */ }
    }
}

public static class Log
{
    private static readonly object Gate = new();

    public static void Info(string message) => Write("INFO ", message);
    public static void Warn(string message) => Write("WARN ", message);
    public static void Error(string message) => Write("ERROR", message);
    public static void Error(Exception ex, string context = "") =>
        Write("ERROR", string.IsNullOrEmpty(context) ? ex.ToString() : context + " :: " + ex);

    private static void Write(string level, string message)
    {
        try
        {
            var dir = Path.Combine(AppData.Root, "logs");
            Directory.CreateDirectory(dir);
            var file = Path.Combine(dir, $"casium-{DateTime.Now:yyyyMMdd}.log");
            lock (Gate)
                File.AppendAllText(file, $"{DateTime.Now:HH:mm:ss.fff} [{level}] {message}{Environment.NewLine}");
        }
        catch
        {
            // Logging must never take the app down.
        }
    }
}
