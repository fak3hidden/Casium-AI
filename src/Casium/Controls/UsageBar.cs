using System.Windows;
using System.Windows.Controls;

namespace Casium.Controls;

/// <summary>
/// Horizontal usage bar: "caption … value/limit" plus a fill bar. Set <see cref="Ratio"/>
/// to value/limit (values over 1 are clamped and shown in danger color via <see cref="Over"/>).
/// </summary>
public class UsageBar : Control
{
    public static readonly DependencyProperty CaptionProperty = DependencyProperty.Register(
        nameof(Caption), typeof(string), typeof(UsageBar), new PropertyMetadata(""));

    public static readonly DependencyProperty ValueTextProperty = DependencyProperty.Register(
        nameof(ValueText), typeof(string), typeof(UsageBar), new PropertyMetadata(""));

    public static readonly DependencyProperty RatioProperty = DependencyProperty.Register(
        nameof(Ratio), typeof(double), typeof(UsageBar),
        new PropertyMetadata(0.0, (d, _) => ((UsageBar)d).UpdateColumns()));

    public static readonly DependencyProperty OverProperty = DependencyProperty.Register(
        nameof(Over), typeof(bool), typeof(UsageBar), new PropertyMetadata(false));

    public string Caption
    {
        get => (string)GetValue(CaptionProperty);
        set => SetValue(CaptionProperty, value);
    }

    public string ValueText
    {
        get => (string)GetValue(ValueTextProperty);
        set => SetValue(ValueTextProperty, value);
    }

    public double Ratio
    {
        get => (double)GetValue(RatioProperty);
        set => SetValue(RatioProperty, value);
    }

    public bool Over
    {
        get => (bool)GetValue(OverProperty);
        set => SetValue(OverProperty, value);
    }

    private ColumnDefinition? _fill;
    private ColumnDefinition? _rest;

    public override void OnApplyTemplate()
    {
        base.OnApplyTemplate();
        _fill = GetTemplateChild("PART_Fill") as ColumnDefinition;
        _rest = GetTemplateChild("PART_Rest") as ColumnDefinition;
        UpdateColumns();
    }

    private void UpdateColumns()
    {
        if (_fill == null || _rest == null) return;
        var ratio = Math.Clamp(Ratio, 0.0, 1.0);
        _fill.Width = new GridLength(Math.Max(ratio, 0.02), GridUnitType.Star);
        _rest.Width = new GridLength(Math.Max(1.0 - ratio, 0.0), GridUnitType.Star);
    }
}
