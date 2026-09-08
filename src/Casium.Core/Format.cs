namespace Casium.Core;

/// <summary>Human-friendly formatting helpers shared by every view.</summary>
public static class Format
{
    public static string Bytes(double bytes)
    {
        if (bytes <= 0) return "0 B";
        string[] units = { "B", "KB", "MB", "GB", "TB" };
        var i = 0;
        while (bytes >= 1024 && i < units.Length - 1) { bytes /= 1024; i++; }
        return bytes >= 100 || i == 0 ? $"{bytes:F0} {units[i]}" : $"{bytes:F1} {units[i]}";
    }

    public static string GB(double gb) =>
        gb >= 100 ? $"{gb:F0} GB" : gb >= 10 ? $"{gb:F1} GB" : $"{gb:F2} GB";

    public static string TokensPerSecond(double tps) =>
        tps >= 10 ? $"{tps:F0}" : tps >= 3 ? $"{tps:F1}" : $"{tps:F2}";
}
