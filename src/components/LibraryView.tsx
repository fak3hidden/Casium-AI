import { Trash2 } from "lucide-react";
import { MODELS } from "../lib/models";
import { compatibility } from "../lib/compatibility";
import { useStore } from "../lib/useStore";
import { GradeBadge } from "./GradeBadge";

export function LibraryView() {
  const store = useStore();
  const { installed, hardware } = store.state;

  return (
    <div className="min-h-0 flex-1 overflow-auto">
      <div className="border-b border-line px-4 py-3">
        <h1 className="text-[15px] font-medium">Library</h1>
        <p className="mt-0.5 text-[12px] text-mute">
          Models on this machine. Pull others from Browse.
        </p>
      </div>

      {installed.length === 0 ? (
        <div className="px-4 py-16 text-center text-mute">
          Nothing installed.
          <button className="ml-2 text-fg underline" onClick={() => store.setView("browse")}>
            Browse
          </button>
        </div>
      ) : (
        <table className="data">
          <thead>
            <tr>
              <th>Fit</th>
              <th>Model</th>
              <th>Quant</th>
              <th>Size</th>
              <th>Speed</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {installed.map((i) => {
              const m = MODELS.find((x) => x.id === i.modelId);
              if (!m) return null;
              const c = compatibility(m, hardware);
              const q = c.quants.find((x) => x.quant === i.quant) ?? c.best;
              return (
                <tr key={i.modelId} onClick={() => i.status === "ready" && store.newChat(i.modelId)}>
                  <td>
                    <GradeBadge grade={q.grade} size="sm" />
                  </td>
                  <td>
                    <div>{m.name}</div>
                    <div className="font-mono text-[11px] text-faint">{m.ollama ?? m.id}</div>
                  </td>
                  <td className="font-mono text-[12px]">{i.quant}</td>
                  <td className="font-mono text-[12px] text-mute">{q.modelSizeGb} GB</td>
                  <td className="font-mono text-[12px] text-mute">~{q.tokensPerSecond}</td>
                  <td className="text-mute">
                    {i.status === "downloading" ? (
                      <span className="font-mono">{i.progress}%</span>
                    ) : (
                      "Ready"
                    )}
                  </td>
                  <td className="text-right">
                    <button
                      className="icon-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        store.removeModel(i.modelId);
                      }}
                    >
                      <Trash2 size={13} />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
