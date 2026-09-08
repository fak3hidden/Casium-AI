using System.Text.RegularExpressions;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Documents;
using System.Windows.Input;
using System.Windows.Media;
using System.Windows.Navigation;
using Casium.Core;

namespace Casium.Controls;

/// <summary>
/// Renders a chunk of markdown-ish text (headings, lists, quotes, bold/italic/inline code,
/// links) into a TextBlock. Used for assistant chat messages.
/// </summary>
public partial class MarkdownTextBlock : Control
{
    private TextBlock? _text;

    public static readonly DependencyProperty TextProperty = DependencyProperty.Register(
        nameof(Text), typeof(string), typeof(MarkdownTextBlock),
        new FrameworkPropertyMetadata(string.Empty, FrameworkPropertyMetadataOptions.AffectsMeasure, OnTextChanged));

    public string Text
    {
        get => (string)GetValue(TextProperty);
        set => SetValue(TextProperty, value);
    }

    private static void OnTextChanged(DependencyObject d, DependencyPropertyChangedEventArgs e)
        => ((MarkdownTextBlock)d).Render();

    public override void OnApplyTemplate()
    {
        base.OnApplyTemplate();
        _text = GetTemplateChild("PART_Text") as TextBlock;
        Render();
    }

    private void Render()
    {
        if (_text == null) return;
        _text.Inlines.Clear();
        if (string.IsNullOrEmpty(Text)) return;

        _text.FontSize = 13.5;
        _text.LineHeight = 21;

        var lines = Text.Replace("\r\n", "\n").Split('\n');
        var first = true;

        foreach (var rawLine in lines)
        {
            if (!first) _text.Inlines.Add(new LineBreak());
            first = false;

            var line = rawLine.TrimEnd();
            if (line.Trim().Length == 0) continue;
            var trimmed = line.TrimStart();

            if (trimmed.StartsWith("#### "))
            {
                AddHeading(trimmed[5..], 13.5);
            }
            else if (trimmed.StartsWith("### "))
            {
                AddHeading(trimmed[4..], 14);
            }
            else if (trimmed.StartsWith("## "))
            {
                AddHeading(trimmed[3..], 15.5);
            }
            else if (trimmed.StartsWith("# "))
            {
                AddHeading(trimmed[2..], 17);
            }
            else if (RuleRegex().IsMatch(trimmed))
            {
                var rule = new Run("──────────────")
                {
                    Foreground = ResolveBrush("Brush.Text.Muted"),
                    FontSize = 12
                };
                _text.Inlines.Add(rule);
            }
            else if (trimmed.StartsWith("> "))
            {
                AddSpans(trimmed[2..], italic: true, muted: true);
            }
            else if (BulletRegex().IsMatch(trimmed))
            {
                var bullet = new Run("•  ")
                {
                    Foreground = ResolveBrush("Brush.Text.Muted"),
                    FontSize = 13.5
                };
                _text.Inlines.Add(bullet);
                AddSpans(BulletRegex().Replace(trimmed, "", 1));
            }
            else if (OrderedRegex().IsMatch(trimmed))
            {
                var match = OrderedRegex().Match(trimmed);
                var marker = new Run(match.Value + " ")
                {
                    Foreground = ResolveBrush("Brush.Text.Muted"),
                    FontSize = 13.5
                };
                _text.Inlines.Add(marker);
                AddSpans(trimmed[match.Length..]);
            }
            else
            {
                AddSpans(trimmed);
            }
        }
    }

    private void AddHeading(string text, double size)
    {
        foreach (var span in Markdown.ParseInlines(text))
        {
            var run = new Run(span.Text)
            {
                FontSize = size,
                FontWeight = FontWeights.SemiBold,
                Foreground = ResolveBrush("Brush.Text.Primary")
            };
            _text!.Inlines.Add(run);
        }
    }

    private void AddSpans(string text, bool italic = false, bool muted = false)
    {
        foreach (var span in Markdown.ParseInlines(text))
        {
            switch (span.Kind)
            {
                case MdSpanKind.Bold:
                    _text!.Inlines.Add(new Run(span.Text)
                    {
                        FontWeight = FontWeights.SemiBold,
                        FontStyle = italic ? FontStyles.Italic : FontStyles.Normal,
                        FontSize = 13.5
                    });
                    break;
                case MdSpanKind.Italic:
                    _text!.Inlines.Add(new Run(span.Text)
                    {
                        FontStyle = FontStyles.Italic,
                        FontSize = 13.5,
                        Foreground = muted ? ResolveBrush("Brush.Text.Secondary") : null
                    });
                    break;
                case MdSpanKind.Code:
                    _text!.Inlines.Add(new Run(span.Text)
                    {
                        FontFamily = TryFindResource("Font.Mono") as FontFamily ?? new FontFamily("Consolas"),
                        FontSize = 12.5,
                        Foreground = ResolveBrush("Brush.Accent")
                    });
                    break;
                case MdSpanKind.Link:
                    var link = new Hyperlink(new Run(span.Text))
                    {
                        NavigateUri = TryGetUri(span.Href),
                        Foreground = ResolveBrush("Brush.Accent"),
                        FontSize = 13.5,
                        TextDecorations = TextDecorations.Underline
                    };
                    link.RequestNavigate += OnRequestNavigate;
                    _text!.Inlines.Add(link);
                    break;
                default:
                    _text!.Inlines.Add(new Run(span.Text)
                    {
                        FontSize = 13.5,
                        FontStyle = italic ? FontStyles.Italic : FontStyles.Normal,
                        Foreground = muted ? ResolveBrush("Brush.Text.Secondary") : null
                    });
                    break;
            }
        }
    }

    private void OnRequestNavigate(object sender, RequestNavigateEventArgs e)
    {
        if (e.Uri == null) return;
        try
        {
            System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo(e.Uri.ToString())
            {
                UseShellExecute = true
            });
        }
        catch (Exception ex)
        {
            Log.Warn("Could not open link: " + ex.Message);
        }
    }

    private static Uri? TryGetUri(string? href)
    {
        if (string.IsNullOrEmpty(href)) return null;
        return Uri.TryCreate(href, UriKind.Absolute, out var uri) ? uri : null;
    }

    private Brush? ResolveBrush(string key) => TryFindResource(key) as Brush;

    [GeneratedRegex(@"^[-*•]\s+")]
    private static partial Regex BulletRegex();

    [GeneratedRegex(@"^\d+[.)]\s+")]
    private static partial Regex OrderedRegex();

    [GeneratedRegex(@"^(-{3,}|\*{3,}|_{3,})$")]
    private static partial Regex RuleRegex();
}
