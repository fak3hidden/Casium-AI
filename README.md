# Casium AI

A local AI workstation — run open models on your machine, grade them against your GPU, and connect them to GitHub, VS Code projects, MCP servers, and custom instructions.

## What it is

Casium is the missing GUI between [Ollama](https://ollama.com)-style local inference and an agentic coding setup:

- **Chat** with installed models, streaming replies, tool-call cards, and per-chat prompts
- **Browse AIs** — a catalog of open weights with **S–F hardware grades**, per-quant VRAM, and estimated tok/s. Same idea as [CanIRun.ai](https://www.canirun.ai/): detect (or pick) a GPU, then see what actually fits
- **Library** — download a quantization that your card can hold
- **Connections** — attach VS / local folders, GitHub repos, and **MCP servers** (stdio / SSE / HTTP, with presets for filesystem, GitHub, Git, Brave, Postgres, Puppeteer, Memory, Fetch)
- **Prompts** — reusable system instructions, pinable per chat
- **Settings** — temperature, context, GPU layers, OpenAI-compatible local API port

Nothing you type is sent to a cloud model. Hardware detection runs in the browser (WebGL / WebGPU renderer → GPU database of VRAM + bandwidth). Compatibility scoring:

```
weights GB  ≈ params × bits / 8
VRAM need   ≈ weights + KV cache + runtime overhead
tok/s       ≈ memory bandwidth ÷ working set × efficiency
grade S–F   ← fit (comfortable / tight / CPU-offload / insufficient) + speed + headroom + quant quality
```

S / A / B mean it should run well. C / D is a tight fit or RAM offload. F is too heavy.

## Run it

```bash
npm install
npm run dev
```

Opens on `http://localhost:3000`. The first load seeds a couple of installed models so you can chat immediately; Browse to pull others.

Chat replies in this build are a **local demo engine** (so the UI is fully usable without multi-GB GGUF files). Wire the OpenAI-compatible endpoint in Settings to a real runner (Ollama, llama.cpp, vLLM) when you want live weights.

## Stack

Vite · React 19 · TypeScript · Tailwind · Framer-friendly CSS. State lives in `localStorage` under `casium-ai-v1`.
