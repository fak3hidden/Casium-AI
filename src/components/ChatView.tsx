import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowUp, FolderGit2, Github, Plug, Plus, Square, Trash2 } from "lucide-react";
import clsx from "clsx";
import { useStore } from "../lib/useStore";
import { MODELS } from "../lib/models";
import { Markdown } from "./Markdown";
import { compatibility } from "../lib/compatibility";
import { GradeBadge } from "./GradeBadge";

export function ChatView() {
  const store = useStore();
  const { conversations, activeConversationId, streaming, installed, prompts, mcp, projects, github, hardware } =
    store.state;
  const conv = conversations.find((c) => c.id === activeConversationId) ?? conversations[0];
  const [draft, setDraft] = useState("");
  const scroller = useRef<HTMLDivElement>(null);
  const readyModels = installed.filter((i) => i.status === "ready");
  const model = MODELS.find((m) => m.id === conv?.modelId) ?? MODELS[2];
  const compat = useMemo(() => compatibility(model, hardware), [model, hardware]);
  const attachedRepos = github.repos.filter((r) => r.attached);
  const attachedProjects = projects.filter((p) => p.attached);
  const liveMcp = mcp.filter((m) => m.enabled && m.status === "connected");

  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [conv?.messages, streaming]);

  if (!conv) return null;

  const send = () => {
    const t = draft;
    setDraft("");
    store.send(t);
  };

  return (
    <div className="flex min-h-0 flex-1">
      <div className="hidden w-[220px] shrink-0 flex-col border-r border-line md:flex">
        <div className="flex h-9 items-center justify-between px-3">
          <span className="text-[12px] text-mute">Chats</span>
          <button onClick={() => store.newChat()} className="icon-btn">
            <Plus size={14} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-1.5 pb-2">
          {conversations.map((c) => (
            <button
              key={c.id}
              onClick={() => store.openChat(c.id)}
              className={clsx(
                "group flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-[13px]",
                c.id === conv.id ? "bg-raised text-fg" : "text-mute hover:bg-raised/60 hover:text-fg",
              )}
            >
              <span className="min-w-0 flex-1 truncate">{c.title}</span>
              <Trash2
                size={12}
                className="hidden shrink-0 text-faint group-hover:block hover:text-red-400"
                onClick={(e) => {
                  e.stopPropagation();
                  store.deleteChat(c.id);
                }}
              />
            </button>
          ))}
        </div>
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-9 shrink-0 items-center gap-2 border-b border-line px-3">
          <select
            value={conv.modelId}
            onChange={(e) => store.setChatModel(e.target.value)}
            className="plain bg-transparent text-[13px] text-fg outline-none"
          >
            <optgroup label="Installed" className="bg-panel">
              {readyModels.map((i) => {
                const m = MODELS.find((x) => x.id === i.modelId);
                return (
                  <option key={i.modelId} value={i.modelId} className="bg-panel">
                    {m?.name ?? i.modelId} · {i.quant}
                  </option>
                );
              })}
            </optgroup>
            <optgroup label="Catalog" className="bg-panel">
              {MODELS.filter((m) => !readyModels.some((i) => i.modelId === m.id)).map((m) => (
                <option key={m.id} value={m.id} className="bg-panel">
                  {m.name} — not installed
                </option>
              ))}
            </optgroup>
          </select>
          <span className="text-line">/</span>
          <select
            value={conv.promptId}
            onChange={(e) => store.setChatPrompt(e.target.value)}
            className="bg-transparent text-[13px] text-mute outline-none"
          >
            {prompts.map((p) => (
              <option key={p.id} value={p.id} className="bg-panel">
                {p.name}
              </option>
            ))}
          </select>
          <GradeBadge grade={compat.overallGrade} size="sm" />
          <div className="ml-auto flex items-center gap-2 text-[12px] text-mute">
            {attachedProjects[0] && (
              <span className="flex items-center gap-1">
                <FolderGit2 size={12} /> {attachedProjects[0].name}
              </span>
            )}
            {attachedRepos.length > 0 && (
              <span className="flex items-center gap-1">
                <Github size={12} /> {attachedRepos.length}
              </span>
            )}
            {liveMcp.length > 0 && (
              <span className="flex items-center gap-1">
                <Plug size={12} /> {liveMcp.length} MCP
              </span>
            )}
          </div>
        </div>

        <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto">
          {conv.messages.length === 0 ? (
            <Empty onPick={(t) => store.send(t)} modelName={model.name} />
          ) : (
            <div className="mx-auto max-w-[720px] space-y-5 px-5 py-6">
              {conv.messages.map((m) => {
                if (m.role === "tool") {
                  return (
                    <div
                      key={m.id}
                      className="flex items-center gap-2 border border-line bg-raised px-3 py-1.5 font-mono text-[11px] text-mute"
                    >
                      <span className="text-fg">{m.toolName}</span>
                      <span className="text-faint">{m.content}</span>
                      <span className="ml-auto text-faint">{m.toolStatus}</span>
                    </div>
                  );
                }
                const mine = m.role === "user";
                return (
                  <div key={m.id} className={clsx("flex", mine && "justify-end")}>
                    <div className={clsx("max-w-[640px]", mine ? "rounded-[6px] bg-raised px-3 py-2 text-[13.5px]" : "px-0")}>
                      {mine ? (
                        <div className="whitespace-pre-wrap">{m.content}</div>
                      ) : m.content ? (
                        <Markdown text={m.content} />
                      ) : (
                        <span className="inline-flex gap-1">
                          <i className="caret-blink h-1.5 w-1.5 rounded-full bg-mute" />
                          <i className="caret-blink h-1.5 w-1.5 rounded-full bg-mute [animation-delay:150ms]" />
                          <i className="caret-blink h-1.5 w-1.5 rounded-full bg-mute [animation-delay:300ms]" />
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="border-t border-line p-3">
          <div className="mx-auto max-w-[720px] border border-line bg-panel">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              rows={2}
              placeholder={`Message ${model.name}`}
              className="max-h-36 w-full resize-none bg-transparent px-3 py-2.5 text-[13.5px] outline-none placeholder:text-faint"
            />
            <div className="flex items-center justify-between px-2 pb-2">
              <span className="font-mono text-[11px] text-faint">
                {compat.recommendedQuant} · {compat.best.tokensPerSecond} tok/s
              </span>
              <button
                onClick={send}
                disabled={!draft.trim() || streaming}
                className="btn btn-primary h-7 w-7 !p-0"
              >
                {streaming ? <Square size={12} fill="currentColor" /> : <ArrowUp size={14} />}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Empty({ onPick, modelName }: { onPick: (t: string) => void; modelName: string }) {
  const chips = [
    "What can I run on this GPU?",
    "Explain the attached project",
    "Stream from the local API",
    "Add an MCP filesystem server",
  ];
  return (
    <div className="mx-auto max-w-[520px] px-5 pt-16">
      <div className="text-[15px] font-medium">{modelName}</div>
      <p className="mt-1 text-[13px] text-mute">
        Installed locally. Attach a project, repo, or MCP server from Connections if you want file context.
      </p>
      <div className="mt-5 divide-y divide-line border border-line">
        {chips.map((c) => (
          <button
            key={c}
            onClick={() => onPick(c)}
            className="block w-full px-3 py-2.5 text-left text-[13px] text-mute hover:bg-raised hover:text-fg"
          >
            {c}
          </button>
        ))}
      </div>
    </div>
  );
}
