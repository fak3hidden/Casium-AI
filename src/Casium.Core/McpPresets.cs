namespace Casium.Core;

public sealed class McpPreset
{
    public string Name { get; init; } = "";
    public string Glyph { get; init; } = "\uE756";
    public string Description { get; init; } = "";
    public string Command { get; init; } = "";
    public List<string> Args { get; init; } = new();
    public Dictionary<string, string> Env { get; init; } = new();
    public string Hint { get; init; } = "";
    public string DocsUrl { get; init; } = "";
    public bool NeedsFolder { get; init; }
}

/// <summary>One-click MCP server templates shown in the Connections page.</summary>
public static class McpPresets
{
    public const string GlyphFolder = "\uE8B7";
    public const string GlyphPerson = "\uE77B";
    public const string GlyphGlobe = "\uE774";
    public const string GlyphMemory = "\uE8C8";
    public const string GlyphSearch = "\uE721";
    public const string GlyphTerminal = "\uE756";
    public const string GlyphCode = "\uE943";

    public static readonly List<McpPreset> All = new()
    {
        new McpPreset
        {
            Name = "Project folder",
            Glyph = GlyphFolder,
            Description = "Give the model read/write access to a local folder — point it at your Visual Studio solution, repo or workspace. Great for 'explain this project' or targeted edits.",
            Command = "npx",
            Args = new List<string> { "-y", "@modelcontextprotocol/server-filesystem", @"C:\path\to\project" },
            NeedsFolder = true,
            Hint = "Requires Node.js (npx)",
            DocsUrl = "https://github.com/modelcontextprotocol/servers/tree/main/src/filesystem"
        },
        new McpPreset
        {
            Name = "GitHub",
            Glyph = GlyphPerson,
            Description = "Community GitHub server: search repos, read/create issues and PRs, work with files. Needs a personal access token (repo scope).",
            Command = "npx",
            Args = new List<string> { "-y", "@modelcontextprotocol/server-github" },
            Env = new Dictionary<string, string> { ["GITHUB_PERSONAL_ACCESS_TOKEN"] = "" },
            Hint = "Requires Node.js + a GitHub token (github.com/settings/tokens)",
            DocsUrl = "https://github.com/modelcontextprotocol/servers/tree/main/src/github"
        },
        new McpPreset
        {
            Name = "GitHub (official)",
            Glyph = GlyphPerson,
            Description = "GitHub's own MCP server, running in Docker. Full GitHub API surface: issues, PRs, code search, notifications and more.",
            Command = "docker",
            Args = new List<string> { "run", "-i", "--rm", "-e", "GITHUB_PERSONAL_ACCESS_TOKEN", "ghcr.io/github/github-mcp-server" },
            Env = new Dictionary<string, string> { ["GITHUB_PERSONAL_ACCESS_TOKEN"] = "" },
            Hint = "Requires Docker + a GitHub token",
            DocsUrl = "https://github.com/github/github-mcp-server"
        },
        new McpPreset
        {
            Name = "Memory",
            Glyph = GlyphMemory,
            Description = "Persistent knowledge graph across chats — people, preferences, project facts. The model remembers things between sessions.",
            Command = "npx",
            Args = new List<string> { "-y", "@modelcontextprotocol/server-memory" },
            Hint = "Requires Node.js (npx)",
            DocsUrl = "https://github.com/modelcontextprotocol/servers/tree/main/src/memory"
        },
        new McpPreset
        {
            Name = "Web fetch",
            Glyph = GlyphGlobe,
            Description = "Fetch and read web pages as clean markdown so the model can use live documentation and articles.",
            Command = "uvx",
            Args = new List<string> { "mcp-server-fetch" },
            Hint = "Requires uv (astral.sh/uv)",
            DocsUrl = "https://github.com/modelcontextprotocol/servers/tree/main/src/fetch"
        },
        new McpPreset
        {
            Name = "Brave Search",
            Glyph = GlyphSearch,
            Description = "Web and local search through the Brave Search API.",
            Command = "npx",
            Args = new List<string> { "-y", "@modelcontextprotocol/server-brave-search" },
            Env = new Dictionary<string, string> { ["BRAVE_API_KEY"] = "" },
            Hint = "Requires Node.js + a Brave Search API key",
            DocsUrl = "https://github.com/modelcontextprotocol/servers/tree/main/src/brave-search"
        },
        new McpPreset
        {
            Name = "Puppeteer",
            Glyph = GlyphTerminal,
            Description = "Browser automation: navigate, screenshot, click and fill forms. Handy for testing web projects.",
            Command = "npx",
            Args = new List<string> { "-y", "@modelcontextprotocol/server-puppeteer" },
            Hint = "Requires Node.js (downloads Chromium on first run)",
            DocsUrl = "https://github.com/modelcontextprotocol/servers/tree/main/src/puppeteer"
        },
        new McpPreset
        {
            Name = "SQLite",
            Glyph = GlyphCode,
            Description = "Query and inspect a SQLite database with natural language.",
            Command = "npx",
            Args = new List<string> { "-y", "@modelcontextprotocol/server-sqlite", "--db-path", "C:\\path\\to\\data.db" },
            Hint = "Requires Node.js (npx)",
            DocsUrl = "https://github.com/modelcontextprotocol/servers/tree/main/src/sqlite"
        },
        new McpPreset
        {
            Name = "Sequential thinking",
            Glyph = GlyphMemory,
            Description = "A scratchpad tool that helps the model work through complex, step-by-step reasoning.",
            Command = "npx",
            Args = new List<string> { "-y", "@modelcontextprotocol/server-sequential-thinking" },
            Hint = "Requires Node.js (npx)",
            DocsUrl = "https://github.com/modelcontextprotocol/servers/tree/main/src/sequentialthinking"
        }
    };
}
