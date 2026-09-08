using System.Text.RegularExpressions;

namespace Casium.Core;

public enum MdSpanKind
{
    Plain,
    Bold,
    Italic,
    Code,
    Link
}

public sealed class MdSpan
{
    public MdSpanKind Kind { get; init; }
    public string Text { get; init; } = "";
    public string? Href { get; init; }
}

/// <summary>A block of markdown rendered as rich text (headings, lists, inline styles).</summary>
public sealed class MdSegment
{
    public string Text { get; set; } = "";
}

/// <summary>A fenced code block.</summary>
public sealed class MdCode
{
    public string Lang { get; set; } = "";
    public string Code { get; set; } = "";
}

/// <summary>
/// Small, dependency-free markdown splitter for chat rendering: splits fenced code
/// blocks out of a stream and tokenizes inline bold/italic/code/link spans.
/// </summary>
public static partial class Markdown
{
    [GeneratedRegex(@"(`[^`\n]+`)|(\*\*[^*\n]+\*\*)|(\*[^*\n]+\*)|(\[[^\]\n]+\]\([^)\s]+\))")]
    private static partial Regex InlineRegex();

    public static List<object> ParseBlocks(string markdown)
    {
        var result = new List<object>();
        if (string.IsNullOrEmpty(markdown)) return result;

        var lines = markdown.Replace("\r\n", "\n").Split('\n');
        var text = new List<string>();
        var code = new List<string>();
        var inCode = false;
        var lang = "";

        foreach (var line in lines)
        {
            var trimmed = line.TrimStart();
            if (!inCode && trimmed.StartsWith("```"))
            {
                FlushText();
                inCode = true;
                lang = trimmed[3..].Trim();
                if (lang.Length == 0) lang = "text";
                code.Clear();
                continue;
            }
            if (inCode && trimmed.StartsWith("```"))
            {
                result.Add(new MdCode { Lang = lang, Code = string.Join("\n", code) });
                inCode = false;
                continue;
            }
            if (inCode) code.Add(line);
            else text.Add(line);
        }

        if (inCode)
            result.Add(new MdCode { Lang = lang, Code = string.Join("\n", code) });
        FlushText();
        return result;

        void FlushText()
        {
            var joined = string.Join("\n", text).Trim();
            if (joined.Length > 0)
                result.Add(new MdSegment { Text = joined });
            text.Clear();
        }
    }

    public static List<MdSpan> ParseInlines(string text)
    {
        var spans = new List<MdSpan>();
        if (string.IsNullOrEmpty(text)) return spans;

        var pos = 0;
        foreach (Match match in InlineRegex().Matches(text))
        {
            if (match.Index > pos)
                spans.Add(new MdSpan { Text = text[pos..match.Index] });

            var value = match.Value;
            if (value.StartsWith('`'))
                spans.Add(new MdSpan { Kind = MdSpanKind.Code, Text = value[1..^1] });
            else if (value.StartsWith("**"))
                spans.Add(new MdSpan { Kind = MdSpanKind.Bold, Text = value[2..^2] });
            else if (value.StartsWith('*'))
                spans.Add(new MdSpan { Kind = MdSpanKind.Italic, Text = value[1..^1] });
            else
            {
                var separator = value.IndexOf("](");
                if (separator > 0)
                    spans.Add(new MdSpan
                    {
                        Kind = MdSpanKind.Link,
                        Text = value[1..separator],
                        Href = value[(separator + 2)..^1]
                    });
            }
            pos = match.Index + value.Length;
        }

        if (pos < text.Length)
            spans.Add(new MdSpan { Text = text[pos..] });
        return spans;
    }
}
