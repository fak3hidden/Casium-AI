using System.Text.Json;
using System.Text.Json.Nodes;

namespace Casium.Core;

/// <summary>Immutable snapshot describing the tool surface available to a chat.</summary>
public sealed class McpToolSurface
{
    public List<JsonObject> OllamaTools { get; init; } = new();
    public List<string> Warnings { get; init; } = new();
    public int ServerCount { get; init; }
    public int ToolCount => OllamaTools.Count;
}

/// <summary>
/// Manages the MCP server collection: persistence (mcp.json, Claude-Desktop compatible),
/// connection lifecycle, tool discovery and dispatch.
/// </summary>
public sealed class McpManager
{
    private readonly Dictionary<string, McpClient> _clients = new(StringComparer.OrdinalIgnoreCase);
    private readonly Dictionary<string, string> _toolOwner = new(StringComparer.OrdinalIgnoreCase);
    private readonly object _gate = new();

    public List<McpServerConfig> Servers { get; private set; } = new();

    public string ConfigPath => Path.Combine(AppData.Root, "mcp.json");

    private static readonly JsonSerializerOptions Opts = new() { WriteIndented = true };

    // ---------------------------------------------------------------- persistence

    public void Load()
    {
        try
        {
            if (!File.Exists(ConfigPath)) return;
            using var doc = JsonDocument.Parse(File.ReadAllText(ConfigPath));
            if (!doc.RootElement.TryGetProperty("mcpServers", out var servers) ||
                servers.ValueKind != JsonValueKind.Object) return;

            var list = new List<McpServerConfig>();
            foreach (var entry in servers.EnumerateObject())
            {
                var cfg = new McpServerConfig { Name = entry.Name };
                var v = entry.Value;
                if (v.TryGetProperty("command", out var cmd) && cmd.ValueKind == JsonValueKind.String)
                    cfg.Command = cmd.GetString() ?? "";
                if (v.TryGetProperty("args", out var args) && args.ValueKind == JsonValueKind.Array)
                    foreach (var a in args.EnumerateArray())
                        if (a.ValueKind == JsonValueKind.String) cfg.Args.Add(a.GetString() ?? "");
                if (v.TryGetProperty("env", out var env) && env.ValueKind == JsonValueKind.Object)
                    foreach (var e in env.EnumerateObject())
                        cfg.Env[e.Name] = e.Value.GetString() ?? "";
                if (v.TryGetProperty("enabled", out var en) && en.ValueKind == JsonValueKind.True)
                    cfg.Enabled = true;
                else if (v.TryGetProperty("enabled", out var en2) && en2.ValueKind == JsonValueKind.False)
                    cfg.Enabled = false;
                if (cfg.Command.Length > 0) list.Add(cfg);
            }
            Servers = list;
        }
        catch (Exception ex)
        {
            Log.Error(ex, "mcp load");
        }
    }

    public void Save()
    {
        try
        {
            var root = new JsonObject();
            foreach (var server in Servers)
            {
                var node = new JsonObject { ["command"] = server.Command };
                if (server.Args.Count > 0)
                {
                    var arr = new JsonArray();
                    foreach (var a in server.Args) arr.Add(a);
                    node["args"] = arr;
                }
                if (server.Env.Count > 0)
                {
                    var env = new JsonObject();
                    foreach (var (key, value) in server.Env) env[key] = value;
                    node["env"] = env;
                }
                node["enabled"] = server.Enabled;
                root[server.Name] = node;
            }
            File.WriteAllText(ConfigPath,
                new JsonObject { ["mcpServers"] = root }.ToJsonString(Opts));
        }
        catch (Exception ex)
        {
            Log.Error(ex, "mcp save");
        }
    }

    // ---------------------------------------------------------------- CRUD

    public void Upsert(McpServerConfig config)
    {
        var existing = Servers.FirstOrDefault(s => s.Name.Equals(config.Name, StringComparison.OrdinalIgnoreCase));
        if (existing != null)
        {
            Disconnect(existing.Name);
            Servers.Remove(existing);
        }
        Servers.Add(config);
        Save();
        Bus.RaiseMcpChanged();
    }

    public bool Delete(string name)
    {
        var server = Servers.FirstOrDefault(s => s.Name.Equals(name, StringComparison.OrdinalIgnoreCase));
        if (server == null) return false;
        Disconnect(server.Name);
        Servers.Remove(server);
        Save();
        Bus.RaiseMcpChanged();
        return true;
    }

    public void SetEnabled(string name, bool enabled)
    {
        var server = Servers.FirstOrDefault(s => s.Name.Equals(name, StringComparison.OrdinalIgnoreCase));
        if (server == null) return;
        server.Enabled = enabled;
        if (!enabled) Disconnect(name);
        Save();
        Bus.RaiseMcpChanged();
    }

    public McpServerConfig? Find(string name) =>
        Servers.FirstOrDefault(s => s.Name.Equals(name, StringComparison.OrdinalIgnoreCase));

    // ---------------------------------------------------------------- connections

    public bool IsConnected(string name)
    {
        lock (_gate)
        {
            return _clients.TryGetValue(name, out var client) && client.IsAlive;
        }
    }

    public McpClient? GetClient(string name)
    {
        lock (_gate)
        {
            return _clients.TryGetValue(name, out var client) && client.IsAlive ? client : null;
        }
    }

    public int ConnectedToolCount()
    {
        lock (_gate)
        {
            return _clients.Values.Where(c => c.IsAlive).Sum(c => c.Tools.Count);
        }
    }

    public async Task<McpClient> ConnectAsync(McpServerConfig config)
    {
        lock (_gate)
        {
            if (_clients.TryGetValue(config.Name, out var existing) && existing.IsAlive)
                return existing;
        }

        var client = await McpClient.StartAsync(config);
        try
        {
            await client.ListToolsAsync();
        }
        catch
        {
            client.Dispose();
            throw;
        }

        lock (_gate)
        {
            _clients[config.Name] = client;
        }
        RebuildToolIndex();
        Bus.RaiseMcpChanged();
        return client;
    }

    public void Disconnect(string name)
    {
        McpClient? removed = null;
        lock (_gate)
        {
            if (_clients.Remove(name, out removed))
                removed?.Dispose();
        }
        if (removed != null)
        {
            RebuildToolIndex();
            Bus.RaiseMcpChanged();
        }
    }

    public void DisconnectAll()
    {
        List<McpClient> toDispose;
        lock (_gate)
        {
            toDispose = _clients.Values.ToList();
            _clients.Clear();
        }
        foreach (var client in toDispose) client.Dispose();
        lock (_gate) { _toolOwner.Clear(); }
    }

    /// <summary>
    /// Makes sure every enabled server is connected; returns warnings for the ones
    /// that failed. Cheap call when everything is already up.
    /// </summary>
    public async Task<McpToolSurface> EnsureToolSurfaceAsync()
    {
        var failures = new List<string>();
        var enabledServers = Servers.Where(s => s.Enabled).ToList();

        foreach (var server in enabledServers)
        {
            if (IsConnected(server.Name)) continue;
            try
            {
                await ConnectAsync(server);
            }
            catch (Exception ex)
            {
                failures.Add($"{server.Name}: {ex.Message}");
            }
        }

        var tools = new List<JsonObject>();
        var connected = 0;
        foreach (var server in enabledServers)
        {
            var client = GetClient(server.Name);
            if (client == null) continue;
            connected++;
            foreach (var tool in client.Tools)
            {
                tools.Add(new JsonObject
                {
                    ["type"] = "function",
                    ["function"] = new JsonObject
                    {
                        ["name"] = tool.Name,
                        ["description"] = tool.Description.Length > 0
                            ? $"[{server.Name}] {tool.Description}"
                            : $"[{server.Name}] MCP tool {tool.Name}",
                        ["parameters"] = tool.InputSchema.DeepClone()
                    }
                });
            }
        }

        var warnings2 = new List<string>();
        foreach (var failure in failures) warnings2.Add(failure);
        return new McpToolSurface
        {
            OllamaTools = tools,
            Warnings = warnings2,
            ServerCount = connected
        };
    }

    public string? GetServerForTool(string toolName)
    {
        lock (_gate)
        {
            return _toolOwner.TryGetValue(toolName, out var owner) ? owner : null;
        }
    }

    public async Task<McpToolResult> CallToolAsync(string toolName, JsonObject arguments, CancellationToken ct)
    {
        string owner;
        lock (_gate)
        {
            if (!_toolOwner.TryGetValue(toolName, out owner!))
                throw new McpException($"No connected MCP server provides a tool named '{toolName}'.");
        }

        var client = GetClient(owner) ?? throw new McpException($"MCP server '{owner}' is no longer connected.");

        using var cts = CancellationTokenSource.CreateLinkedTokenSource(ct);
        cts.CancelAfter(TimeSpan.FromMinutes(3));
        var result = await client.CallToolAsync(toolName, arguments);
        return result;
    }

    private void RebuildToolIndex()
    {
        lock (_gate)
        {
            _toolOwner.Clear();
            foreach (var (name, client) in _clients)
            {
                if (!client.IsAlive) continue;
                foreach (var tool in client.Tools)
                {
                    if (!_toolOwner.ContainsKey(tool.Name))
                        _toolOwner[tool.Name] = name;
                    else
                        Log.Warn($"Duplicate MCP tool '{tool.Name}' from server '{name}' ignored.");
                }
            }
        }
    }
}
