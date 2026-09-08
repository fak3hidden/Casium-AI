using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using System.Windows.Media.Animation;
using System.Windows.Media.Effects;
using System.Windows.Shapes;
using System.Windows.Threading;
using Casium.Controls;

namespace Casium.Services;

public enum ToastKind
{
    Info,
    Success,
    Warning,
    Error
}

/// <summary>Small bottom-center toasts ("Model deleted", "GitHub connected — 42 tools", …).</summary>
public static class ToastService
{
    private static Panel? _layer;

    public static void Attach(Panel layer) => _layer = layer;

    public static void Show(string text, ToastKind kind = ToastKind.Info, int durationMs = 3200)
    {
        var layer = _layer;
        if (layer == null)
        {
            Core.Log.Info($"[toast:{kind}] {text}");
            return;
        }

        var toast = Build(text, kind);
        layer.Children.Add(toast);

        var fadeIn = new DoubleAnimation(0, 1, TimeSpan.FromMilliseconds(180), FillBehavior.Stop);
        toast.BeginAnimation(UIElement.OpacityProperty, fadeIn);
        toast.Opacity = 1;

        var timer = new DispatcherTimer { Interval = TimeSpan.FromMilliseconds(durationMs) };
        timer.Tick += (_, _) =>
        {
            timer.Stop();
            var fadeOut = new DoubleAnimation(1, 0, TimeSpan.FromMilliseconds(220), FillBehavior.Stop);
            fadeOut.Completed += (_, _) => layer.Children.Remove(toast);
            toast.BeginAnimation(UIElement.OpacityProperty, fadeOut);
        };
        timer.Start();
    }

    /// <summary>Safe call for non-UI threads.</summary>
    public static void TryShow(string text, ToastKind kind = ToastKind.Info, int durationMs = 3200)
    {
        if (Application.Current?.Dispatcher == null) return;
        Application.Current.Dispatcher.BeginInvoke(() => Show(text, kind, durationMs));
    }

    private static Border Build(string text, ToastKind kind)
    {
        var (glyph, colorKey) = kind switch
        {
            ToastKind.Success => ("\uE73E", "Brush.Success"),
            ToastKind.Warning => ("\uE7BA", "Brush.Warning"),
            ToastKind.Error => ("\uE783", "Brush.Danger"),
            _ => ("\uE946", "Brush.Info")
        };

        var icon = new TextBlock
        {
            Text = glyph,
            FontFamily = TryResource("Font.Icons") as FontFamily ?? new FontFamily("Segoe MDL2 Assets"),
            FontSize = 13,
            Foreground = TryResource(colorKey) as Brush,
            VerticalAlignment = VerticalAlignment.Center
        };

        var label = new TextBlock
        {
            Text = text,
            FontSize = 12.5,
            Foreground = TryResource("Brush.Text.Primary") as Brush,
            VerticalAlignment = VerticalAlignment.Center,
            TextWrapping = TextWrapping.Wrap,
            MaxWidth = 380
        };

        var panel = new StackPanel { Orientation = Orientation.Horizontal };
        panel.Children.Add(icon);
        panel.Children.Add(new Border { Width = 10 });
        panel.Children.Add(label);

        var toast = new Border
        {
            Background = TryResource("Brush.Bg.Overlay") as Brush,
            BorderBrush = TryResource("Brush.Border.Medium") as Brush,
            BorderThickness = new Thickness(1),
            CornerRadius = new CornerRadius(10),
            Padding = new Thickness(14, 9, 16, 9),
            Margin = new Thickness(0, 6, 0, 0),
            Child = panel,
            Effect = new DropShadowEffect
            {
                BlurRadius = 18,
                ShadowDepth = 3,
                Opacity = 0.35,
                Color = Colors.Black
            }
        };

        return toast;
    }

    private static object? TryResource(string key) =>
        Application.Current?.TryFindResource(key);
}
