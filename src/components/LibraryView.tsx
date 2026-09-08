import { Play, Trash2 } from "lucide-react";
import { MODELS } from "../lib/models";
import { compatibility } from "../lib/compatibility";
import { useStore } from "../lib/useStore";
import { GradeBadge } from "./GradeBadge";

export function LibraryView() {
  const store = useStore();
  const { installed, hardware } = store.state;

  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-6">
      <div className="mb-6">
        <div className="font-serif text-3xl italic">Library</div>
        <p className="mt-1 text-sm text-white/45">
          Models pulled onto this machine. Download more from Browse — Casium only offers quants
          that your hardware can actually hold.
        </p>
      </div>

      {installed.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/10 px-6 py-16 text-center text-white/40">
          Nothing installed yet.
          <button className="ml-2 text-casium" onClick={() => store.setView("browse")}>
            Browse AIs →
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {installed.map((i) => {
            const m = MODELS.find((x) => x.id === i.modelId);
            if (!m) return null;
            const c = compatibility(m, hardware);
            const q = c.quants.find((x) => x.quant === i.quant) ?? c.best;
            return (
              <div
                key={i.modelId}
                className="flex flex-wrap items-center gap-4 rounded-2xl border border-white/[0.06] bg-ink-800/50 p-4"
              >
                <GradeBadge grade={q.grade} score={q.score} />
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-white">{m.name}</div>
                  <div className="font-mono text-[11px] text-white/40">
                    {i.quant} · {q.modelSizeGb} GB · ~{q.tokensPerSecond} tok/s · {m.ollama ?? m.id}
                  </div>
                  {i.status === "downloading" && (
                    <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/10">
                      <div className="h-full bg-casium" style={{ width: `${i.progress}%` }} />
                    </div>
                  )}
                </div>
                <div className="flex gap-2">
                  <button
                    disabled={i.status !== "ready"}
                    onClick={() => store.newChat(i.modelId)}
                    className="flex items-center gap-1.5 rounded-xl bg-casium px-3 py-2 text-sm font-semibold text-ink-950 disabled:opacity-40"
                  >
                    <Play size={14} fill="currentColor" /> Chat
                  </button>
                  <button
                    onClick={() => store.removeModel(i.modelId)}
                    className="rounded-xl border border-white/10 p-2 text-white/40 hover:text-rose-400"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
