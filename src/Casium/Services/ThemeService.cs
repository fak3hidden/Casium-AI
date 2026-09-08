using System.Windows;

namespace Casium.Services;

/// <summary>Swaps the palette (index 0) and accent (index 1) dictionaries at runtime.</summary>
public static class ThemeService
{
    public static readonly string[] Themes = { "Midnight", "Daylight" };
    public static readonly string[] Accents = { "Violet", "Blue", "Teal", "Rose" };

    public static void Apply(string theme, string accent)
    {
        var app = Application.Current;
        if (app == null) return;
        var resources = app.Resources.MergedDictionaries;
        if (resources.Count < 4) return;

        var themeName = Themes.Contains(theme) ? theme : "Midnight";
        var accentName = Accents.Contains(accent) ? accent : "Violet";

        resources[0] = new ResourceDictionary
        {
            Source = new Uri($"/Casium;component/Themes/Palette.{themeName}.xaml", UriKind.Relative)
        };
        resources[1] = new ResourceDictionary
        {
            Source = new Uri($"/Casium;component/Themes/Accent.{accentName}.xaml", UriKind.Relative)
        };
    }
}
