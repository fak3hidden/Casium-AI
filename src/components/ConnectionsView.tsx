import { useState, type ReactNode } from "react";
import {
  FolderGit2,
  Github,
  Plug,
  Plus,
  Trash2,
  Unplug,
} from "lucide-react";
import clsx from "clsx";
import { MCP_PRESETS } from "../lib/presets";
import { uid } from "../lib/engine";
import { useStore } from "../lib/useStore";
import type { McpServer, McpTransport } from "../lib/types";

export function ConnectionsView() {
  const store = useStore();
  const { github, projects, mcp } = store.state;
  const [user, setUser] = useState(github.username ?? "");
  const [token, setToken] = useState("");
  const [projName, setProjName] = useState("");
  const [projPath, setProjPath] = useState("");
  const [mcpOpen, setMcpOpen] = useState(false);

  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-6">
      <div className="mb-6">
        <div className="font-serif text-3xl italic">Connections</div>
        <p className="mt-1 max-w-2xl text-sm text-white/45">
          Give local models eyes on your work. Attach VS Code folders, GitHub repos, and MCP
          servers — the same protocol Cursor and Claude use for tools.
        </p>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <section className="rounded-2xl border border-white/[0.07] bg-ink-800/40 p-5">
          <Header icon={<Github size={16} />} title="GitHub" hint="Repos the model may read" />
          {github.connected ? (
            <div>
              <div className="mb-3 flex items-center justify-between text-sm">
                <span className="text-white/70">
                  Signed in as <span className="text-white">{github.username}</span>
                </span>
                <button className="text-[12px] text-white/40 hover:text-white" onClick={store.disconnectGithub}>
                  Disconnect
                </button>
              </div>
              <div className="space-y-2">
                {github.repos.map((r) => (
                  <label
                    key={r.id}
                    className="flex cursor-pointer items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2.5"
                  >
                    <input
                      type="checkbox"
                      checked={r.attached}
                      onChange={() => store.toggleRepo(r.id)}
                      className="accent-casium"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm text-white">{r.fullName}</div>
                      <div className="truncate text-[11px] text-white/40">{r.description}</div>
                    </div>
                    <span className="font-mono text-[10px] text-white/30">{r.language}</span>
                  </label>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <input
                className="field"
                placeholder="GitHub username"
                value={user}
                onChange={(e) => setUser(e.target.value)}
              />
              <input
                className="field"
                placeholder="Personal access token (stored only on this device)"
                type="password"
                value={token}
                onChange={(e) => setToken(e.target.value)}
              />
              <button
                onClick={() => store.connectGithub(user || "you", token)}
                className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-ink-950"
              >
                Connect GitHub
              </button>
              <p className="text-[11px] text-white/30">
                Demo mode lists sample repos if the token isn’t used. A real token stays in
                localStorage and never leaves the browser.
              </p>
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-white/[0.07] bg-ink-800/40 p-5">
          <Header icon={<FolderGit2 size={16} />} title="VS / local projects" hint="Workspace folders" />
          <div className="space-y-2">
            {projects.map((p) => (
              <div
                key={p.id}
                className="flex items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2.5"
              >
                <input
                  type="checkbox"
                  checked={p.attached}
                  onChange={() => store.toggleProject(p.id)}
                  className="accent-casium"
                />
                <div className="min-w-0 flex-1">
                  <div className="text-sm text-white">{p.name}</div>
                  <div className="truncate font-mono text-[11px] text-white/35">{p.path}</div>
                </div>
                <span className="font-mono text-[10px] text-white/30">{p.files} files</span>
                <button onClick={() => store.removeProject(p.id)} className="text-white/30 hover:text-rose-400">
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <input
              className="field"
              placeholder="Project name"
              value={projName}
              onChange={(e) => setProjName(e.target.value)}
            />
            <input
              className="field"
              placeholder="/path/to/vscode/project"
              value={projPath}
              onChange={(e) => setProjPath(e.target.value)}
            />
          </div>
          <button
            className="mt-2 flex items-center gap-1 text-sm text-casium"
            onClick={() => {
              if (!projName && !projPath) return;
              store.addProject({
                id: uid("proj"),
                name: projName || projPath.split("/").filter(Boolean).pop() || "Project",
                path: projPath || `~/Projects/${projName}`,
                kind: "vscode",
                files: 18,
                languages: ["TypeScript"],
                attached: true,
                addedAt: Date.now(),
              });
              setProjName("");
              setProjPath("");
            }}
          >
            <Plus size={14} /> Add folder
          </button>
        </section>
      </div>

      <section className="mt-4 rounded-2xl border border-white/[0.07] bg-ink-800/40 p-5">
        <div className="mb-4 flex items-center justify-between">
          <Header icon={<Plug size={16} />} title="MCP servers" hint="Model Context Protocol" />
          <button
            onClick={() => setMcpOpen(true)}
            className="flex items-center gap-1 rounded-xl bg-casium px-3 py-2 text-sm font-semibold text-ink-950"
          >
            <Plus size={14} /> Add server
          </button>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          {mcp.map((s) => (
            <div key={s.id} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="font-medium text-white">{s.name}</div>
                  <div className="text-[12px] text-white/40">{s.description}</div>
                </div>
                <button
                  onClick={() => store.toggleMcp(s.id)}
                  className={clsx(
                    "flex items-center gap-1 rounded-full border px-2 py-1 text-[11px]",
                    s.enabled
                      ? "border-casium/30 bg-casium/10 text-casium"
                      : "border-white/10 text-white/40",
                  )}
                >
                  {s.enabled ? <Plug size={11} /> : <Unplug size={11} />}
                  {s.status}
                </button>
              </div>
              <div className="mt-2 font-mono text-[11px] text-white/35">
                {s.transport} · {s.command} {s.args}
              </div>
              <div className="mt-2 flex flex-wrap gap-1">
                {s.tools.map((t) => (
                  <span key={t} className="rounded-md bg-white/[0.05] px-1.5 py-0.5 font-mono text-[10px] text-white/50">
                    {t}
                  </span>
                ))}
              </div>
              <button
                onClick={() => store.removeMcp(s.id)}
                className="mt-3 text-[11px] text-white/30 hover:text-rose-400"
              >
                Remove
              </button>
            </div>
          ))}
        </div>

        {mcpOpen && <McpModal onClose={() => setMcpOpen(false)} />}
      </section>
    </div>
  );
}

function Header({
  icon,
  title,
  hint,
}: {
  icon: ReactNode;
  title: string;
  hint: string;
}) {
  return (
    <div className="mb-4 flex items-center gap-3">
      <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-casium">
        {icon}
      </div>
      <div>
        <div className="font-medium text-white">{title}</div>
        <div className="text-[11px] text-white/35">{hint}</div>
      </div>
    </div>
  );
}

function McpModal({ onClose }: { onClose: () => void }) {
  const store = useStore();
  const [name, setName] = useState("");
  const [transport, setTransport] = useState<McpTransport>("stdio");
  const [command, setCommand] = useState("npx");
  const [args, setArgs] = useState("");
  const [url, setUrl] = useState("");
  const [env, setEnv] = useState("");
  const [description, setDescription] = useState("");

  const applyPreset = (p: (typeof MCP_PRESETS)[number]) => {
    setName(p.name);
    setTransport(p.transport);
    setCommand(p.command ?? "npx");
    setArgs(p.args ?? "");
    setUrl(p.url ?? "");
    setEnv(p.env ?? "");
    setDescription(p.description ?? "");
  };

  const save = () => {
    const preset = MCP_PRESETS.find((p) => p.name === name);
    const server: McpServer = {
      id: uid("mcp"),
      name: name || "Custom MCP",
      enabled: true,
      transport,
      command,
      args,
      url,
      env,
      description,
      tools: preset?.tools ?? ["tools/list"],
      status: "connecting",
    };
    store.addMcp(server);
    setTimeout(() => store.updateMcp(server.id, { status: "connected" }), 600);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-2xl border border-white/10 bg-ink-800 p-5 shadow-panel"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="font-serif text-2xl italic">Add MCP server</div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {MCP_PRESETS.map((p) => (
            <button
              key={p.name}
              onClick={() => applyPreset(p)}
              className="rounded-full border border-white/10 px-2.5 py-1 text-[11px] text-white/60 hover:border-casium/40 hover:text-white"
            >
              {p.name}
            </button>
          ))}
        </div>
        <div className="mt-4 space-y-2">
          <input className="field" placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
          <div className="grid grid-cols-3 gap-2">
            {(["stdio", "sse", "http"] as McpTransport[]).map((t) => (
              <button
                key={t}
                onClick={() => setTransport(t)}
                className={clsx(
                  "rounded-xl border py-2 text-sm",
                  transport === t ? "border-casium/40 bg-casium/10 text-casium" : "border-white/10 text-white/50",
                )}
              >
                {t}
              </button>
            ))}
          </div>
          {transport === "stdio" ? (
            <>
              <input className="field" placeholder="Command" value={command} onChange={(e) => setCommand(e.target.value)} />
              <input className="field" placeholder="Args" value={args} onChange={(e) => setArgs(e.target.value)} />
            </>
          ) : (
            <input className="field" placeholder="https://…" value={url} onChange={(e) => setUrl(e.target.value)} />
          )}
          <input className="field" placeholder="ENV KEY=value" value={env} onChange={(e) => setEnv(e.target.value)} />
          <input
            className="field"
            placeholder="What this server is for"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="px-3 py-2 text-sm text-white/50">
            Cancel
          </button>
          <button onClick={save} className="rounded-xl bg-casium px-4 py-2 text-sm font-semibold text-ink-950">
            Connect
          </button>
        </div>
      </div>
    </div>
  );
}
