using System.Windows;
using System.Windows.Controls;

namespace Casium.Controls;

public enum PillKind
{
    Neutral,
    Accent,
    Success,
    Warning,
    Danger,
    Info
}

/// <summary>Small status pill — label + colored background. Restyled entirely by Controls.xaml.</summary>
public class Pill : Control
{
    public static readonly DependencyProperty TextProperty = DependencyProperty.Register(
        nameof(Text), typeof(string), typeof(Pill), new PropertyMetadata(""));

    public static readonly DependencyProperty KindProperty = DependencyProperty.Register(
        nameof(Kind), typeof(PillKind), typeof(Pill), new PropertyMetadata(PillKind.Neutral));

    public string Text
    {
        get => (string)GetValue(TextProperty);
        set => SetValue(TextProperty, value);
    }

    public PillKind Kind
    {
        get => (PillKind)GetValue(KindProperty);
        set => SetValue(KindProperty, value);
    }
}
