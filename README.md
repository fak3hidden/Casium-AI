# Casium AI

Local AI manager. Pulls and runs models through Ollama, connects MCP apps
(GitHub, filesystem, fetch, ...) so the AI can actually do things, and manages
skills - instruction packs the AI follows. Everything stays on your machine.

Styled like a proper desktop app (LM Studio vibes): icon rail on the left,
Chat / My Models / MCP Apps / Skills / Settings, dark theme by default.

## Run it

```
python3 server.py
```

Windows: double-click `run.bat`. No pip packages, no node install for the app
itself. The UI opens at http://localhost:8787 (set `CASIUM_PORT` to change it).

Requirements:
- Python 3.9+
- [Ollama](https://ollama.com) for models and chat. If it's not running the app
  shows you exactly what to do, and the **Start Ollama** button (bottom bar or
  Settings) launches `ollama serve` for you.

## What it does

- **Chat** - sessions in the left panel, one active conversation, streamed from
  the model you picked. The gear opens Model Settings: system prompt,
  temperature, max response length. MCP and Skills chips in the composer
  control what the AI can touch per chat.
- **My Models** - LM Studio-style list + detail pane. Type a name
  (llama3.2, qwen3:4b, mistral-nemo, gemma3...) and press Enter to pull it,
  with progress. Or just ask the AI: "download qwen3:4b for me".
- **MCP Apps** - add a server (name, command, args, env), start/stop it.
  The app speaks MCP JSON-RPC over stdio and the AI calls the server's tools
  in chat - tool activity shows up as chips in the conversation.
  Presets: GitHub, Filesystem, Fetch, Time.
- **Skills** - folders with a `SKILL.md`. Install a whole pack with one prompt:

  ```
  Install this skill for me https://github.com/nvidia/skills
  ```

  It clones the repo, finds every SKILL.md and installs each one. The AI also
  has an `install_skill` tool, so other phrasings work when a model with
  function calling is selected.
- **Settings** - theme (Dark / Paper / Nord), Ollama host, MCP timeout, data dir.

## Skills format

A skill is a folder:

```
my-skill/
  SKILL.md        <- frontmatter (name, description) + markdown instructions
  scripts/...     <- anything else it needs
```

```markdown
---
name: my-skill
description: What it does, one line. Used when ...
---
Instructions the AI follows...
```

Installed skills live in `~/.casium-ai/skills`.

## MCP example (GitHub)

1. MCP Apps → Add App → preset **GitHub**
2. Paste a token into `GITHUB_PERSONAL_ACCESS_TOKEN` (a fine-grained token
   with contents + issues on the repos you care about is enough)
3. It starts via `npx -y @modelcontextprotocol/server-github` - needs Node.js
   (the uvx presets need [uv](https://docs.astral.sh/uv/) instead)

Once it's running its tools are live in chat: "create an issue on my repo
called x", "list my open PRs", ...

## Where things live

Everything the app writes goes to `~/.casium-ai`:

```
chats/         conversation history + per-chat settings (json)
skills/        installed skills
settings.json  ollama host, theme, timeouts
mcp.json       configured MCP apps
```

## Notes

- Ollama host is configurable under Settings (default `http://127.0.0.1:11434`).
- Tool calling needs a model with function-calling support (llama3.1/3.2,
  qwen2.5/3, mistral-nemo, gemma3...). Smaller models still chat fine, and
  skill installs work with any model (or none at all).
- 1-4B models run fine on CPU; 8B+ want a GPU.
