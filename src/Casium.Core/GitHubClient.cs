using System.Net.Http;
using System.Text.Json;

namespace Casium.Core;

public sealed class GitHubUser
{
    public string Login { get; set; } = "";
    public string Name { get; set; } = "";
    public string AvatarUrl { get; set; } = "";
}

/// <summary>
/// Minimal GitHub REST access used to verify a personal access token and show
/// "connected as @user" — the same trust flow OAuth dialogs give you, without
/// needing a registered OAuth app. Only the /user endpoint is used.
/// </summary>
public static class GitHubClient
{
    /// <summary>Page that pre-fills a classic token with the scopes the GitHub MCP server needs.</summary>
    public const string NewTokenUrl =
        "https://github.com/settings/tokens/new?scopes=repo,read:org&description=Casium";

    public static async Task<GitHubUser?> ValidateTokenAsync(string token)
    {
        if (string.IsNullOrWhiteSpace(token)) return null;
        token = token.Trim();

        try
        {
            using var http = new HttpClient(new SocketsHttpHandler { UseProxy = false })
            {
                Timeout = TimeSpan.FromSeconds(15)
            };
            using var req = new HttpRequestMessage(HttpMethod.Get, "https://api.github.com/user");
            req.Headers.TryAddWithoutValidation("User-Agent", "Casium");
            req.Headers.TryAddWithoutValidation("Authorization", "Bearer " + token);
            req.Headers.TryAddWithoutValidation("Accept", "application/vnd.github+json");

            using var resp = await http.SendAsync(req);
            if (!resp.IsSuccessStatusCode)
            {
                if ((int)resp.StatusCode == 401)
                    throw new OllamaException("GitHub rejected that token — check it was copied whole and isn't expired.");
                throw new OllamaException($"GitHub answered HTTP {(int)resp.StatusCode} — try again in a moment.");
            }

            using var doc = JsonDocument.Parse(await resp.Content.ReadAsStringAsync());
            var root = doc.RootElement;
            return new GitHubUser
            {
                Login = root.TryGetProperty("login", out var l) ? l.GetString() ?? "" : "",
                Name = root.TryGetProperty("name", out var n) ? n.GetString() ?? "" : "",
                AvatarUrl = root.TryGetProperty("avatar_url", out var a) ? a.GetString() ?? "" : ""
            };
        }
        catch (OllamaException)
        {
            throw;
        }
        catch (Exception ex)
        {
            throw new OllamaException("Couldn't reach github.com — check your internet connection. (" + ex.Message + ")");
        }
    }
}
