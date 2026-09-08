import { gradeColor, gradeLabel } from "../lib/compatibility";
import type { Grade } from "../lib/types";
import clsx from "clsx";

export function GradeBadge({
  grade,
  score,
  size = "md",
  showLabel = false,
}: {
  grade: Grade;
  score?: number;
  size?: "sm" | "md" | "lg";
  showLabel?: boolean;
}) {
  const dim =
    size === "lg"
      ? "h-12 w-12 text-[22px]"
      : size === "sm"
        ? "h-6 w-6 text-[11px]"
        : "h-8 w-8 text-sm";
  return (
    <div className="inline-flex items-center gap-2">
      <span
        className={clsx(
          "inline-flex items-center justify-center rounded-lg border font-semibold tracking-tight",
          dim,
          `grade-${grade}`,
        )}
        style={{ boxShadow: `0 0 18px ${gradeColor(grade)}22` }}
        title={gradeLabel(grade)}
      >
        {grade}
      </span>
      {showLabel && (
        <div className="leading-tight">
          <div className="text-xs font-medium text-white/85">{gradeLabel(grade)}</div>
          {score != null && (
            <div className="font-mono text-[10px] text-white/40">{score}/100</div>
          )}
        </div>
      )}
    </div>
  );
}

export function QuantPills({
  items,
  active,
  onPick,
}: {
  items: { quant: string; grade: Grade }[];
  active?: string;
  onPick?: (q: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1">
      {items.map((q) => (
        <button
          key={q.quant}
          type="button"
          onClick={() => onPick?.(q.quant)}
          className={clsx(
            "rounded-md border px-1.5 py-0.5 font-mono text-[10px] transition",
            `grade-${q.grade}`,
            active === q.quant && "ring-1 ring-white/40",
          )}
        >
          {q.quant}
        </button>
      ))}
    </div>
  );
}
