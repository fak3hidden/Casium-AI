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
      name: "Untitled",
      description: "Custom instructions",
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
      <div className="w-[240px] shrink-0 overflow-y-auto border-r border-line">
        <div className="flex h-9 items-center justify-between px-3">
          <span className="text-[12px] text-mute">Instructions</span>
          <button onClick={startNew} className="icon-btn">
            <Plus size={14} />
          </button>
        </div>
        <div className="px-1.5 pb-2">
          {prompts.map((item) => (
            <button
              key={item.id}
              onClick={() => {
                setDraft(null);
                setActive(item.id);
              }}
              className={clsx(
                "mb-px w-full rounded-md px-2 py-1.5 text-left",
                editing.id === item.id ? "bg-raised" : "hover:bg-raised/60",
              )}
            >
              <div className="text-[13px]">{item.name}</div>
              <div className="truncate text-[11px] text-mute">{item.description}</div>
            </button>
          ))}
          {draft && !prompts.some((x) => x.id === draft.id) && (
            <div className="px-2 py-1.5 text-[13px] text-mute">Untitled (draft)</div>
          )}
        </div>
      </div>

      <div className="min-w-0 flex-1 overflow-y-auto p-5">
        <div className="mx-auto max-w-[640px]">
          <input
            className="w-full bg-transparent text-[15px] font-medium outline-none"
            value={editing.name}
            onChange={(e) => setDraft({ ...editing, name: e.target.value, updatedAt: Date.now() })}
          />
          <input
            className="mt-1 w-full bg-transparent text-[13px] text-mute outline-none"
            value={editing.description}
            onChange={(e) =>
              setDraft({ ...editing, description: e.target.value, updatedAt: Date.now() })
            }
          />
          <textarea
            className="field mt-4 min-h-[340px] font-mono text-[12.5px] leading-relaxed"
            value={editing.body}
            onChange={(e) => setDraft({ ...editing, body: e.target.value, updatedAt: Date.now() })}
          />
          <div className="mt-3 flex items-center gap-2">
            <button
              onClick={() => {
                store.savePrompt({ ...editing, updatedAt: Date.now() });
                setDraft(null);
                setActive(editing.id);
              }}
              className="btn btn-primary"
            >
              Save
            </button>
            {!editing.builtin && (
              <button
                onClick={() => {
                  store.deletePrompt(editing.id);
                  setDraft(null);
                  setActive(store.state.prompts[0]?.id);
                }}
                className="btn btn-ghost text-red-400"
              >
                <Trash2 size={13} /> Delete
              </button>
            )}
            <span className="ml-auto text-[12px] text-faint">Pinned per chat from the top bar</span>
          </div>
        </div>
      </div>
    </div>
  );
}
