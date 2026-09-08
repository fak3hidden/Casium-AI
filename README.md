<div align="center">

<img src="src/Casium/Assets/logo.png" width="88" alt="Casium logo"/>

# Casium

**A local AI studio for Windows — chat, models and real tool-calling, all on your machine.**

WPF · .NET 8 · zero NuGet dependencies · no telemetry

</div>

---

Casium turns a plain Ollama install into a polished desktop studio:

- **Chat** with any local model — streaming responses, markdown + code rendering with copy buttons, regenerate, per-message speed stats, custom system prompts.
- **Browse models** with a built-in *can-I-run-it* engine — it scans your actual CPU, RAM and GPU (including VRAM from `nvidia-smi` / the registry) and tells you, per model size, whether it will fly, chug or not fit, with a predicted tokens/sec and a RAM/VRAM budget bar. 21 curated model families (Llama 3.x, Qwen 3, DeepSeek-R1, GPT-OSS, Gemma 3, Phi-4, Mistral, Codestral, …), or pull any tag from the Ollama library.
- **Connections (MCP)** — connect models to the world through local [Model Context Protocol](https://modelcontextprotocol.io) servers: your **project folders / Visual Studio solutions**, **GitHub**, web fetch, search, browser automation, SQLite, memory and more. One-click presets, per-server enable switches, live tool counts. Models call tools mid-conversation; results stream back into the chat.
- **Local models** — download with progress, delete, chat-with-one-click, see disk usage.
- **Prompts** — reusable system prompts ("personas") with a default for new chats.
- **Settings** — engine endpoint + auto-start, temperature, context window, tool loop depth, tool on/off, Midnight/Daylight themes with four accents, and a hardware report you can copy.

Everything runs locally: chat goes to `http://127.0.0.1:11434` (Ollama), MCP servers run as local child processes over stdio. There is no cloud component and nothing is collected.

---

## Getting started

### 1. Install the engine

Casium drives models through [Ollama](https://ollama.com) — the free, open-source local runtime:

1. Download and install from <https://ollama.com/download> (or `winget install Ollama.Ollama`).
2. Run Casium. It detects the engine automatically (Settings → *Inference engine* if you use a custom host or port). Casium can also start the engine for you when it isn't running.

### 2. Build from source

Requires the **.NET 8 SDK** (Windows, for the desktop app):

```powershell
git clone https://github.com/fak3hidden/Casium-AI.git
cd Casium-AI
dotnet build Casium.sln -c Release
dotnet run --project src/Casium -c Release
```

To produce a distributable folder:

```powershell
dotnet publish src/Casium -c Release -r win-x64 --self-contained false -o publish
```

There are **no NuGet packages** — the entire app (WPF UI, HTTP client, MCP client, JSON, markdown renderer, hardware probe) is hand-written against the .NET BCL.

### 3. Get a model

Open **Browse models**, pick a family, and check the compatibility panel — it will highlight which sizes fit your hardware. Hit **Download**. Small, useful starting points: `llama3.2:3b`, `qwen3:4b`, or `gpt-oss:20b` on GPUs with ≥ 16 GB VRAM.

### 4. Give it superpowers (optional)

Open **Connections** and add servers from the presets:

| Preset | What the model can do |
| --- | --- |
| **Project folder** | Read/search the source code of any folder you pick (great with Visual Studio solutions) |
| **GitHub (community)** | Manage repos, issues and PRs via a personal access token |
| **Web fetch** | Read pages and URLs you mention |
| **Brave Search** | Live web search (API key required) |
| **SQLite** | Query a local database |
| **Puppeteer** | Drive a real browser |
| **Memory** | Persistent notes across chats |

Then toggle **MCP tools in chat** in Settings (on by default). When a server needs credentials (e.g. `GITHUB_PERSONAL_ACCESS_TOKEN`), the editor shows an environment-variable box — values stay in `mcp.json` on your disk.

> Most presets launch through `npx`, which comes with [Node.js](https://nodejs.org). The official GitHub server uses Docker.

## Keyboard

| Keys | Action |
| --- | --- |
| `Enter` / `Shift+Enter` | Send / newline |
| `Ctrl+1` … `Ctrl+6` | Switch pages |
| Drag title bar | Move window (custom chrome) |

## Where things live

| Path | Contents |
| --- | --- |
| `%AppData%\Casium\settings.json` | App settings |
| `%AppData%\Casium\prompts.json` | Custom system prompts |
| `%AppData%\Casium\mcp.json` | MCP server config (Claude Desktop-compatible format) |
| `%AppData%\Casium\logs\casium.log` | Rotating log |
| Ollama's own model dir | Downloaded model weights |

## Project layout

```
src/
  Casium.Core/         UI-agnostic core (no WPF references)
    OllamaClient       /api/chat streaming + tool calls, /api/pull, /api/tags, /api/delete
    EngineMonitor      online/offline watch, auto-start, model list cache
    PullManager        concurrent download jobs with layer-level progress
    McpClient          MCP stdio transport (JSON-RPC 2.0 over the child process)
    McpManager         mcp.json persistence, connection pool, tool surface for Ollama
    McpPresets         curated one-click servers
    Hardware           CPU/RAM/GPU detection (nvidia-smi + registry, VRAM-aware)
    Compatibility      "can I run it" engine: VRAM/RAM budgets, run mode, tok/s estimate
    ModelCatalog       curated catalog of families, sizes and quantizations
    Markdown           tiny markdown parser for chat rendering
    Bus, Log, Settings, Prompts, Format, ArgsParser, AppServices
  Casium/              WPF app
    Themes/            2 palettes × 4 accents, complete control style library
    Shell/             custom-chrome main window + sidebar navigation
    Views/             Chat, Browse, Local models, Prompts, Connections, Settings
    Controls/          Pill, UsageBar, MarkdownTextBlock
    Dialogs/           server editor, prompt editor, confirm
```

## Notes

- Compatibility estimates assume Q4_K_M quantization and an 8k context window; treat them as guidance, not benchmarks.
- Casium is an independent project and is not affiliated with Ollama, Anthropic or the MCP project.

## License

MIT — see [LICENSE](LICENSE).
