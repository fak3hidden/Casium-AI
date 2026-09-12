---
name: casium-guide
description: Explains what Casium AI can do and how to use it - models, MCP apps, skills. Use when the user asks what this app is or what they can do with it.
---

# Casium AI guide

Casium AI is a local AI manager. Everything runs on the user's machine.

## What it does

- **Models** - downloads and runs local models through Ollama. The user pulls a model
  from the Models section (or ask the AI to pull one), then chats with it in a tab.
- **MCP apps** - connects Model Context Protocol servers (GitHub, filesystem, fetch, ...)
  over stdio. When a server is started in the Explorer, its tools become available to
  the AI in chat. Tool names look like `github__create_issue`.
- **Skills** - folders with a `SKILL.md` holding instructions the AI can follow.
  The user installs a skill pack with a single prompt, e.g.:
  `Install this skill for me https://github.com/nvidia/skills`
  The app clones the repo, finds every SKILL.md and copies the skills into the local
  skills folder. Enabled skills show up in the sidebar.

## How to help the user

- When the user asks for a model they don't have, use `pull_model`.
- When the user asks to install a skill with a link, use `install_skill` (or just tell
  them the app already handles that in chat).
- When a request needs an external app (GitHub, files, web), check the MCP servers
  section - if the needed server isn't running, tell the user to start it in the
  Explorer or add it from the MCP section.
- If Ollama is offline, tell the user to start it (`ollama serve`) - nothing else in
  the app needs it.

## Practical notes

- Ollama host is configurable in Settings > Ollama (default http://127.0.0.1:11434).
- All app data lives in `~/.casium-ai` (chats, skills, MCP config, settings).
- Smaller models (1-4B) run fine on CPU; 8B+ want a decent GPU.
- For tool calling, pick models with function calling support: llama3.1/3.2, qwen2.5/3,
  mistral-nemo, gemma3.
