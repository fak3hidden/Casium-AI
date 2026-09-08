export type View =
  | "chat"
  | "library"
  | "browse"
  | "connections"
  | "prompts"
  | "settings";

export type Grade = "S" | "A" | "B" | "C" | "D" | "F";

export type Quant =
  | "Q2_K"
  | "Q3_K_M"
  | "Q4_K_M"
  | "Q5_K_M"
  | "Q6_K"
  | "Q8_0"
  | "F16";

export type Task =
  | "chat"
  | "code"
  | "reasoning"
  | "vision"
  | "image"
  | "video"
  | "embed"
  | "lightweight";

export type Architecture = "dense" | "moe";

export type FitStatus =
  | "comfortable"
  | "tight"
  | "cpu-offload"
  | "insufficient"
  | "unknown";

export interface GpuSpec {
  id: string;
  name: string;
  brand: "nvidia" | "amd" | "intel" | "apple" | "qualcomm" | "arm" | "other";
  vramGb: number;
  bandwidthGBs: number;
  unified?: boolean;
  aliases?: string[];
}

export interface HardwareProfile {
  gpuId: string;
  gpuName: string;
  vramGb: number;
  bandwidthGBs: number;
  ramGb: number;
  cores: number;
  detected: boolean;
  renderer?: string;
  unifiedMemory: boolean;
}

export interface ModelSpec {
  id: string;
  name: string;
  org: string;
  family: string;
  paramsB: number;
  activeParamsB?: number;
  architecture: Architecture;
  contextK: number;
  license: string;
  commercial: boolean;
  released: string;
  tasks: Task[];
  description: string;
  features: {
    tools?: boolean;
    thinking?: boolean;
    vision?: boolean;
    coding?: boolean;
  };
  ollama?: string;
  huggingface?: string;
  popularity: number;
  layers?: number;
  sizeHintGb?: number;
}

export interface QuantEstimate {
  quant: Quant;
  bits: number;
  modelSizeGb: number;
  vramRequiredGb: number;
  ramRequiredGb: number;
  tokensPerSecond: number;
  quality: "low" | "moderate" | "good" | "excellent" | "lossless";
  grade: Grade;
  score: number;
  status: FitStatus;
  notes: string[];
}

export interface Compatibility {
  modelId: string;
  recommendedQuant: Quant;
  best: QuantEstimate;
  quants: QuantEstimate[];
  overallGrade: Grade;
  overallScore: number;
}

export interface InstalledModel {
  modelId: string;
  quant: Quant;
  installedAt: number;
  lastUsed?: number;
  status: "downloading" | "ready" | "error";
  progress: number;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  createdAt: number;
  modelId?: string;
  toolName?: string;
  toolStatus?: "running" | "done";
}

export interface Conversation {
  id: string;
  title: string;
  modelId: string;
  promptId?: string;
  createdAt: number;
  updatedAt: number;
  messages: ChatMessage[];
  projectId?: string;
  githubRepoId?: string;
}

export interface PromptTemplate {
  id: string;
  name: string;
  description: string;
  body: string;
  tags: string[];
  builtin?: boolean;
  updatedAt: number;
}

export type McpTransport = "stdio" | "sse" | "http";

export interface McpServer {
  id: string;
  name: string;
  enabled: boolean;
  transport: McpTransport;
  command?: string;
  args?: string;
  url?: string;
  env?: string;
  description?: string;
  tools: string[];
  status: "disconnected" | "connecting" | "connected" | "error";
}

export interface GithubConnection {
  connected: boolean;
  token?: string;
  username?: string;
  repos: GithubRepo[];
}

export interface GithubRepo {
  id: string;
  fullName: string;
  description: string;
  language: string;
  stars: number;
  private: boolean;
  attached: boolean;
}

export interface ProjectConnection {
  id: string;
  name: string;
  path: string;
  kind: "vscode" | "folder";
  files: number;
  languages: string[];
  attached: boolean;
  addedAt: number;
}

export interface AppSettings {
  temperature: number;
  contextLength: number;
  gpuLayers: number;
  apiPort: number;
  apiEnabled: boolean;
  streamDelayMs: number;
  themeAccent: "teal" | "blue" | "violet";
  showHardwareBar: boolean;
}
