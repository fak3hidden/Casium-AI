import { MODELS, MODEL_BY_ID } from "./models";
import type {
  ChatMessage,
  Compatibility,
  Conversation,
  HardwareProfile,
  InstalledModel,
  McpServer,
  ModelSpec,
  ProjectConnection,
  PromptTemplate,
} from "./types";

export function uid(prefix = "id"): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-4)}`;
}

export function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

interface GenerateArgs {
  conversation: Conversation;
  userText: string;
  model: ModelSpec;
  prompt?: PromptTemplate;
  hardware: HardwareProfile;
  installed: InstalledModel | undefined;
  compat: Compatibility;
  mcp: McpServer[];
  projects: ProjectConnection[];
  githubNames: string[];
}

export async function* generateReply(args: GenerateArgs): AsyncGenerator<
  | { type: "tool"; name: string; status: "running" | "done"; detail: string }
  | { type: "token"; text: string }
> {
  const { userText, model, prompt, hardware, installed, compat, mcp, projects, githubNames } = args;
  const q = userText.toLowerCase();
  const liveMcp = mcp.filter((m) => m.enabled && m.status === "connected");
  const attachedProjects = projects.filter((p) => p.attached);

  const wantsCode = /code|function|component|refactor|bug|diff|implement|typescript|python|react/.test(q);
  const wantsHardware = /vram|gpu|can i run|fit|hardware|quant|grade|spec/.test(q);
  const wantsRepo = /repo|project|github|file|folder|workspace|vs ?code/.test(q);
  const wantsMcp = /mcp|tool|server/.test(q);

  if (liveMcp.length && (wantsRepo || wantsCode || wantsMcp)) {
    const server = liveMcp[0];
    const tool = server.tools[0] || "list_directory";
    yield { type: "tool", name: `${server.name}:${tool}`, status: "running", detail: "Reading connected context…" };
    await sleep(420);
    yield {
      type: "tool",
      name: `${server.name}:${tool}`,
      status: "done",
      detail: attachedProjects[0]
        ? `Indexed ${attachedProjects[0].files} files in ${attachedProjects[0].name}`
        : "Tool finished",
    };
  }

  const text = compose({
    userText,
    model,
    prompt,
    hardware,
    installed,
    compat,
    mcp: liveMcp,
    projects: attachedProjects,
    githubNames,
    wantsCode,
    wantsHardware,
    wantsRepo,
  });

  // Stream in word-ish chunks so the UI feels like local inference
  const parts = text.split(/(\s+)/);
  for (const part of parts) {
    yield { type: "token", text: part };
    const delay = part.trim().length > 8 ? 16 : 8;
    await sleep(delay);
  }
}

function compose(input: {
  userText: string;
  model: ModelSpec;
  prompt?: PromptTemplate;
  hardware: HardwareProfile;
  installed?: InstalledModel;
  compat: Compatibility;
  mcp: McpServer[];
  projects: ProjectConnection[];
  githubNames: string[];
  wantsCode: boolean;
  wantsHardware: boolean;
  wantsRepo: boolean;
}): string {
  const { userText, model, hardware, installed, compat, mcp, projects, githubNames } = input;
  const quant = installed?.quant ?? compat.recommendedQuant;
  const best = compat.quants.find((q) => q.quant === quant) ?? compat.best;
  const ctxBits: string[] = [];
  if (projects.length) ctxBits.push(`VS project **${projects.map((p) => p.name).join(", ")}**`);
  if (githubNames.length) ctxBits.push(`GitHub **${githubNames.join(", ")}**`);
  if (mcp.length) ctxBits.push(`MCP (${mcp.map((m) => m.name).join(", ")})`);

  const header = `${model.name} · ${quant} · ~${best.tokensPerSecond} tok/s · ${hardware.gpuName}`;

  if (input.wantsHardware) {
    return `${header}

Your machine is graded as **${hardware.gpuName}** with **${hardware.vramGb} GB** ${hardware.unifiedMemory ? "unified memory" : "VRAM"}, **${hardware.bandwidthGBs} GB/s** bandwidth, **${hardware.ramGb} GB** RAM.

**${model.name}** at ${quant}:
- Grade **${best.grade}** (${best.score}/100) — ${best.status}
- ${best.vramRequiredGb} GB required · ${best.modelSizeGb} GB weights
- ~${best.tokensPerSecond} tokens/sec

${best.notes.map((n) => `- ${n}`).join("\n")}

S/A/B run well. C/D is tight or offload. F will not fit.`;
  }

  if (input.wantsCode) {
    const file = projects[0] ? `${projects[0].name}/src/lib/engine.ts` : "src/app.ts";
    return `${header}

${ctxBits.length ? `Using ${ctxBits.join(" · ")}.` : "No project attached yet — this is a generic sketch. Connect a VS folder or GitHub repo in **Connections** for file-aware edits."}

Here's a tight implementation that matches what you asked:

\`\`\`ts
export async function runLocal(prompt: string) {
  const res = await fetch("http://127.0.0.1:${11434}/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "${model.ollama ?? model.id}",
      messages: [{ role: "user", content: prompt }],
      stream: true,
    }),
  });
  return res;
}
\`\`\`

I'd drop that in \`${file}\`, keep secrets out of git, and add a test around the stream parser.

Want me to wire it to the Casium OpenAI-compatible endpoint instead?`;
  }

  if (input.wantsRepo) {
    return `${header}

${projects.length || githubNames.length ? `I can see ${ctxBits.join(" and ")}.` : "Nothing is attached yet."}

To make this model actually live in your codebase:

1. **Connections → VS project** — point Casium at the folder (or this workspace).
2. **Connections → GitHub** — attach the repos the agent may read.
3. **MCP servers** — enable Filesystem + Git so the model can \`read_file\` / \`git_diff\` instead of guessing.
4. Pin a **custom prompt** like *Repo engineer* so every chat stays in-diff.

Then ask things like *“trace the auth flow”* or *“add an MCP tool for issues”* and I’ll stay inside those files.`;
  }

  const extra =
    input.prompt?.id === "prompt-coder"
      ? "\n\nI’m in **Repo engineer** mode — answers will prefer diffs and filenames."
      : "";

  return `${header}

${userText.trim().length < 40 ? "Got it." : "Understood."} ${model.name} is ${installed ? "loaded locally" : "available in the catalog"} at **${quant}** (grade **${best.grade}** on your ${hardware.gpuName}).

${ctxBits.length ? `Context in this turn: ${ctxBits.join(" · ")}.` : "You can attach a VS project, GitHub repo, or MCP server from the rail on the left — I’ll use them on the next message."}

${replyFor(userText)}
${extra}`;
}

function replyFor(userText: string): string {
  const q = userText.toLowerCase();
  if (/hello|hi\b|hey/.test(q)) {
    return "What do you want to run locally — a coding model, a reasoner, or something tiny for this machine?";
  }
  if (/who are you|what is casium/.test(q)) {
    return "Casium is a local AI workstation. Browse models, grade them against your GPU, download a quant that fits, then connect the model to GitHub, VS Code projects, MCP servers, and custom instructions.";
  }
  if (/prompt|instruction/.test(q)) {
    return "Custom instructions live in **Prompts**. They’re system prompts you can pin per chat or per model — the same idea as a custom GPT, but the weights never leave this machine.";
  }
  return `Here’s a direct take on that:\n\n${summarize(userText)}\n\nIf you want this grounded in a real repo, attach one and ask again.`;
}

function summarize(text: string): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length < 120) {
    return `You asked: *${clean}* — I can expand this into a plan, a patch, or a model recommendation.`;
  }
  return `You want help with: *${clean.slice(0, 180)}…*\n\nI would split this into (1) goal, (2) constraints from your hardware / repo, (3) the smallest change that ships. Tell me which of those to do first.`;
}

export function titleFrom(text: string): string {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length <= 42) return t || "New chat";
  return t.slice(0, 42).replace(/\s+\S*$/, "") + "…";
}

export function modelById(id: string): ModelSpec {
  return MODEL_BY_ID[id] ?? MODELS[2];
}
