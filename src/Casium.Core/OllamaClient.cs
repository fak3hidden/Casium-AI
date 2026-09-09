using System.Collections.ObjectModel;
using System.Globalization;
using System.Net.Http;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;

namespace Casium.Core;

public sealed class OllamaException : Exception
{
    public OllamaException(string message) : base(message) { }
}

public sealed class OllamaModel
{
    public string Name { get; set; } = "";
    public string Model { get; set; } = "";
    public long SizeBytes { get; set; }
    public DateTime Modified { get; set; }
    public string Family { get; set; } = "";
    public string ParameterSize { get; set; } = "";
    public string Quantization { get; set; } = "";
    public string Digest { get; set; } = "";

    public string BaseName => Name.Contains(':') ? Name[..Name.IndexOf(':')] : Name;
    public double SizeGB => SizeBytes / 1024.0 / 1024 / 1024;

    /// <summary>Precomputed display strings — keeps culture/format handling out of XAML.</summary>
    public string ModifiedText =>
        Modified == default ? "" : Modified.ToString("d MMM yyyy", CultureInfo.InvariantCulture);

    public string SizeText =>
        SizeBytes <= 0 ? "" : SizeBytes.ToString("N0", CultureInfo.InvariantCulture) + " bytes on disk";

    /// <summary>Compact "8B · Q4_K_M · 4.9 GB" line for combo boxes and cards.</summary>
    public string DisplayInfo
    {
        get
        {
            var parts = new List<string>();
            if (ParameterSize.Length > 0) parts.Add(ParameterSize);
            if (Quantization.Length > 0) parts.Add(Quantization);
            if (SizeBytes > 0) parts.Add(Format.GB(SizeGB));
            return string.Join(" · ", parts);
        }
    }
}

public sealed class PullProgress
{
    public string? Status { get; set; }
    public string? Digest { get; set; }
    public long? Total { get; set; }
    public long? Completed { get; set; }
}

public sealed class ToolCallRequest
{
    public string Name { get; set; } = "";
    public JsonObject Arguments { get; set; } = new();
}

public sealed class ChatChunk
{
    public string? Content { get; set; }
    public string? Thinking { get; set; }
    public List<ToolCallRequest>? ToolCalls { get; set; }
    public bool Done { get; set; }
    public string? DoneReason { get; set; }
    public long EvalCount { get; set; }
    public long EvalDuration { get; set; }   // nanoseconds
    public long TotalDuration { get; set; }  // nanoseconds
    public long PromptEvalCount { get; set; }

    public double TokensPerSecond =>
        EvalDuration > 0 ? EvalCount / (EvalDuration / 1e9) : 0;
}

/// <summary>One turn in an Ollama chat conversation (system/user/assistant/tool).</summary>
public sealed class ChatTurn
{
    public string Role { get; set; } = "user";
    public string? Content { get; set; }
    public List<ToolCallRequest>? ToolCalls { get; set; }
    public string? ToolName { get; set; }

    public static ChatTurn System(string content) => new() { Role = "system", Content = content };
    public static ChatTurn User(string content) => new() { Role = "user", Content = content };
    public static ChatTurn Assistant(string content) => new() { Role = "assistant", Content = content };
    public static ChatTurn AssistantToolCalls(List<ToolCallRequest> calls, string? content) =>
        new() { Role = "assistant", Content = content ?? "", ToolCalls = calls };
    public static ChatTurn ToolResult(string toolName, string content) =>
        new() { Role = "tool", ToolName = toolName, Content = content };

    public JsonObject ToJson()
    {
        var o = new JsonObject { ["role"] = Role };
        if (Content != null) o["content"] = Content;
        if (ToolName != null) o["tool_name"] = ToolName;
        if (ToolCalls != null)
        {
            var arr = new JsonArray();
            foreach (var call in ToolCalls)
                arr.Add(new JsonObject
                {
                    ["function"] = new JsonObject
                    {
                        ["name"] = call.Name,
                        ["arguments"] = call.Arguments.DeepClone()
                    }
                });
            o["tool_calls"] = arr;
        }
        return o;
    }
}

public sealed class OllamaChatOptions
{
    public double Temperature { get; set; } = 0.7;
    public int NumCtx { get; set; } = 8192;
    public int NumPredict { get; set; } = -1;
}

/// <summary>HTTP client for an Ollama-compatible local engine (default http://127.0.0.1:11434).</summary>
public sealed class OllamaClient : IDisposable
{
    private readonly HttpClient _http = new(new SocketsHttpHandler { UseProxy = false })
    {
        Timeout = Timeout.InfiniteTimeSpan
    };

    public string BaseUrl { get; private set; } = "http://127.0.0.1:11434";

    public OllamaClient() { }

    public OllamaClient(string endpoint) => SetEndpoint(endpoint);

    public void SetEndpoint(string url)
    {
        var u = (url ?? "").Trim();
        if (u.Length == 0) u = "http://127.0.0.1:11434";
        if (!u.StartsWith("http://", StringComparison.OrdinalIgnoreCase) &&
            !u.StartsWith("https://", StringComparison.OrdinalIgnoreCase))
            u = "http://" + u;
        BaseUrl = u.TrimEnd('/');
    }

    public void Dispose() => _http.Dispose();

    // ---------------------------------------------------------------- liveness

    public async Task<string?> GetVersionAsync(int timeoutMs = 2500)
    {
        try
        {
            using var cts = new CancellationTokenSource(timeoutMs);
            using var resp = await _http.GetAsync(BaseUrl + "/api/version", cts.Token);
            if (!resp.IsSuccessStatusCode) return null;
            using var doc = JsonDocument.Parse(await resp.Content.ReadAsStringAsync(cts.Token));
            return doc.RootElement.TryGetProperty("version", out var v) ? v.GetString() : "";
        }
        catch
        {
            return null;
        }
    }

    // ---------------------------------------------------------------- models

    public async Task<List<OllamaModel>> ListModelsAsync()
    {
        using var resp = await _http.GetAsync(BaseUrl + "/api/tags");
        if (!resp.IsSuccessStatusCode)
            throw new OllamaException(await DescribeErrorAsync(resp));

        using var doc = JsonDocument.Parse(await resp.Content.ReadAsStringAsync());
        var models = new List<OllamaModel>();
        if (doc.RootElement.TryGetProperty("models", out var arr) && arr.ValueKind == JsonValueKind.Array)
        {
            foreach (var m in arr.EnumerateArray())
            {
                var model = new OllamaModel
                {
                    Name = GetString(m, "name") ?? "",
                    Model = GetString(m, "model") ?? "",
                    Digest = GetString(m, "digest") ?? ""
                };
                if (m.TryGetProperty("size", out var size) && size.ValueKind == JsonValueKind.Number)
                    model.SizeBytes = size.GetInt64();
                if (m.TryGetProperty("modified_at", out var mod) && mod.ValueKind == JsonValueKind.String
                    && DateTime.TryParse(mod.GetString(), out var parsed))
                    model.Modified = parsed;
                if (m.TryGetProperty("details", out var details))
                {
                    model.Family = GetString(details, "family") ?? "";
                    model.ParameterSize = GetString(details, "parameter_size") ?? "";
                    model.Quantization = GetString(details, "quantization_level") ?? "";
                }
                if (model.Name.Length > 0) models.Add(model);
            }
        }
        return models;
    }

    public async Task PullAsync(string model, IProgress<PullProgress> progress, CancellationToken ct)
    {
        var payload = new JsonObject { ["model"] = model, ["stream"] = true };
        using var resp = await PostJsonAsync("/api/pull", payload, ct, streaming: true);
        if (!resp.IsSuccessStatusCode)
            throw new OllamaException(await DescribeErrorAsync(resp));

        await ReadLinesAsync(resp, line =>
        {
            try
            {
                using var doc = JsonDocument.Parse(line);
                var p = new PullProgress();
                if (doc.RootElement.TryGetProperty("status", out var s)) p.Status = s.GetString();
                if (doc.RootElement.TryGetProperty("digest", out var d)) p.Digest = d.GetString();
                if (doc.RootElement.TryGetProperty("total", out var t) && t.ValueKind == JsonValueKind.Number) p.Total = t.GetInt64();
                if (doc.RootElement.TryGetProperty("completed", out var c) && c.ValueKind == JsonValueKind.Number) p.Completed = c.GetInt64();
                progress.Report(p);
            }
            catch
            {
                // Ignore malformed progress lines; the pull stream is best-effort.
            }
        }, ct);
    }

    public async Task DeleteModelAsync(string model)
    {
        var payload = new JsonObject { ["model"] = model };
        using var content = new StringContent(payload.ToJsonString(), Encoding.UTF8, "application/json");
        using var req = new HttpRequestMessage(HttpMethod.Delete, BaseUrl + "/api/delete") { Content = content };
        using var resp = await _http.SendAsync(req);
        if (resp.IsSuccessStatusCode) return;

        // Older engine builds use the query-string form.
        using var req2 = new HttpRequestMessage(HttpMethod.Delete,
            $"{BaseUrl}/api/delete?name={Uri.EscapeDataString(model)}");
        using var resp2 = await _http.SendAsync(req2);
        if (!resp2.IsSuccessStatusCode)
            throw new OllamaException($"Could not delete '{model}' (HTTP {(int)resp.StatusCode}).");
    }

    // ---------------------------------------------------------------- chat

    public async Task ChatStreamAsync(
        string model,
        IReadOnlyList<ChatTurn> messages,
        JsonArray? tools,
        OllamaChatOptions options,
        Action<ChatChunk> onChunk,
        CancellationToken ct)
    {
        var payload = new JsonObject
        {
            ["model"] = model,
            ["stream"] = true,
            ["messages"] = TurnsToJson(messages),
            ["options"] = new JsonObject
            {
                ["temperature"] = options.Temperature,
                ["num_ctx"] = options.NumCtx,
                ["num_predict"] = options.NumPredict
            }
        };
        if (tools is { Count: > 0 })
            payload["tools"] = tools.DeepClone();

        using var resp = await PostJsonAsync("/api/chat", payload, ct, streaming: true);
        if (!resp.IsSuccessStatusCode)
            throw new OllamaException(await DescribeErrorAsync(resp));

        var firstLine = true;
        await ReadLinesAsync(resp, line =>
        {
            if (firstLine)
            {
                firstLine = false;
                Log.Info("[chat] first stream line: " + Truncate(line, 300));
            }
            var chunk = ParseChunk(line);
            if (chunk != null) onChunk(chunk);
            else Log.Warn("[chat] unparsed stream line: " + Truncate(line, 300));
        }, ct);
    }

    private static JsonArray TurnsToJson(IReadOnlyList<ChatTurn> messages)
    {
        var arr = new JsonArray();
        foreach (var turn in messages) arr.Add(turn.ToJson());
        return arr;
    }

    private static ChatChunk? ParseChunk(string line)
    {
        try
        {
            using var doc = JsonDocument.Parse(line);
            var root = doc.RootElement;
            var chunk = new ChatChunk();

            if (root.TryGetProperty("message", out var msg))
            {
                if (msg.TryGetProperty("content", out var c) && c.ValueKind == JsonValueKind.String)
                    chunk.Content = c.GetString();
                if (msg.TryGetProperty("thinking", out var th) && th.ValueKind == JsonValueKind.String)
                    chunk.Thinking = th.GetString();
                if (msg.TryGetProperty("tool_calls", out var tcs) && tcs.ValueKind == JsonValueKind.Array)
                {
                    var calls = new List<ToolCallRequest>();
                    foreach (var tc in tcs.EnumerateArray())
                    {
                        if (!tc.TryGetProperty("function", out var fn)) continue;
                        var name = fn.TryGetProperty("name", out var n) ? n.GetString() : null;
                        if (string.IsNullOrEmpty(name)) continue;

                        JsonObject args = new();
                        if (fn.TryGetProperty("arguments", out var a))
                        {
                            if (a.ValueKind == JsonValueKind.Object)
                                args = JsonNode.Parse(a.GetRawText()) as JsonObject ?? new JsonObject();
                            else if (a.ValueKind == JsonValueKind.String &&
                                     a.GetString() is string s &&
                                     s.TrimStart().StartsWith('{'))
                                args = JsonNode.Parse(s) as JsonObject ?? new JsonObject();
                        }
                        calls.Add(new ToolCallRequest { Name = name!, Arguments = args });
                    }
                    if (calls.Count > 0) chunk.ToolCalls = calls;
                }
            }

            if (root.TryGetProperty("done", out var done) && done.ValueKind == JsonValueKind.True)
                chunk.Done = true;
            if (root.TryGetProperty("done_reason", out var dr) && dr.ValueKind == JsonValueKind.String)
                chunk.DoneReason = dr.GetString();
            if (root.TryGetProperty("eval_count", out var ec) && ec.ValueKind == JsonValueKind.Number) chunk.EvalCount = ec.GetInt64();
            if (root.TryGetProperty("eval_duration", out var ed) && ed.ValueKind == JsonValueKind.Number) chunk.EvalDuration = ed.GetInt64();
            if (root.TryGetProperty("total_duration", out var td) && td.ValueKind == JsonValueKind.Number) chunk.TotalDuration = td.GetInt64();
            if (root.TryGetProperty("prompt_eval_count", out var pc) && pc.ValueKind == JsonValueKind.Number) chunk.PromptEvalCount = pc.GetInt64();

            return chunk;
        }
        catch
        {
            return null;
        }
    }

    // ---------------------------------------------------------------- plumbing

    private async Task<HttpResponseMessage> PostJsonAsync(string path, JsonNode payload, CancellationToken ct, bool streaming = false)
    {
        using var content = new StringContent(payload.ToJsonString(), Encoding.UTF8, "application/json");
        if (!streaming)
            return await _http.PostAsync(BaseUrl + path, content, ct);

        // Streaming reads need ResponseHeadersRead, which PostAsync can't take —
        // go through SendAsync with an explicit request message instead.
        using var req = new HttpRequestMessage(HttpMethod.Post, BaseUrl + path) { Content = content };
        return await _http.SendAsync(req, HttpCompletionOption.ResponseHeadersRead, ct);
    }

    private static string Truncate(string s, int max) =>
        s.Length <= max ? s : s[..max] + "…";

    private static async Task ReadLinesAsync(HttpResponseMessage resp, Action<string> onLine, CancellationToken ct)
    {
        using var stream = await resp.Content.ReadAsStreamAsync(ct);
        using var reader = new StreamReader(stream, Encoding.UTF8);
        while (true)
        {
            ct.ThrowIfCancellationRequested();
            var line = await reader.ReadLineAsync(ct);
            if (line == null) break;
            if (line.Trim().Length == 0) continue;
            onLine(line);
        }
    }

    private static async Task<string> DescribeErrorAsync(HttpResponseMessage resp)
    {
        try
        {
            var body = await resp.Content.ReadAsStringAsync();
            try
            {
                using var doc = JsonDocument.Parse(body);
                if (doc.RootElement.TryGetProperty("error", out var e) && e.ValueKind == JsonValueKind.String)
                    return e.GetString() ?? $"HTTP {(int)resp.StatusCode}";
            }
            catch { }
            return body.Length > 300 ? body[..300] : body;
        }
        catch
        {
            return $"HTTP {(int)resp.StatusCode}";
        }
    }

    private static string? GetString(JsonElement parent, string property) =>
        parent.TryGetProperty(property, out var v) && v.ValueKind == JsonValueKind.String ? v.GetString() : null;
}
