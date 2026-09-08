import { useMemo, useState } from "react";
import { Download, Search, X } from "lucide-react";
import clsx from "clsx";
import { MODELS, PROVIDERS } from "../lib/models";
import { compatibility, gradeCounts, gradeLabel } from "../lib/compatibility";
import type { Grade, ModelSpec, Quant, Task } from "../lib/types";
import { useStore } from "../lib/useStore";
import { GradeBadge } from "./GradeBadge";

const TASKS: { id: Task | "all"; label: string }[] = [
  { id: "all", label: "All" },
  { id: "chat", label: "Chat" },
  { id: "code", label: "Code" },
  { id: "reasoning", label: "Reasoning" },
  { id: "vision", label: "Vision" },
  { id: "image", label: "Image" },
  { id: "lightweight", label: "Tiny" },
];

export function BrowseView() {
  const store = useStore();
  const { hardware, browseQuery, selectedModelId, installed } = store.state;
  const [task, setTask] = useState<Task | "all">("all");
  const [gradeF, setGradeF] = useState<"all" | "run" | "tight" | "fail">("all");
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
        if (!`${m.name} ${m.org} ${m.description} ${m.license}`.toLowerCase().includes(q)) return false;
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
        <div className="border-b border-line px-4 py-3">
          <div className="flex items-baseline justify-between gap-3">
            <div>
              <h1 className="text-[15px] font-medium">Browse</h1>
              <p className="mt-0.5 text-[12px] text-mute">
                {comfortable}/{MODELS.length} fit {hardware.gpuName} at Q4
              </p>
            </div>
            <div className="flex gap-px overflow-hidden rounded border border-line">
              {(["S", "A", "B", "C", "D", "F"] as Grade[]).map((g) => (
                <div key={g} className={clsx("w-9 py-1 text-center", `grade-${g}`)}>
                  <div className="text-[12px] font-medium leading-none">{g}</div>
                  <div className="font-mono text-[10px] opacity-70">{counts[g]}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <label className="flex h-8 min-w-[200px] flex-1 items-center gap-2 border border-line bg-bg px-2">
              <Search size={13} className="text-faint" />
              <input
                value={browseQuery}
                onChange={(e) => store.setBrowseQuery(e.target.value)}
                placeholder="Filter models"
                className="w-full bg-transparent text-[13px] outline-none placeholder:text-faint"
              />
            </label>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as typeof sort)}
              className="field !h-8 !w-auto"
            >
              <option value="score">Score</option>
              <option value="popular">Popular</option>
              <option value="params">Smallest</option>
              <option value="vram">VRAM</option>
              <option value="new">Newest</option>
            </select>
            <select value={org} onChange={(e) => setOrg(e.target.value)} className="field !h-8 !w-auto">
              <option value="all">All labs</option>
              {PROVIDERS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>

          <div className="mt-2 flex flex-wrap gap-1">
            {TASKS.map((t) => (
              <Tab key={t.id} active={task === t.id} onClick={() => setTask(t.id)}>
                {t.label}
              </Tab>
            ))}
            <span className="mx-1 w-px self-stretch bg-line" />
            <Tab active={gradeF === "all"} onClick={() => setGradeF("all")}>
              Any
            </Tab>
            <Tab active={gradeF === "run"} onClick={() => setGradeF("run")}>
              Can run
            </Tab>
            <Tab active={gradeF === "tight"} onClick={() => setGradeF("tight")}>
              Tight
            </Tab>
            <Tab active={gradeF === "fail"} onClick={() => setGradeF("fail")}>
              Too heavy
            </Tab>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-auto">
          <table className="data">
            <thead className="sticky top-0 bg-bg">
              <tr>
                <th className="w-12">Fit</th>
                <th>Model</th>
                <th>Lab</th>
                <th>Params</th>
                <th>VRAM</th>
                <th>Speed</th>
                <th>Quant</th>
                <th>License</th>
              </tr>
            </thead>
            <tbody>
              {list.map((m) => {
                const c = comps[m.id];
                const inst = installed.find((i) => i.modelId === m.id);
                return (
                  <tr
                    key={m.id}
                    onClick={() => store.selectModel(m.id)}
                    className={clsx(selectedModelId === m.id && "active")}
                  >
                    <td>
                      <GradeBadge grade={c.overallGrade} size="sm" />
                    </td>
                    <td>
                      <div className="text-fg">{m.name}</div>
                      {inst && (
                        <div className="text-[11px] text-mute">
                          {inst.status === "ready" ? `Installed ${inst.quant}` : `${inst.progress}%`}
                        </div>
                      )}
                    </td>
                    <td className="text-mute">{m.org}</td>
                    <td className="font-mono text-[12px] text-mute">
                      {fmtParams(m.paramsB)}
                      {m.architecture === "moe" ? " MoE" : ""}
                    </td>
                    <td className="font-mono text-[12px]">{c.best.vramRequiredGb} GB</td>
                    <td className="font-mono text-[12px] text-mute">~{c.best.tokensPerSecond}</td>
                    <td className="font-mono text-[11px] text-mute">{c.recommendedQuant}</td>
                    <td className="text-[12px] text-mute">{m.license}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {list.length === 0 && (
            <div className="py-16 text-center text-mute">No models match.</div>
          )}
        </div>
      </div>

      {selected && <ModelDrawer model={selected} onClose={() => store.selectModel(null)} />}
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
    <aside className="flex w-[360px] shrink-0 flex-col border-l border-line bg-panel">
      <div className="flex items-start justify-between gap-3 border-b border-line px-4 py-3">
        <div>
          <div className="text-[12px] text-mute">
            {model.org} · {model.released}
          </div>
          <div className="text-[15px] font-medium">{model.name}</div>
        </div>
        <button onClick={onClose} className="icon-btn">
          <X size={14} />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        <GradeBadge grade={q.grade} score={q.score} showLabel />
        <p className="mt-3 text-[13px] text-mute">{model.description}</p>

        <dl className="mt-4 grid grid-cols-2 gap-px overflow-hidden border border-line bg-line text-[12px]">
          <Stat k="Parameters" v={fmtParams(model.paramsB)} />
          {model.activeParamsB && <Stat k="Active" v={fmtParams(model.activeParamsB)} />}
          <Stat k="Arch" v={model.architecture} />
          <Stat k="Context" v={`${model.contextK}K`} />
          <Stat k="License" v={model.license} />
          <Stat k="Tag" v={model.ollama ?? "—"} />
        </dl>

        <div className="mt-4 text-[12px] text-mute">Quants on {hardware.gpuName}</div>
        <table className="data mt-1">
          <thead>
            <tr>
              <th>Quant</th>
              <th>VRAM</th>
              <th>tok/s</th>
              <th>Fit</th>
            </tr>
          </thead>
          <tbody>
            {c.quants.map((row) => (
              <tr
                key={row.quant}
                onClick={() => setQuant(row.quant)}
                className={clsx(row.quant === quant && "active")}
              >
                <td className="font-mono text-[12px]">{row.quant}</td>
                <td className="font-mono text-[12px]">{row.vramRequiredGb} GB</td>
                <td className="font-mono text-[12px]">~{row.tokensPerSecond}</td>
                <td>
                  <GradeBadge grade={row.grade} size="sm" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <ul className="mt-3 space-y-1 text-[12px] text-mute">
          {q.notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
        <p className="mt-3 text-[11px] leading-relaxed text-faint">
          tok/s ≈ bandwidth ÷ working set × efficiency. VRAM includes weights, 4K KV cache, and
          runtime overhead.
        </p>
      </div>
      <div className="border-t border-line p-3">
        {inst?.status === "downloading" ? (
          <div>
            <div className="mb-1.5 flex justify-between text-[12px] text-mute">
              <span>Downloading {quant}</span>
              <span className="font-mono">{inst.progress}%</span>
            </div>
            <div className="h-1 bg-raised">
              <div className="h-full bg-fg" style={{ width: `${inst.progress}%` }} />
            </div>
          </div>
        ) : (
          <button onClick={() => store.download(model.id, quant)} className="btn btn-primary w-full">
            <Download size={14} />
            {inst?.status === "ready" ? `Reinstall ${quant}` : `Download ${quant}`}
            <span className="font-mono text-[11px] opacity-60">{q.modelSizeGb} GB</span>
          </button>
        )}
        <div className="mt-2 text-center text-[11px] text-faint">
          Recommended {c.recommendedQuant} · {gradeLabel(c.best.grade)}
        </div>
      </div>
    </aside>
  );
}

function Tab({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: string;
}) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        "h-6 px-2 text-[12px]",
        active ? "bg-raised text-fg" : "text-mute hover:text-fg",
      )}
    >
      {children}
    </button>
  );
}

function Stat({ k, v }: { k: string; v: string }) {
  return (
    <div className="bg-panel px-2.5 py-2">
      <div className="text-[11px] text-faint">{k}</div>
      <div className="truncate text-fg">{v}</div>
    </div>
  );
}

function fmtParams(n: number) {
  if (n < 1) return `${Math.round(n * 1000)}M`;
  return `${n >= 10 ? n.toFixed(0) : n.toFixed(1)}B`;
}
