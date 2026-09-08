using System.Text.Json;

namespace Casium.Core;

public sealed class PromptItem
{
    public string Id { get; set; } = Guid.NewGuid().ToString("N");
    public string Name { get; set; } = "";
    public string Content { get; set; } = "";
    public bool IsDefault { get; set; }
}

/// <summary>Library of custom system prompts ("instructions"), persisted to prompts.json.</summary>
public sealed class PromptLibrary
{
    private static readonly JsonSerializerOptions Opts = new() { WriteIndented = true };
    private string Path => System.IO.Path.Combine(AppData.Root, "prompts.json");

    public List<PromptItem> Items { get; private set; } = new();

    public PromptItem? Default =>
        Items.FirstOrDefault(p => p.IsDefault) ?? Items.FirstOrDefault();

    public void Load()
    {
        try
        {
            if (File.Exists(Path))
            {
                var items = JsonSerializer.Deserialize<List<PromptItem>>(File.ReadAllText(Path));
                if (items != null && items.Count > 0)
                {
                    Items = items;
                    if (Items.All(p => !p.IsDefault) && Items.Count > 0) Items[0].IsDefault = true;
                    return;
                }
            }
        }
        catch (Exception ex)
        {
            Log.Error(ex, "prompts load");
        }
        Items = Seed();
        Save();
    }

    public void Save()
    {
        try { File.WriteAllText(Path, JsonSerializer.Serialize(Items, Opts)); }
        catch (Exception ex) { Log.Error(ex, "prompts save"); }
    }

    public void Upsert(PromptItem item)
    {
        var existing = Items.FirstOrDefault(p => p.Id == item.Id);
        if (existing == null) Items.Add(item);
        else
        {
            existing.Name = item.Name;
            existing.Content = item.Content;
        }
        Save();
        Bus.RaisePromptsChanged();
    }

    public void Delete(string id)
    {
        var item = Items.FirstOrDefault(p => p.Id == id);
        if (item == null) return;
        Items.Remove(item);
        if (item.IsDefault && Items.Count > 0) Items[0].IsDefault = true;
        Save();
        Bus.RaisePromptsChanged();
    }

    public void SetDefault(string id)
    {
        foreach (var p in Items) p.IsDefault = p.Id == id;
        Save();
        Bus.RaisePromptsChanged();
    }

    public PromptItem Duplicate(PromptItem source) =>
        new()
        {
            Name = source.Name + " (copy)",
            Content = source.Content,
            IsDefault = false
        };

    private static List<PromptItem> Seed() => new()
    {
        new PromptItem
        {
            Name = "Balanced assistant",
            IsDefault = true,
            Content = """
                You are a helpful, knowledgeable assistant running fully locally inside the Casium desktop app.
                Be accurate and direct. If you are unsure about something, say so instead of guessing.
                Structure answers with markdown: short paragraphs, bullet lists when helpful, and fenced code
                blocks with a language tag for any code.
                """
        },
        new PromptItem
        {
            Name = "Senior .NET engineer",
            Content = """
                You are a senior .NET engineer pair-programming alongside the user, who works in Visual Studio
                on WPF and ASP.NET Core projects.
                Prefer modern C# (latest language version), target .NET 8 unless told otherwise, and follow the
                framework design guidelines. Explain trade-offs briefly, then give complete, compiling code.
                Call out common pitfalls explicitly: async void, missing ConfigureAwait in libraries, IDisposable
                leaks, event-handler leaks, WPF binding errors and dispatcher misuse.
                When reviewing code, number your findings and tag each as [blocker], [major] or [minor].
                """
        },
        new PromptItem
        {
            Name = "Code reviewer",
            Content = """
                You are a meticulous code reviewer. Review the code the user shares and respond with:
                1) A one-paragraph summary of what the code does.
                2) Findings, most severe first, each tagged [blocker], [major] or [minor], with a short fix.
                3) A note on tests: what is worth covering.
                Be concrete and cite line snippets. Do not restate the obvious unless it is a risk.
                """
        },
        new PromptItem
        {
            Name = "Concise mode",
            Content = """
                Answer as briefly as possible. Prefer a single sentence or a short list. No preamble,
                no restating the question, no closing pleasantries. Code answers: code first, at most one
                sentence of explanation after.
                """
        },
        new PromptItem
        {
            Name = "Git & GitHub helper",
            Content = """
                You are a Git and GitHub expert with access to GitHub through MCP tools.
                Write commit messages in Conventional Commits style (type(scope): summary).
                PR descriptions get a short context line, a bulleted change list and a test plan.
                When asked to touch GitHub (issues, PRs, searches), prefer using your GitHub tools over
                guessing URLs, and state exactly which tool you called and what it returned.
                """
        }
    };
}
