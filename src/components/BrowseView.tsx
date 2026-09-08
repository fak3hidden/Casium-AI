import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Download, Search, X } from "lucide-react";
import clsx from "clsx";
import { MODELS, PROVIDERS } from "../lib/models";
import { compatibility, gradeCounts, gradeLabel } from "../lib/compatibility";
import type { Grade, ModelSpec, Quant, Task } from "../lib/types";
import { useStore } from "../lib/useStore";
import { GradeBadge, QuantPills } from "./GradeBadge";

const TASKS: { id: Task | "all"; label: string }[] = [
  { id: "all", label: "All" },
  { id: "chat", label: "Chat" },
  { id: "code", label: "Coding" },
  { id: "reasoning", label: "Reasoning" },
  { id: "vision", label: "Vision" },
  { id: "image", label: "Image" },
  { id: "lightweight", label: "Tiny" },
];

const GRADE_FILTER: { id: "all" | "run" | "tight" | "fail"; label: string }[] = [
  { id: "all", label: "Any grade" },
  { id: "run", label: "Can run (S/A/B)" },
  { id: "tight", label: "Tight (C/D)" },
  { id: "fail", label: "Too heavy (F)" },
];

export function BrowseView() {
  const store = useStore();
  const { hardware, browseQuery, selectedModelId, installed } = store.state;
  const [task, setTask] = useState<Task | "all">("all");
  const [gradeF, setGradeF] = useState<(typeof GRADE_FILTER)[number]["id"]>("all");
  const [org, setOrg] = useState("all");
  const [sort, setSort] = useState<"score" | "params" | "new" | "vram" | "popular">("score");

  const comps = useMemo(
    () => Object.fromEntries(MODELS.map((m) => [m.id, compatibility(m, hardware)])),
    [hardware],
  );
  const counts = useMemo(() => gradeCounts(MODELS, hardware), [hardware]);

  const list = useMemo(() => {
    let rows = MODELS.filter((m) => {
      if (task !== "all" && !m.tasks.includes(task)) return false;
      if (org !== "all" && m.org !== org) return false;
      const g = comps[m.id].overallGrade;
      if (gradeF === "run" && !["S", "A", "B"].includes(g)) return false;
      if (gradeF === "tight" && !["C", "D"].includes(g)) return false;
      if (gradeF === "fail" && g !== "F") return false;
      if (browseQuery) {
        const q = browseQuery.toLowerCase();
        const blob = `${m.name} ${m.org} ${m.description} ${m.license}`.toLowerCase();
        if (!blob.includes(q)) return false;
      }
      return true;
    });
    rows = [...rows].sort((a, b) => {
      const ca = comps[a.id];
      const cb = comps[b.id];
      if (sort === "score") return cb.overallScore - ca.overallScore;
      if (sort === "params") return a.paramsB - b.paramsB;
      if (sort === "new") return b.released.localeCompare(a.released);
      if (sort === "vram") return ca.best.vramRequiredGb - cb.best.vramRequiredGb;
      return b.popularity - a.popularity;
    });
    return rows;
  }, [task, org, gradeF, browseQuery, sort, comps]);

  const selected = MODELS.find((m) => m.id === selectedModelId) ?? null;
  const comfortable = MODELS.filter((m) => ["S", "A", "B"].includes(comps[m.id].overallGrade)).length;

  return (
    <div className="flex min-h-0 flex-1">
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="border-b border-white/[0.06] px-5 py-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <div className="font-serif text-3xl italic text-white">Browse AIs</div>
              <p className="mt-1 text-sm text-white/45">
                {comfortable} of {MODELS.length} models fit comfortably on {hardware.gpuName}. Same
                S–F system as CanIRun.ai — VRAM, quantization, and estimated tok/s.
              </p>
            </div>
            <div className="flex gap-1.5">
              {(["S", "A", "B", "C", "D", "F"] as Grade[]).map((g) => (
                <div
                  key={g}
                  className={clsx(
                    "min-w-[42px] rounded-xl border px-2 py-1 text-center",
                    `grade-${g}`,
                  )}
                >
                  <div className="font-serif text-lg leading-none">{g}</div>
                  <div className="font-mono text-[10px] opacity-80">{counts[g]}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <label className="flex min-w-[220px] flex-1 items-center gap-2 rounded-xl border border-white/[0.07] bg-white/[0.03] px-3 py-2">
              <Search size={14} className="text-white/35" />
              <input
                value={browseQuery}
                onChange={(e) => store.setBrowseQuery(e.target.value)}
                placeholder="Search models, labs, licenses…"
                className="w-full bg-transparent text-sm outline-none placeholder:text-white/30"
              />
            </label>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as typeof sort)}
              className="field !w-auto !py-2"
            >
              <option value="score">Sort by score</option>
              <option value="popular">Popularity</option>
              <option value="params">Smallest first</option>
              <option value="vram">Lowest VRAM</option>
              <option value="new">Newest</option>
            </select>
          </div>

          <div className="mt-3 flex flex-wrap gap-1.5">
            {TASKS.map((t) => (
              <Chip key={t.id} active={task === t.id} onClick={() => setTask(t.id)}>
                {t.label}
              </Chip>
            ))}
            <span className="mx-1 h-5 w-px bg-white/10" />
            {GRADE_FILTER.map((g) => (
              <Chip key={g.id} active={gradeF === g.id} onClick={() => setGradeF(g.id)}>
                {g.label}
              </Chip>
            ))}
            <select
              value={org}
              onChange={(e) => setOrg(e.target.value)}
              className="ml-1 rounded-full border border-white/10 bg-transparent px-2 py-1 text-[12px] outline-none"
            >
              <option value="all" className="bg-ink-800">
                All labs
              </option>
              {PROVIDERS.map((p) => (
                <option key={p} value={p} className="bg-ink-800">
                  {p}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
            {list.map((m) => {
              const c = comps[m.id];
              const inst = installed.find((i) => i.modelId === m.id);
              return (
                <button
                  key={m.id}
                  onClick={() => store.selectModel(m.id)}
                  className={clsx(
                    "rounded-2xl border p-4 text-left transition hover:border-white/15 hover:bg-white/[0.03]",
                    selectedModelId === m.id
                      ? "border-casium/40 bg-casium/[0.04]"
                      : "border-white/[0.06] bg-ink-800/40",
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-[11px] uppercase tracking-[0.16em] text-white/35">
                        {m.org} · {fmtParams(m.paramsB)}
                        {m.architecture === "moe" ? " MoE" : ""}
                      </div>
                      <div className="mt-0.5 text-base font-semibold text-white">{m.name}</div>
                    </div>
                    <GradeBadge grade={c.overallGrade} score={c.overallScore} />
                  </div>
                  <p className="mt-2 line-clamp-2 text-[13px] leading-relaxed text-white/50">
                    {m.description}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-1.5 font-mono text-[10px] text-white/40">
                    <span>{c.best.vramRequiredGb} GB</span>
                    <span>·</span>
                    <span>{m.contextK}K ctx</span>
                    <span>·</span>
                    <span>~{c.best.tokensPerSecond} tok/s</span>
                    <span>·</span>
                    <span>{m.license}</span>
                  </div>
                  <div className="mt-3">
                    <QuantPills items={c.quants.map((q) => ({ quant: q.quant, grade: q.grade }))} />
                  </div>
                  {inst && (
                    <div className="mt-3 text-[11px] text-casium">
                      {inst.status === "ready"
                        ? `Installed · ${inst.quant}`
                        : `Downloading ${inst.progress}%`}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
          {list.length === 0 && (
            <div className="py-20 text-center text-white/40">No models match those filters.</div>
          )}
        </div>
      </div>

      {selected && (
        <ModelDrawer
          model={selected}
          onClose={() => store.selectModel(null)}
        />
      )}
    </div>
  );
}

function ModelDrawer({ model, onClose }: { model: ModelSpec; onClose: () => void }) {
  const store = useStore();
  const { hardware, installed } = store.state;
  const c = compatibility(model, hardware);
  const [quant, setQuant] = useState<Quant>(c.recommendedQuant);
  const q = c.quants.find((x) => x.quant === quant) ?? c.best;
  const inst = installed.find((i) => i.modelId === model.id);

  return (
    <aside className="flex w-full max-w-[420px] shrink-0 flex-col border-l border-white/[0.06] bg-ink-900/80">
      <div className="flex items-start justify-between px-5 pt-5">
        <div>
          <div className="text-[11px] uppercase tracking-[0.16em] text-white/35">
            {model.org} · {model.released}
          </div>
          <div className="font-serif text-2xl italic text-white">{model.name}</div>
        </div>
        <button onClick={onClose} className="rounded-lg p-1 text-white/40 hover:bg-white/5">
          <X size={16} />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        <div className="flex items-center gap-3">
          <GradeBadge grade={q.grade} score={q.score} size="lg" showLabel />
        </div>
        <p className="mt-4 text-sm leading-relaxed text-white/60">{model.description}</p>

        <dl className="mt-5 grid grid-cols-2 gap-2 text-[12px]">
          <Stat k="Parameters" v={fmtParams(model.paramsB)} />
          {model.activeParamsB && <Stat k="Active" v={fmtParams(model.activeParamsB)} />}
          <Stat k="Architecture" v={model.architecture} />
          <Stat k="Context" v={`${model.contextK}K`} />
          <Stat k="License" v={model.license} />
          <Stat k="Ollama" v={model.ollama ?? "—"} />
        </dl>

        <div className="mt-5 text-[11px] uppercase tracking-[0.16em] text-white/35">
          Quantization vs your {hardware.gpuName}
        </div>
        <div className="mt-2 overflow-hidden rounded-xl border border-white/[0.07]">
          <table className="w-full text-left text-[12px]">
            <thead className="bg-white/[0.03] font-mono text-[10px] uppercase text-white/40">
              <tr>
                <th className="px-3 py-2">Quant</th>
                <th>VRAM</th>
                <th>tok/s</th>
                <th>Grade</th>
              </tr>
            </thead>
            <tbody>
              {c.quants.map((row) => (
                <tr
                  key={row.quant}
                  onClick={() => setQuant(row.quant)}
                  className={clsx(
                    "cursor-pointer border-t border-white/[0.05] hover:bg-white/[0.03]",
                    row.quant === quant && "bg-casium/[0.06]",
                  )}
                >
                  <td className="px-3 py-2 font-mono text-white/80">{row.quant}</td>
                  <td>{row.vramRequiredGb} GB</td>
                  <td>~{row.tokensPerSecond}</td>
                  <td className="py-2">
                    <GradeBadge grade={row.grade} size="sm" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <ul className="mt-4 space-y-1.5 text-[12px] text-white/50">
          {q.notes.map((n) => (
            <li key={n}>· {n}</li>
          ))}
        </ul>
        <p className="mt-3 text-[11px] leading-relaxed text-white/30">
          tok/s ≈ memory bandwidth ÷ model size × efficiency. VRAM includes weights, a 4K KV cache,
          and runtime overhead — the same approach CanIRun.ai uses.
        </p>
      </div>
      <div className="border-t border-white/[0.06] p-4">
        {inst?.status === "downloading" ? (
          <div>
            <div className="mb-2 flex justify-between text-[12px] text-white/50">
              <span>Fetching {quant} weights…</span>
              <span className="font-mono">{inst.progress}%</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
              <div className="h-full bg-casium" style={{ width: `${inst.progress}%` }} />
            </div>
          </div>
        ) : (
          <button
            onClick={() => store.download(model.id, quant)}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-casium py-3 text-sm font-semibold text-ink-950 hover:brightness-110"
          >
            <Download size={16} />
            {inst?.status === "ready" ? `Reinstall ${quant}` : `Download ${quant}`}
            <span className="font-mono text-[11px] opacity-70">{q.modelSizeGb} GB</span>
          </button>
        )}
        <div className="mt-2 text-center text-[11px] text-white/30">
          Recommended: {c.recommendedQuant} · {gradeLabel(c.best.grade)}
        </div>
      </div>
    </aside>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        "rounded-full border px-3 py-1 text-[12px] transition",
        active
          ? "border-casium/40 bg-casium/10 text-casium"
          : "border-white/10 text-white/50 hover:text-white/80",
      )}
    >
      {children}
    </button>
  );
}

function Stat({ k, v }: { k: string; v: string }) {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] px-3 py-2">
      <div className="text-[10px] uppercase tracking-wider text-white/35">{k}</div>
      <div className="mt-0.5 text-white/85">{v}</div>
    </div>
  );
}

function fmtParams(n: number) {
  if (n < 1) return `${Math.round(n * 1000)}M`;
  const v = n >= 10 ? n.toFixed(0) : n.toFixed(1);
  return `${v}B`;
}

