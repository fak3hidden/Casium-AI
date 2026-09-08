using System.Diagnostics;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;

namespace Casium.Core;

public sealed class McpException : Exception
{
    public McpException(string message) : base(message) { }
}

public sealed class McpTool
{
    public string Name { get; }
    public string Description { get; }
    public JsonObject InputSchema { get; }

    public McpTool(string name, string description, JsonObject inputSchema)
    {
        Name = name;
        Description = description;
        InputSchema = inputSchema;
    }
}

public sealed class McpToolResult
{
    public string Text { get; }

    public McpToolResult(string text) => Text = text;
}

/// <summary>One configured MCP server (persisted in mcp.json, Claude-Desktop compatible).</summary>
public sealed class McpServerConfig
{
    public string Name { get; set; } = "";
    public string Command { get; set; } = "";
    public List<string> Args { get; set; } = new();
    public Dictionary<string, string> Env { get; set; } = new();
    public bool Enabled { get; set; } = true;

    public string DisplayCommand =>
        Command + (Args.Count > 0 ? " " + string.Join(" ", Args) : "");
}

/// <summary>
/// MCP client over the stdio transport: launches the server as a child process and
/// speaks newline-delimited JSON-RPC 2.0 (initialize / tools/list / tools/call).
/// </summary>
public sealed class McpClient : IDisposable
{
    private readonly Process _process;
    private readonly StreamWriter _stdin;
    private readonly StreamReader _stdout;
    private readonly Dictionary<long, TaskCompletionSource<JsonElement>> _pending = new();
    private readonly object _gate = new();
    private readonly StringBuilder _stderr = new();
    private long _nextId;

    private McpClient(Process process)
    {
        _process = process;
        _stdin = process.StandardInput;
        _stdout = process.StandardOutput;
        _stdin.AutoFlush = true;
    }

    public string ServerInfo { get; private set; } = "";
    public List<McpTool> Tools { get; private set; } = new();
    public bool IsAlive => !_process.HasExited;
    public string StderrTail
    {
        get { lock (_gate) { return _stderr.ToString(); } }
    }

    // ---------------------------------------------------------------- lifecycle

    public static async Task<McpClient> StartAsync(McpServerConfig config, int initTimeoutMs = 20000)
    {
        var psi = BuildProcessStart(config);
        Process process;
        try
        {
            process = Process.Start(psi)
                ?? throw new McpException($"Could not start '{config.Command}'.");
        }
        catch (Exception ex)
        {
            throw new McpException($"Could not start '{config.Command}': {ex.Message}");
        }

        var client = new McpClient(process);
        client.BeginReadStdout();
        client.BeginReadStderr();

        try
        {
            var initParams = new JsonObject
            {
                ["protocolVersion"] = "2024-11-05",
                ["capabilities"] = new JsonObject
                {
                    ["roots"] = new JsonObject { ["listChanged"] = false }
                },
                ["clientInfo"] = new JsonObject
                {
                    ["name"] = "Casium",
                    ["version"] = "1.0.0"
                }
            };
            var result = await client.RequestAsync("initialize", initParams, initTimeoutMs);
            if (result.ValueKind == JsonValueKind.Object &&
                result.TryGetProperty("serverInfo", out var serverInfo) &&
                serverInfo.ValueKind == JsonValueKind.Object &&
                serverInfo.TryGetProperty("name", out var sn))
            {
                client.ServerInfo = sn.GetString() ?? "";
            }
            client.Notify("notifications/initialized");
            return client;
        }
        catch
        {
            client.Dispose();
            throw;
        }
    }

    public void Dispose()
    {
        try
        {
            if (!_process.HasExited)
            {
                _stdin.Close();
                if (!_process.WaitForExit(2000))
                    _process.Kill(entireProcessTree: true);
            }
        }
        catch { }
        try { _process.Dispose(); } catch { }
        FailPending("MCP server closed.");
    }

    // ---------------------------------------------------------------- protocol

    public async Task<List<McpTool>> ListToolsAsync(int timeoutMs = 20000)
    {
        var result = await RequestAsync("tools/list", new JsonObject(), timeoutMs);
        var tools = new List<McpTool>();
        if (result.ValueKind == JsonValueKind.Object &&
            result.TryGetProperty("tools", out var arr) &&
            arr.ValueKind == JsonValueKind.Array)
        {
            foreach (var t in arr.EnumerateArray())
            {
                var name = t.TryGetProperty("name", out var n) ? n.GetString() : null;
                if (string.IsNullOrEmpty(name)) continue;
                var description = t.TryGetProperty("description", out var d) && d.ValueKind == JsonValueKind.String
                    ? d.GetString() ?? ""
                    : "";
                var schema = t.TryGetProperty("inputSchema", out var s)
                    ? JsonNode.Parse(s.GetRawText()) as JsonObject ?? new JsonObject()
                    : new JsonObject();
                tools.Add(new McpTool(name!, description, schema));
            }
        }
        Tools = tools;
        return tools;
    }

    public async Task<McpToolResult> CallToolAsync(string toolName, JsonObject arguments, int timeoutMs = 120000)
    {
        var parameters = new JsonObject
        {
            ["name"] = toolName,
            ["arguments"] = arguments.DeepClone()
        };
        var result = await RequestAsync("tools/call", parameters, timeoutMs);

        var text = new StringBuilder();
        var isError = false;
        if (result.ValueKind == JsonValueKind.Object)
        {
            if (result.TryGetProperty("isError", out var ie) && ie.ValueKind == JsonValueKind.True)
                isError = true;
            if (result.TryGetProperty("content", out var content) && content.ValueKind == JsonValueKind.Array)
            {
                foreach (var item in content.EnumerateArray())
                {
                    if (item.TryGetProperty("type", out var type) &&
                        type.ValueKind == JsonValueKind.String &&
                        type.GetString() == "text" &&
                        item.TryGetProperty("text", out var tx) &&
                        tx.ValueKind == JsonValueKind.String)
                    {
                        text.AppendLine(tx.GetString());
                    }
                }
            }
        }

        var output = text.ToString().Trim();
        if (isError)
            throw new McpException(output.Length > 0 ? output : $"Tool '{toolName}' reported an error.");
        return new McpToolResult(output.Length > 0 ? output : "(no output)");
    }

    private async Task<JsonElement> RequestAsync(string method, JsonNode? parameters, int timeoutMs)
    {
        var id = Interlocked.Increment(ref _nextId);
        var tcs = new TaskCompletionSource<JsonElement>(TaskCreationOptions.RunContinuationsAsynchronously);
        lock (_gate) { _pending[id] = tcs; }

        var message = new JsonObject
        {
            ["jsonrpc"] = "2.0",
            ["id"] = id,
            ["method"] = method
        };
        if (parameters != null) message["params"] = parameters;

        WriteLine(message.ToJsonString());

        using var cts = new CancellationTokenSource(timeoutMs);
        using var registration = cts.Token.Register(() =>
            tcs.TrySetException(new TimeoutException(
                $"'{_process.StartInfo.FileName}' did not respond to '{method}' within {timeoutMs / 1000.0:F0}s.")));

        try
        {
            return await tcs.Task;
        }
        finally
        {
            lock (_gate) { _pending.Remove(id); }
        }
    }

    private void Notify(string method)
    {
        var message = new JsonObject
        {
            ["jsonrpc"] = "2.0",
            ["method"] = method
        };
        WriteLine(message.ToJsonString());
    }

    private void WriteLine(string line)
    {
        try { _stdin.WriteLine(line); }
        catch (Exception ex)
        {
            throw new McpException("MCP server closed its input: " + ex.Message);
        }
    }

    // ---------------------------------------------------------------- read loops

    private void BeginReadStdout()
    {
        _ = Task.Run(async () =>
        {
            try
            {
                while (true)
                {
                    var line = await _stdout.ReadLineAsync();
                    if (line == null) break;
                    line = line.Trim();
                    if (line.Length == 0 || line[0] != '{') continue;
                    HandleLine(line);
                }
            }
            catch { }
            FailPending("MCP server closed.");
        });
    }

    private void HandleLine(string line)
    {
        JsonDocument doc;
        try { doc = JsonDocument.Parse(line); }
        catch { return; }

        using (doc)
        {
            var root = doc.RootElement;
            var hasId = root.TryGetProperty("id", out var idEl);
            var hasMethod = root.TryGetProperty("method", out var methodEl);

            if (hasId && hasMethod)
            {
                // A request from the server to us. We don't implement any server-facing
                // methods, so respond with a JSON-RPC "method not found" error.
                var id = idEl.ValueKind == JsonValueKind.Number ? idEl.GetInt64()
                    : idEl.ValueKind == JsonValueKind.String && long.TryParse(idEl.GetString(), out var s) ? s
                    : -1;
                if (id >= 0)
                {
                    var reply = new JsonObject
                    {
                        ["jsonrpc"] = "2.0",
                        ["id"] = id,
                        ["error"] = new JsonObject
                        {
                            ["code"] = -32601,
                            ["message"] = "Method not supported by Casium client"
                        }
                    };
                    try { _stdin.WriteLine(reply.ToJsonString()); } catch { }
                }
                return;
            }

            if (hasId)
            {
                var id = idEl.ValueKind == JsonValueKind.Number ? idEl.GetInt64()
                    : idEl.ValueKind == JsonValueKind.String && long.TryParse(idEl.GetString(), out var s) ? s
                    : -1;
                if (id < 0) return;

                TaskCompletionSource<JsonElement>? tcs = null;
                lock (_gate) { _pending.TryGetValue(id, out tcs); }
                if (tcs == null) return;

                if (root.TryGetProperty("error", out var error))
                {
                    var message = error.TryGetProperty("message", out var m) && m.ValueKind == JsonValueKind.String
                        ? m.GetString()
                        : "MCP error";
                    tcs.TrySetException(new McpException(message ?? "MCP error"));
                }
                else if (root.TryGetProperty("result", out var result))
                {
                    tcs.TrySetResult(result.Clone());
                }
                else
                {
                    tcs.TrySetException(new McpException("Malformed MCP response."));
                }
            }
            // Notifications from the server (progress, logging) are ignored for now.
        }
    }

    private void BeginReadStderr()
    {
        _ = Task.Run(async () =>
        {
            try
            {
                while (true)
                {
                    var line = await _process.StandardError.ReadLineAsync();
                    if (line == null) break;
                    lock (_gate)
                    {
                        if (_stderr.Length > 4000) _stderr.Clear();
                        _stderr.AppendLine(line);
                    }
                }
            }
            catch { }
        });
    }

    private void FailPending(string reason)
    {
        lock (_gate)
        {
            foreach (var tcs in _pending.Values)
                tcs.TrySetException(new McpException(reason));
            _pending.Clear();
        }
    }

    // ---------------------------------------------------------------- process plumbing

    private static ProcessStartInfo BuildProcessStart(McpServerConfig config)
    {
        var command = config.Command.Trim();
        var args = string.Join(" ", config.Args.Select(Quote));

        var resolved = ResolveExecutable(command);
        var fileName = resolved ?? command;
        var arguments = args;

        // Batch/cmd shims (npx, npm …) must be launched through cmd.exe.
        if (resolved != null &&
            (resolved.EndsWith(".cmd", StringComparison.OrdinalIgnoreCase) ||
             resolved.EndsWith(".bat", StringComparison.OrdinalIgnoreCase)))
        {
            fileName = "cmd.exe";
            arguments = "/c \"\"" + resolved + "\" " + args + "\"";
        }

        var psi = new ProcessStartInfo
        {
            FileName = fileName,
            Arguments = arguments,
            UseShellExecute = false,
            CreateNoWindow = true,
            RedirectStandardInput = true,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            StandardOutputEncoding = Encoding.UTF8,
            StandardErrorEncoding = Encoding.UTF8,
            StandardInputEncoding = Encoding.UTF8
        };
        foreach (var (key, value) in config.Env)
        {
            if (string.IsNullOrWhiteSpace(key)) continue;
            psi.EnvironmentVariables[key] = value;
        }
        return psi;
    }

    private static string Quote(string arg)
    {
        if (arg.Length == 0 || arg.Contains(' ')) return "\"" + arg + "\"";
        return arg;
    }

    /// <summary>Resolves a bare command to a full path on PATH, checking .exe/.cmd/.bat extensions.</summary>
    internal static string? ResolveExecutable(string command)
    {
        if (command.Length == 0) return null;
        if (command.Contains('\\') || command.Contains('/'))
            return File.Exists(command) ? command : null;

        var pathEnv = Environment.GetEnvironmentVariable("PATH") ?? "";
        var extensions = OperatingSystem.IsWindows()
            ? new[] { "", ".exe", ".cmd", ".bat" }
            : new[] { "" };

        foreach (var dir in pathEnv.Split(Path.PathSeparator))
        {
            if (string.IsNullOrWhiteSpace(dir)) continue;
            foreach (var ext in extensions)
            {
                try
                {
                    var candidate = Path.Combine(dir.Trim('"'), command + ext);
                    if (File.Exists(candidate)) return candidate;
                }
                catch { }
            }
        }
        return null;
    }
}
