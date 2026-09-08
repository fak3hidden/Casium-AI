import { gradeLabel } from "../lib/compatibility";
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
    size === "lg" ? "h-8 w-8 text-[15px]" : size === "sm" ? "h-5 w-5 text-[10px]" : "h-6 w-6 text-[12px]";
  return (
    <div className="inline-flex items-center gap-2">
      <span
        className={clsx(
          "inline-flex items-center justify-center rounded font-medium",
          dim,
          `grade-${grade}`,
        )}
        title={gradeLabel(grade)}
      >
        {grade}
      </span>
      {showLabel && (
        <div className="leading-tight">
          <div className="text-[13px] text-fg">{gradeLabel(grade)}</div>
          {score != null && <div className="font-mono text-[11px] text-mute">{score}/100</div>}
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
            "rounded px-1.5 py-0.5 font-mono text-[10px]",
            `grade-${q.grade}`,
            active === q.quant && "outline outline-1 outline-fg/40",
          )}
        >
          {q.quant}
        </button>
      ))}
    </div>
  );
}
