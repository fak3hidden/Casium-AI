import { compatibility } from "./compatibility";
import { detectHardware, DEFAULT_HARDWARE, applyGpu } from "./hardware";
import { MODELS } from "./models";
import { BUILTIN_PROMPTS, MCP_PRESETS, SAMPLE_PROJECTS, SAMPLE_REPOS } from "./presets";
import { generateReply, modelById, titleFrom, uid } from "./engine";
import type {
  AppSettings,
  ChatMessage,
  Conversation,
  GithubConnection,
  HardwareProfile,
  InstalledModel,
  McpServer,
  PromptTemplate,
  ProjectConnection,
  Quant,
  View,
} from "./types";

const KEY = "casium-ai-v1";

export interface AppState {
  view: View;
  hardware: HardwareProfile;
  installed: InstalledModel[];
  conversations: Conversation[];
  activeConversationId: string | null;
  prompts: PromptTemplate[];
  mcp: McpServer[];
  github: GithubConnection;
  projects: ProjectConnection[];
  settings: AppSettings;
  streaming: boolean;
  browseQuery: string;
  selectedModelId: string | null;
}

const defaultSettings: AppSettings = {
  temperature: 0.7,
  contextLength: 8192,
  gpuLayers: 99,
  apiPort: 11434,
  apiEnabled: true,
  streamDelayMs: 12,
  themeAccent: "teal",
  showHardwareBar: true,
};

function seedConversation(): Conversation {
  const now = Date.now();
  return {
    id: uid("chat"),
    title: "Welcome",
    modelId: "qwen2.5-7b",
    promptId: "prompt-default",
    createdAt: now,
    updatedAt: now,
    messages: [
      {
        id: uid("msg"),
        role: "assistant",
        content:
          "Casium is ready. I’m running locally — pick a model that fits your GPU, or ask me anything. Attach a VS project, GitHub repo, or MCP server when you want the model inside your code.",
        createdAt: now,
        modelId: "qwen2.5-7b",
      },
    ],
  };
}

function seedMcp(): McpServer[] {
  return MCP_PRESETS.slice(0, 3).map((p, i) => ({
    ...p,
    id: uid("mcp"),
    enabled: i === 0,
    status: i === 0 ? "connected" : "disconnected",
  }));
}

export function emptyState(): AppState {
  const welcome = seedConversation();
  return {
    view: "chat",
    hardware: DEFAULT_HARDWARE,
    installed: [
      {
        modelId: "qwen2.5-7b",
        quant: "Q4_K_M",
        installedAt: Date.now() - 86400000,
        lastUsed: Date.now(),
        status: "ready",
        progress: 100,
      },
      {
        modelId: "llama3.2-3b",
        quant: "Q8_0",
        installedAt: Date.now() - 172800000,
        status: "ready",
        progress: 100,
      },
    ],
    conversations: [welcome],
    activeConversationId: welcome.id,
    prompts: BUILTIN_PROMPTS.map((p) => ({ ...p })),
    mcp: seedMcp(),
    github: {
      connected: false,
      repos: SAMPLE_REPOS.map((r) => ({ ...r, attached: r.attached })),
    },
    projects: SAMPLE_PROJECTS.map((p) => ({ ...p })),
    settings: { ...defaultSettings },
    streaming: false,
    browseQuery: "",
    selectedModelId: null,
  };
}

function load(): AppState {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return emptyState();
    const parsed = JSON.parse(raw) as Partial<AppState>;
    const base = emptyState();
    return {
      ...base,
      ...parsed,
      settings: { ...base.settings, ...parsed.settings },
      hardware: { ...base.hardware, ...parsed.hardware },
      prompts: parsed.prompts?.length ? parsed.prompts : base.prompts,
      streaming: false,
    };
  } catch {
    return emptyState();
  }
}

type Listener = () => void;

class Store {
  state: AppState = emptyState();
  listeners = new Set<Listener>();
  hydrating = true;

  subscribe = (fn: Listener) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  get = () => this.state;

  private set(patch: Partial<AppState> | ((s: AppState) => AppState)) {
    this.state = typeof patch === "function" ? patch(this.state) : { ...this.state, ...patch };
    this.listeners.forEach((l) => l());
    this.persist();
  }

  persist() {
    if (this.hydrating) return;
    const { streaming: _s, ...rest } = this.state;
    try {
      localStorage.setItem(KEY, JSON.stringify(rest));
    } catch {
      /* quota */
    }
  }

  hydrate = async () => {
    this.state = load();
    this.hydrating = false;
    this.listeners.forEach((l) => l());
    try {
      const hw = await detectHardware();
      // Don't clobber a user-picked GPU unless first run
      const saved = this.state.hardware;
      if (!saved.detected && saved.gpuId === DEFAULT_HARDWARE.gpuId) {
        this.set({ hardware: { ...hw, ramGb: Math.max(hw.ramGb, saved.ramGb) } });
      } else {
        this.set({
          hardware: {
            ...saved,
            cores: hw.cores || saved.cores,
            renderer: hw.renderer || saved.renderer,
          },
        });
      }
    } catch {
      /* keep */
    }
  };

  setView = (view: View) => this.set({ view });
  setBrowseQuery = (browseQuery: string) => this.set({ browseQuery });
  selectModel = (selectedModelId: string | null) => this.set({ selectedModelId, view: selectedModelId ? "browse" : this.state.view });

  setHardware = (hardware: HardwareProfile) => this.set({ hardware });
  pickGpu = (gpuId: string) => this.set({ hardware: applyGpu(gpuId, this.state.hardware) });
  setRam = (ramGb: number) => {
    const hw = { ...this.state.hardware, ramGb };
    if (hw.unifiedMemory && GPU_BY_SAFE(hw.gpuId)) {
      // keep vram as ram for unified when gpu reports 0
    }
    this.set({ hardware: hw });
  };

  setSettings = (patch: Partial<AppSettings>) =>
    this.set({ settings: { ...this.state.settings, ...patch } });

  activeConversation = () =>
    this.state.conversations.find((c) => c.id === this.state.activeConversationId) ??
    this.state.conversations[0];

  newChat = (modelId?: string) => {
    const installed = this.state.installed.find((i) => i.status === "ready");
    const id = uid("chat");
    const conv: Conversation = {
      id,
      title: "New chat",
      modelId: modelId || this.activeConversation()?.modelId || installed?.modelId || MODELS[2].id,
      promptId: "prompt-default",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      messages: [],
      projectId: this.state.projects.find((p) => p.attached)?.id,
      githubRepoId: this.state.github.repos.find((r) => r.attached)?.id,
    };
    this.set({
      conversations: [conv, ...this.state.conversations],
      activeConversationId: id,
      view: "chat",
    });
  };

  openChat = (id: string) => this.set({ activeConversationId: id, view: "chat" });

  deleteChat = (id: string) => {
    const next = this.state.conversations.filter((c) => c.id !== id);
    this.set({
      conversations: next.length ? next : [seedConversation()],
      activeConversationId:
        this.state.activeConversationId === id ? next[0]?.id ?? null : this.state.activeConversationId,
    });
  };

  setChatModel = (modelId: string) => {
    const id = this.state.activeConversationId;
    this.set({
      conversations: this.state.conversations.map((c) =>
        c.id === id ? { ...c, modelId, updatedAt: Date.now() } : c,
      ),
    });
  };

  setChatPrompt = (promptId: string) => {
    const id = this.state.activeConversationId;
    this.set({
      conversations: this.state.conversations.map((c) =>
        c.id === id ? { ...c, promptId, updatedAt: Date.now() } : c,
      ),
    });
  };

  send = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || this.state.streaming) return;
    let conv = this.activeConversation();
    if (!conv) {
      this.newChat();
      conv = this.activeConversation();
    }
    if (!conv) return;

    const userMsg: ChatMessage = {
      id: uid("msg"),
      role: "user",
      content: trimmed,
      createdAt: Date.now(),
    };
    const assistantId = uid("msg");
    const assistant: ChatMessage = {
      id: assistantId,
      role: "assistant",
      content: "",
      createdAt: Date.now(),
      modelId: conv.modelId,
    };

    const titled = conv.messages.length === 0 ? titleFrom(trimmed) : conv.title;
    this.patchConv(conv.id, (c) => ({
      ...c,
      title: titled,
      updatedAt: Date.now(),
      messages: [...c.messages, userMsg, assistant],
    }));
    this.set({ streaming: true });

    const model = modelById(conv.modelId);
    const prompt = this.state.prompts.find((p) => p.id === conv.promptId);
    const installed = this.state.installed.find((i) => i.modelId === model.id && i.status === "ready");
    const compat = compatibility(model, this.state.hardware);
    const githubNames = this.state.github.repos.filter((r) => r.attached).map((r) => r.fullName);

    try {
      for await (const ev of generateReply({
        conversation: conv,
        userText: trimmed,
        model,
        prompt,
        hardware: this.state.hardware,
        installed,
        compat,
        mcp: this.state.mcp,
        projects: this.state.projects,
        githubNames,
      })) {
        if (ev.type === "tool") {
          this.patchConv(conv.id, (c) => ({
            ...c,
            messages: upsertTool(c.messages, ev.name, ev.status, ev.detail),
          }));
        } else {
          this.patchConv(conv.id, (c) => ({
            ...c,
            messages: c.messages.map((m) =>
              m.id === assistantId ? { ...m, content: m.content + ev.text } : m,
            ),
          }));
        }
      }
    } finally {
      this.set({ streaming: false });
      this.patchConv(conv.id, (c) => ({ ...c, updatedAt: Date.now() }));
    }
  };

  private patchConv(id: string, fn: (c: Conversation) => Conversation) {
    this.set({
      conversations: this.state.conversations.map((c) => (c.id === id ? fn(c) : c)),
    });
  }

  download = (modelId: string, quant: Quant) => {
    const existing = this.state.installed.find((i) => i.modelId === modelId);
    const rec: InstalledModel = {
      modelId,
      quant,
      installedAt: Date.now(),
      status: "downloading",
      progress: existing?.status === "ready" ? 0 : 0,
    };
    this.set({
      installed: [rec, ...this.state.installed.filter((i) => i.modelId !== modelId)],
      view: "library",
    });
    const model = modelById(modelId);
    const size = (model.paramsB * 4.5) / 8;
    const duration = Math.min(7000, 900 + size * 180);
    const started = Date.now();
    const tick = () => {
      const p = Math.min(100, Math.round(((Date.now() - started) / duration) * 100));
      this.set({
        installed: this.state.installed.map((i) =>
          i.modelId === modelId
            ? { ...i, progress: p, status: p >= 100 ? "ready" : "downloading" }
            : i,
        ),
      });
      if (p < 100) requestAnimationFrame(() => setTimeout(tick, 80));
    };
    setTimeout(tick, 80);
  };

  removeModel = (modelId: string) =>
    this.set({ installed: this.state.installed.filter((i) => i.modelId !== modelId) });

  savePrompt = (prompt: PromptTemplate) => {
    const exists = this.state.prompts.some((p) => p.id === prompt.id);
    this.set({
      prompts: exists
        ? this.state.prompts.map((p) => (p.id === prompt.id ? prompt : p))
        : [prompt, ...this.state.prompts],
    });
  };

  deletePrompt = (id: string) => {
    const p = this.state.prompts.find((x) => x.id === id);
    if (p?.builtin) return;
    this.set({ prompts: this.state.prompts.filter((x) => x.id !== id) });
  };

  addMcp = (server: McpServer) => this.set({ mcp: [server, ...this.state.mcp] });
  updateMcp = (id: string, patch: Partial<McpServer>) =>
    this.set({ mcp: this.state.mcp.map((m) => (m.id === id ? { ...m, ...patch } : m)) });
  removeMcp = (id: string) => this.set({ mcp: this.state.mcp.filter((m) => m.id !== id) });
  toggleMcp = (id: string) => {
    this.set({
      mcp: this.state.mcp.map((m) => {
        if (m.id !== id) return m;
        const enabled = !m.enabled;
        return { ...m, enabled, status: enabled ? "connecting" : "disconnected" };
      }),
    });
    const s = this.state.mcp.find((m) => m.id === id);
    if (s?.enabled) {
      setTimeout(() => {
        this.updateMcp(id, { status: "connected" });
      }, 700);
    }
  };

  connectGithub = (username: string, token?: string) => {
    this.set({
      github: {
        connected: true,
        username,
        token,
        repos: SAMPLE_REPOS.map((r) => ({ ...r })),
      },
    });
  };

  disconnectGithub = () =>
    this.set({
      github: { connected: false, repos: SAMPLE_REPOS.map((r) => ({ ...r, attached: false })) },
    });

  toggleRepo = (id: string) =>
    this.set({
      github: {
        ...this.state.github,
        repos: this.state.github.repos.map((r) => (r.id === id ? { ...r, attached: !r.attached } : r)),
      },
    });

  addProject = (project: ProjectConnection) =>
    this.set({ projects: [project, ...this.state.projects] });
  toggleProject = (id: string) =>
    this.set({
      projects: this.state.projects.map((p) => (p.id === id ? { ...p, attached: !p.attached } : p)),
    });
  removeProject = (id: string) =>
    this.set({ projects: this.state.projects.filter((p) => p.id !== id) });

  reset = () => {
    localStorage.removeItem(KEY);
    this.state = emptyState();
    this.hydrating = false;
    this.listeners.forEach((l) => l());
  };
}

function GPU_BY_SAFE(_id: string) {
  return true;
}

function upsertTool(
  messages: ChatMessage[],
  name: string,
  status: "running" | "done",
  detail: string,
): ChatMessage[] {
  const existing = messages.find((m) => m.role === "tool" && m.toolName === name);
  if (existing) {
    return messages.map((m) =>
      m.id === existing.id ? { ...m, toolStatus: status, content: detail } : m,
    );
  }
  return [
    ...messages.slice(0, -1),
    {
      id: uid("tool"),
      role: "tool",
      content: detail,
      createdAt: Date.now(),
      toolName: name,
      toolStatus: status,
    },
    messages[messages.length - 1],
  ];
}

export const store = new Store();
