import type { McpServer, PromptTemplate } from "./types";

export const BUILTIN_PROMPTS: PromptTemplate[] = [
  {
    id: "prompt-default",
    name: "Casium default",
    description: "Helpful local assistant. Concise, cites files when a project is attached.",
    tags: ["general"],
    builtin: true,
    updatedAt: 0,
    body: `You are Casium, a local AI running entirely on the user's machine. Be precise, calm, and useful.

Rules:
- Prefer short, well-structured answers. Use markdown.
- If a project, GitHub repo, or MCP tool is attached, use that context before guessing.
- Never claim you have live internet unless an MCP server provides it.
- For code, return complete, runnable snippets and name the file you would edit.
- If hardware or a model won't fit, say so plainly and suggest a quantization.`,
  },
  {
    id: "prompt-coder",
    name: "Repo engineer",
    description: "Acts like a senior engineer inside the connected VS / GitHub project.",
    tags: ["code", "project"],
    builtin: true,
    updatedAt: 0,
    body: `You are a senior software engineer embedded in the user's repository.

When a VS project or GitHub repo is connected:
- Speak in terms of real files and symbols.
- Propose the smallest correct change.
- Show diffs with filenames.
- Call out tests to run.

Style: no fluff, no apologies, production-quality code. Match the repo's existing voice and tooling.`,
  },
  {
    id: "prompt-reason",
    name: "Slow thinker",
    description: "For reasoning models — think step by step, then give the answer.",
    tags: ["reasoning"],
    builtin: true,
    updatedAt: 0,
    body: `You are a careful reasoning model. Work privately through the problem, then present:

1. A short plan
2. The solution
3. Assumptions and failure modes

Do not pad. If the question is underspecified, state the missing piece and pick a reasonable default.`,
  },
  {
    id: "prompt-writer",
    name: "Editor",
    description: "Tight prose. Rewrites, briefs, commit messages, docs.",
    tags: ["writing"],
    builtin: true,
    updatedAt: 0,
    body: `You are a sharp editor. Rewrite for clarity and rhythm. Cut filler. Prefer concrete verbs.

If asked for a commit message, use conventional commits.
If asked for docs, lead with what the reader needs to do.`,
  },
  {
    id: "prompt-security",
    name: "Security review",
    description: "Threat-model attached code. No exploit payloads.",
    tags: ["code", "security"],
    builtin: true,
    updatedAt: 0,
    body: `You are a security-minded reviewer. Given project context:

- Identify trust boundaries, auth gaps, injection, secrets, and supply-chain risk.
- Rank findings by severity.
- Suggest fixes, not weaponized exploits.
- Assume the user owns the code.`,
  },
];

export const MCP_PRESETS: Omit<McpServer, "id" | "enabled" | "status">[] = [
  {
    name: "Filesystem",
    transport: "stdio",
    command: "npx",
    args: "-y @modelcontextprotocol/server-filesystem /path/to/project",
    description: "Read and write files in a project folder.",
    tools: ["read_file", "write_file", "list_directory", "search_files"],
  },
  {
    name: "GitHub",
    transport: "stdio",
    command: "npx",
    args: "-y @modelcontextprotocol/server-github",
    env: "GITHUB_PERSONAL_ACCESS_TOKEN=",
    description: "Issues, PRs, and repository contents via the GitHub API.",
    tools: ["create_issue", "list_prs", "get_file", "search_code"],
  },
  {
    name: "Git",
    transport: "stdio",
    command: "npx",
    args: "-y @modelcontextprotocol/server-git --repository /path/to/repo",
    description: "Local git status, log, diff, and blame.",
    tools: ["git_status", "git_log", "git_diff", "git_show"],
  },
  {
    name: "Brave Search",
    transport: "stdio",
    command: "npx",
    args: "-y @modelcontextprotocol/server-brave-search",
    env: "BRAVE_API_KEY=",
    description: "Web search when the model needs current information.",
    tools: ["brave_web_search", "brave_local_search"],
  },
  {
    name: "Postgres",
    transport: "stdio",
    command: "npx",
    args: "-y @modelcontextprotocol/server-postgres postgresql://localhost/db",
    description: "Inspect schema and run read-only SQL.",
    tools: ["query", "list_tables"],
  },
  {
    name: "Puppeteer",
    transport: "stdio",
    command: "npx",
    args: "-y @modelcontextprotocol/server-puppeteer",
    description: "Browse pages, screenshot, and extract DOM.",
    tools: ["navigate", "screenshot", "click", "fill"],
  },
  {
    name: "Memory",
    transport: "stdio",
    command: "npx",
    args: "-y @modelcontextprotocol/server-memory",
    description: "Persistent knowledge graph across chats.",
    tools: ["create_entities", "search_nodes", "read_graph"],
  },
  {
    name: "Fetch",
    transport: "stdio",
    command: "npx",
    args: "-y @modelcontextprotocol/server-fetch",
    description: "HTTP GET of URLs into the context window.",
    tools: ["fetch"],
  },
];

export const SAMPLE_REPOS = [
  {
    id: "gh-casium",
    fullName: "you/casium-workspace",
    description: "Playground repo wired into Casium for local coding agents.",
    language: "TypeScript",
    stars: 12,
    private: false,
    attached: true,
  },
  {
    id: "gh-api",
    fullName: "you/atlas-api",
    description: "Fastify API with Postgres and background jobs.",
    language: "TypeScript",
    stars: 48,
    private: true,
    attached: false,
  },
  {
    id: "gh-web",
    fullName: "you/lumen-web",
    description: "Marketing site and app shell.",
    language: "React",
    stars: 31,
    private: false,
    attached: false,
  },
];

export const SAMPLE_PROJECTS = [
  {
    id: "proj-this",
    name: "Casium-AI",
    path: "/home/user/Casium-AI",
    kind: "vscode" as const,
    files: 42,
    languages: ["TypeScript", "CSS"],
    attached: true,
    addedAt: Date.now(),
  },
];
