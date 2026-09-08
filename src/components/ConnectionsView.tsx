import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
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
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="border-b border-line px-4 py-3">
        <h1 className="text-[15px] font-medium">Connections</h1>
        <p className="mt-0.5 text-[12px] text-mute">
          VS folders, GitHub repos, and MCP servers attached to chat.
        </p>
      </div>

      <section className="border-b border-line px-4 py-4">
        <div className="mb-3 text-[12px] font-medium text-mute">GitHub</div>
        {github.connected ? (
          <>
            <div className="mb-2 flex items-center justify-between text-[13px]">
              <span className="text-mute">
                Signed in as <span className="text-fg">{github.username}</span>
              </span>
              <button className="text-[12px] text-mute hover:text-fg" onClick={store.disconnectGithub}>
                Disconnect
              </button>
            </div>
            <table className="data">
              <thead>
                <tr>
                  <th className="w-8" />
                  <th>Repo</th>
                  <th>Language</th>
                </tr>
              </thead>
              <tbody>
                {github.repos.map((r) => (
                  <tr key={r.id} onClick={() => store.toggleRepo(r.id)}>
                    <td>
                      <input type="checkbox" checked={r.attached} readOnly className="accent-white" />
                    </td>
                    <td>
                      <div>{r.fullName}</div>
                      <div className="text-[12px] text-mute">{r.description}</div>
                    </td>
                    <td className="font-mono text-[12px] text-mute">{r.language}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        ) : (
          <div className="flex max-w-lg flex-col gap-2">
            <input className="field" placeholder="Username" value={user} onChange={(e) => setUser(e.target.value)} />
            <input
              className="field"
              placeholder="Personal access token (this device only)"
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
            />
            <div>
              <button onClick={() => store.connectGithub(user || "you", token)} className="btn btn-primary">
                Connect
              </button>
            </div>
            <p className="text-[12px] text-faint">Without a token, sample repos are listed for the UI.</p>
          </div>
        )}
      </section>

      <section className="border-b border-line px-4 py-4">
        <div className="mb-3 text-[12px] font-medium text-mute">VS / local projects</div>
        <table className="data">
          <thead>
            <tr>
              <th className="w-8" />
              <th>Name</th>
              <th>Path</th>
              <th>Files</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {projects.map((p) => (
              <tr key={p.id} onClick={() => store.toggleProject(p.id)}>
                <td>
                  <input type="checkbox" checked={p.attached} readOnly className="accent-white" />
                </td>
                <td>{p.name}</td>
                <td className="font-mono text-[12px] text-mute">{p.path}</td>
                <td className="font-mono text-[12px] text-mute">{p.files}</td>
                <td>
                  <button
                    className="icon-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      store.removeProject(p.id);
                    }}
                  >
                    <Trash2 size={13} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="mt-3 flex max-w-lg gap-2">
          <input className="field" placeholder="Name" value={projName} onChange={(e) => setProjName(e.target.value)} />
          <input
            className="field"
            placeholder="/path/to/project"
            value={projPath}
            onChange={(e) => setProjPath(e.target.value)}
          />
          <button
            className="btn btn-ghost shrink-0"
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
            <Plus size={14} />
            Add
          </button>
        </div>
      </section>

      <section className="px-4 py-4">
        <div className="mb-3 flex items-center justify-between">
          <div className="text-[12px] font-medium text-mute">MCP servers</div>
          <button onClick={() => setMcpOpen(true)} className="btn btn-ghost h-7 text-[12px]">
            <Plus size={13} /> Add
          </button>
        </div>
        <table className="data">
          <thead>
            <tr>
              <th>Name</th>
              <th>Transport</th>
              <th>Command</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {mcp.map((s) => (
              <tr key={s.id} onClick={() => store.toggleMcp(s.id)}>
                <td>
                  <div>{s.name}</div>
                  <div className="text-[12px] text-mute">{s.description}</div>
                </td>
                <td className="font-mono text-[12px] text-mute">{s.transport}</td>
                <td className="max-w-[280px] truncate font-mono text-[11px] text-faint">
                  {s.command} {s.args}
                </td>
                <td>
                  <span className={clsx("text-[12px]", s.enabled ? "text-fg" : "text-faint")}>{s.status}</span>
                </td>
                <td>
                  <button
                    className="icon-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      store.removeMcp(s.id);
                    }}
                  >
                    <Trash2 size={13} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {mcpOpen && <McpModal onClose={() => setMcpOpen(false)} />}
      </section>
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
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div className="w-full max-w-md border border-line bg-panel p-4" onClick={(e) => e.stopPropagation()}>
        <div className="text-[15px] font-medium">Add MCP server</div>
        <div className="mt-3 flex flex-wrap gap-1">
          {MCP_PRESETS.map((p) => (
            <button
              key={p.name}
              onClick={() => applyPreset(p)}
              className="h-6 border border-line px-2 text-[12px] text-mute hover:text-fg"
            >
              {p.name}
            </button>
          ))}
        </div>
        <div className="mt-3 space-y-2">
          <input className="field" placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
          <div className="grid grid-cols-3 gap-1">
            {(["stdio", "sse", "http"] as McpTransport[]).map((t) => (
              <button
                key={t}
                onClick={() => setTransport(t)}
                className={clsx(
                  "h-8 border text-[13px]",
                  transport === t ? "border-fg bg-raised text-fg" : "border-line text-mute",
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
            <input className="field" placeholder="https://" value={url} onChange={(e) => setUrl(e.target.value)} />
          )}
          <input className="field" placeholder="ENV KEY=value" value={env} onChange={(e) => setEnv(e.target.value)} />
          <input
            className="field"
            placeholder="Description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="btn btn-ghost">
            Cancel
          </button>
          <button onClick={save} className="btn btn-primary">
            Connect
          </button>
        </div>
      </div>
    </div>
  );
}
