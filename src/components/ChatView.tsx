import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowUp,
  ChevronDown,
  FolderGit2,
  Github,
  Plug,
  Plus,
  Sparkles,
  Square,
  Trash2,
  Wrench,
} from "lucide-react";
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
      <div className="hidden w-[260px] shrink-0 flex-col border-r border-white/[0.06] bg-ink-900/40 md:flex">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="text-[11px] uppercase tracking-[0.18em] text-white/35">Chats</div>
          <button
            onClick={() => store.newChat()}
            className="rounded-lg p-1 text-white/50 hover:bg-white/5 hover:text-white"
          >
            <Plus size={14} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
          {conversations.map((c) => (
            <button
              key={c.id}
              onClick={() => store.openChat(c.id)}
              className={clsx(
                "group mb-0.5 flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm",
                c.id === conv.id ? "bg-white/[0.06] text-white" : "text-white/55 hover:bg-white/[0.03]",
              )}
            >
              <span className="min-w-0 flex-1 truncate">{c.title}</span>
              <Trash2
                size={12}
                className="hidden shrink-0 text-white/30 group-hover:block hover:text-rose-400"
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
        <div className="flex flex-wrap items-center gap-2 border-b border-white/[0.06] px-4 py-2.5">
          <label className="flex items-center gap-2 rounded-xl border border-white/[0.07] bg-white/[0.03] px-2.5 py-1.5 text-sm">
            <Sparkles size={14} className="text-casium" />
            <select
              value={conv.modelId}
              onChange={(e) => store.setChatModel(e.target.value)}
              className="bg-transparent pr-1 outline-none"
            >
              <optgroup label="Installed" className="bg-ink-800">
                {readyModels.map((i) => {
                  const m = MODELS.find((x) => x.id === i.modelId);
                  return (
                    <option key={i.modelId} value={i.modelId} className="bg-ink-800">
                      {m?.name ?? i.modelId} · {i.quant}
                    </option>
                  );
                })}
              </optgroup>
              <optgroup label="Catalog" className="bg-ink-800">
                {MODELS.filter((m) => !readyModels.some((i) => i.modelId === m.id)).map((m) => (
                  <option key={m.id} value={m.id} className="bg-ink-800">
                    {m.name} (not installed)
                  </option>
                ))}
              </optgroup>
            </select>
            <ChevronDown size={12} className="text-white/30" />
          </label>

          <label className="flex items-center gap-2 rounded-xl border border-white/[0.07] bg-white/[0.03] px-2.5 py-1.5 text-sm text-white/70">
            <span className="text-[11px] uppercase tracking-wider text-white/35">Prompt</span>
            <select
              value={conv.promptId}
              onChange={(e) => store.setChatPrompt(e.target.value)}
              className="bg-transparent outline-none"
            >
              {prompts.map((p) => (
                <option key={p.id} value={p.id} className="bg-ink-800">
                  {p.name}
                </option>
              ))}
            </select>
          </label>

          <GradeBadge grade={compat.overallGrade} score={compat.overallScore} size="sm" />

          <div className="ml-auto flex items-center gap-1.5 text-[11px] text-white/40">
            {attachedProjects.length > 0 && (
              <span className="flex items-center gap-1 rounded-full border border-white/10 px-2 py-0.5">
                <FolderGit2 size={11} /> {attachedProjects[0].name}
              </span>
            )}
            {attachedRepos.length > 0 && (
              <span className="flex items-center gap-1 rounded-full border border-white/10 px-2 py-0.5">
                <Github size={11} /> {attachedRepos.length}
              </span>
            )}
            {liveMcp.length > 0 && (
              <span className="flex items-center gap-1 rounded-full border border-casium/20 bg-casium/10 px-2 py-0.5 text-casium">
                <Plug size={11} /> {liveMcp.length} MCP
              </span>
            )}
          </div>
        </div>

        <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto">
          {conv.messages.length === 0 ? (
            <Empty onPick={(t) => store.send(t)} modelName={model.name} />
          ) : (
            <div className="mx-auto max-w-3xl space-y-5 px-5 py-8">
              {conv.messages.map((m) => {
                if (m.role === "tool") {
                  return (
                    <div
                      key={m.id}
                      className="flex items-center gap-2 rounded-xl border border-white/[0.06] bg-white/[0.03] px-3 py-2 font-mono text-[11px] text-white/55"
                    >
                      <Wrench size={12} className="text-casium" />
                      <span className="text-white/80">{m.toolName}</span>
                      <span className="text-white/30">·</span>
                      <span>{m.content}</span>
                      <span
                        className={clsx(
                          "ml-auto rounded-full px-1.5 py-0.5 text-[10px]",
                          m.toolStatus === "done" ? "bg-casium/15 text-casium" : "bg-amber-400/15 text-amber-300",
                        )}
                      >
                        {m.toolStatus}
                      </span>
                    </div>
                  );
                }
                const mine = m.role === "user";
                return (
                  <div key={m.id} className={clsx("flex", mine && "justify-end")}>
                    <div
                      className={clsx(
                        "max-w-[min(100%,640px)] rounded-2xl px-4 py-3",
                        mine
                          ? "bg-white/[0.07] text-[14.5px] text-white/90"
                          : "bg-transparent px-0",
                      )}
                    >
                      {mine ? (
                        <div className="whitespace-pre-wrap leading-relaxed">{m.content}</div>
                      ) : m.content ? (
                        <Markdown text={m.content} />
                      ) : (
                        <span className="inline-flex gap-1">
                          <i className="caret-blink h-1.5 w-1.5 rounded-full bg-casium" />
                          <i className="caret-blink h-1.5 w-1.5 rounded-full bg-casium [animation-delay:150ms]" />
                          <i className="caret-blink h-1.5 w-1.5 rounded-full bg-casium [animation-delay:300ms]" />
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="px-4 pb-4 pt-2">
          <div className="mx-auto max-w-3xl rounded-2xl border border-white/[0.08] bg-ink-800/80 p-2 shadow-panel hairline">
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
              placeholder={`Message ${model.name}…`}
              className="max-h-40 w-full resize-none bg-transparent px-3 py-2 text-[15px] text-white/90 outline-none placeholder:text-white/30"
            />
            <div className="flex items-center justify-between px-2 pb-1">
              <div className="font-mono text-[10px] text-white/30">
                {compat.recommendedQuant} · ~{compat.best.tokensPerSecond} tok/s · Enter to send
              </div>
              <button
                onClick={send}
                disabled={!draft.trim() || streaming}
                className="flex h-9 w-9 items-center justify-center rounded-xl bg-casium text-ink-950 transition hover:brightness-110 disabled:opacity-30"
              >
                {streaming ? <Square size={14} fill="currentColor" /> : <ArrowUp size={16} />}
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
    "Attach my VS project and explain the architecture",
    "Write a function that streams from the local API",
    "How do I add an MCP filesystem server?",
  ];
  return (
    <div className="mx-auto flex max-w-2xl flex-col items-center px-6 py-16 text-center">
      <div className="mb-5 font-serif text-4xl italic text-white/90 sm:text-5xl">
        Think locally.
      </div>
      <p className="max-w-md text-sm leading-relaxed text-white/45">
        {modelName} is selected. Casium grades every model against your hardware, then lets you
        wire it to GitHub, VS Code, MCP tools, and custom instructions.
      </p>
      <div className="mt-8 grid w-full gap-2 sm:grid-cols-2">
        {chips.map((c) => (
          <button
            key={c}
            onClick={() => onPick(c)}
            className="rounded-2xl border border-white/[0.07] bg-white/[0.03] px-4 py-3 text-left text-sm text-white/70 transition hover:border-casium/30 hover:bg-white/[0.05] hover:text-white"
          >
            {c}
          </button>
        ))}
      </div>
    </div>
  );
}
