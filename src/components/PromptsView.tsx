import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import clsx from "clsx";
import { uid } from "../lib/engine";
import { useStore } from "../lib/useStore";
import type { PromptTemplate } from "../lib/types";

export function PromptsView() {
  const store = useStore();
  const { prompts } = store.state;
  const [active, setActive] = useState<string>(prompts[0]?.id);
  const p = prompts.find((x) => x.id === active) ?? prompts[0];
  const [draft, setDraft] = useState<PromptTemplate | null>(null);
  const editing = draft ?? p;

  const startNew = () => {
    const n: PromptTemplate = {
      id: uid("prompt"),
      name: "Untitled prompt",
      description: "Custom instructions for local models.",
      body: "You are…",
      tags: ["custom"],
      updatedAt: Date.now(),
    };
    setDraft(n);
    setActive(n.id);
  };

  if (!editing) return null;

  return (
    <div className="flex min-h-0 flex-1">
      <div className="w-[280px] shrink-0 overflow-y-auto border-r border-white/[0.06] p-3">
        <div className="mb-3 flex items-center justify-between px-1">
          <div className="text-[11px] uppercase tracking-[0.18em] text-white/35">Instructions</div>
          <button onClick={startNew} className="rounded-lg p-1 text-casium hover:bg-white/5">
            <Plus size={14} />
          </button>
        </div>
        {prompts.map((item) => (
          <button
            key={item.id}
            onClick={() => {
              setDraft(null);
              setActive(item.id);
            }}
            className={clsx(
              "mb-1 w-full rounded-xl px-3 py-2.5 text-left",
              editing.id === item.id ? "bg-white/[0.06]" : "hover:bg-white/[0.03]",
            )}
          >
            <div className="text-sm text-white">{item.name}</div>
            <div className="truncate text-[11px] text-white/35">{item.description}</div>
          </button>
        ))}
        {draft && !prompts.some((x) => x.id === draft.id) && (
          <div className="rounded-xl bg-casium/10 px-3 py-2.5 text-sm text-casium">New draft</div>
        )}
      </div>

      <div className="min-w-0 flex-1 overflow-y-auto p-6">
        <div className="mx-auto max-w-2xl">
          <input
            className="w-full bg-transparent font-serif text-3xl italic text-white outline-none"
            value={editing.name}
            onChange={(e) => setDraft({ ...editing, name: e.target.value, updatedAt: Date.now() })}
          />
          <input
            className="mt-2 w-full bg-transparent text-sm text-white/45 outline-none"
            value={editing.description}
            onChange={(e) =>
              setDraft({ ...editing, description: e.target.value, updatedAt: Date.now() })
            }
          />
          <div className="mt-2 flex flex-wrap gap-1">
            {editing.tags.map((t) => (
              <span key={t} className="rounded-full border border-white/10 px-2 py-0.5 text-[11px] text-white/40">
                {t}
              </span>
            ))}
          </div>
          <textarea
            className="field mt-5 min-h-[320px] font-mono text-[13px] leading-relaxed"
            value={editing.body}
            onChange={(e) => setDraft({ ...editing, body: e.target.value, updatedAt: Date.now() })}
          />
          <div className="mt-4 flex items-center gap-2">
            <button
              onClick={() => {
                store.savePrompt({ ...editing, updatedAt: Date.now() });
                setDraft(null);
                setActive(editing.id);
              }}
              className="rounded-xl bg-casium px-4 py-2 text-sm font-semibold text-ink-950"
            >
              Save instructions
            </button>
            {!editing.builtin && (
              <button
                onClick={() => {
                  store.deletePrompt(editing.id);
                  setDraft(null);
                  setActive(store.state.prompts[0]?.id);
                }}
                className="flex items-center gap-1 px-3 py-2 text-sm text-white/40 hover:text-rose-400"
              >
                <Trash2 size={14} /> Delete
              </button>
            )}
            <span className="ml-auto text-[11px] text-white/30">
              Pin a prompt on any chat from the top bar.
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
