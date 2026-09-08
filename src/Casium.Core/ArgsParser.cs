using System.Text;

namespace Casium.Core;

/// <summary>Quote-aware command-line helpers for MCP server commands.</summary>
public static class ArgsParser
{
    public static List<string> Split(string line)
    {
        var result = new List<string>();
        if (string.IsNullOrWhiteSpace(line)) return result;

        var current = new StringBuilder();
        var inQuotes = false;
        foreach (var ch in line)
        {
            if (ch == '"')
            {
                inQuotes = !inQuotes;
            }
            else if (char.IsWhiteSpace(ch) && !inQuotes)
            {
                if (current.Length > 0)
                {
                    result.Add(current.ToString());
                    current.Clear();
                }
            }
            else
            {
                current.Append(ch);
            }
        }
        if (current.Length > 0) result.Add(current.ToString());
        return result;
    }

    public static string Quote(string arg) =>
        arg.Length == 0 || arg.Contains(' ') ? "\"" + arg + "\"" : arg;

    public static string Join(IEnumerable<string> args) => string.Join(" ", args.Select(Quote));

    /// <summary>Parses KEY=VALUE lines into a dictionary.</summary>
    public static Dictionary<string, string> ParseEnvironment(string multiLine)
    {
        var env = new Dictionary<string, string>();
        if (string.IsNullOrWhiteSpace(multiLine)) return env;
        foreach (var rawLine in multiLine.Replace("\r\n", "\n").Split('\n'))
        {
            var line = rawLine.Trim();
            if (line.Length == 0 || line.StartsWith('#')) continue;
            var eq = line.IndexOf('=');
            if (eq <= 0) continue;
            var key = line[..eq].Trim();
            var value = line[(eq + 1)..].Trim();
            if (key.Length > 0) env[key] = value;
        }
        return env;
    }

    public static string FormatEnvironment(Dictionary<string, string> env) =>
        string.Join("\n", env.Select(kv => kv.Key + "=" + kv.Value));
}
