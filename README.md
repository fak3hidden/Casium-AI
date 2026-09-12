# Casium AI

Local AI manager. It pulls and runs models through Ollama, connects MCP apps
(GitHub, filesystem, fetch, ...) so the AI can actually do things, and manages
skills - instruction packs the AI follows. Everything stays on your machine.

## Run it

```
python3 server.py
```

Windows: double-click `run.bat`. That's it - no pip packages, no node install for the app itself.
The UI opens at http://localhost:8787 (set `CASIUM_PORT` to change the port).

Requirements:
- Python 3.9+
- [Ollama](https://ollama.com) running (`ollama serve`) - for models and chat.
  The app still works without it (you can install skills and manage MCP apps),
  it just can't answer.

## What it does

- **Models** - pull models from the Ollama library with progress, delete them,
  or just ask: "download qwen3:4b for me".
- **Chat** - each conversation is a tab, streamed from the model you picked.
  A console below the composer logs everything (console + activity tabs),
  and the `›` prompt takes commands: `/help`, `/models`, `/pull llama3.2`,
  `/skills`, `/install <url>`, `/mcp`, `/theme volt`...
- **MCP apps** - add a server (name, command, args, env vars), start/stop it.
  The app speaks MCP JSON-RPC over stdio, lists its tools, and the AI calls
  them in chat. Bundled presets: GitHub, Filesystem, Fetch, Time.
- **Skills** - folders with a `SKILL.md`. Install a whole pack with one prompt:

  ```
  Install this skill for me https://github.com/nvidia/skills
  ```

  The app clones the repo, finds every SKILL.md and installs each one.
  Enabled skills are shown to the AI; it can read one in full when it needs to.
- **Themes** - Paper, Volt, Ember, Graphite, Nord. Settings, or `/theme`.

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

1. Explorer → MCP apps → +
2. Preset: GitHub. Paste a token into `GITHUB_PERSONAL_ACCESS_TOKEN`
   (a fine-grained token with contents + issues on the repos you care about is enough).
3. It starts via `npx -y @modelcontextprotocol/server-github` - needs Node.js
   (or use `uvx`-based presets, which need [uv](https://docs.astral.sh/uv/)).

Once it's running its tools are live in chat: "create an issue on my repo
called x", "list my open PRs", ...

## Where things live

Everything the app writes goes to `~/.casium-ai`:

```
chats/       conversation history (json)
skills/      installed skills
settings.json  ollama host, theme, timeouts
mcp.json     configured MCP apps
```

## Notes

- Ollama host is configurable under Settings → Ollama (default `http://127.0.0.1:11434`).
- Tool calling needs a model with function-calling support (llama3.1/3.2,
  qwen2.5/3, mistral-nemo, gemma3...). Smaller models work for plain chat,
  and skill installs work either way.
- Pulling models can take a while; 1-4B models run fine on CPU, 8B+ want a GPU.
