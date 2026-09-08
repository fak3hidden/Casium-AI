import { GPUS } from "../lib/gpus";
import { useStore } from "../lib/useStore";

export function HardwareBar() {
  const store = useStore();
  const hw = store.state.hardware;

  return (
    <div className="flex h-9 shrink-0 items-center gap-3 border-b border-line bg-panel px-3 text-[12px] text-mute">
      <span className="text-faint">{hw.detected ? "Detected" : "Manual"}</span>
      <select
        value={hw.gpuId}
        onChange={(e) => store.pickGpu(e.target.value)}
        className="plain max-w-[200px] bg-transparent text-fg outline-none"
      >
        {GPUS.map((g) => (
          <option key={g.id} value={g.id} className="bg-panel">
            {g.name}
            {g.vramGb ? ` ${g.vramGb}GB` : ""}
          </option>
        ))}
      </select>
      <Sep />
      <span className="font-mono text-fg">{hw.vramGb} GB</span>
      <span>VRAM</span>
      <Sep />
      <span className="font-mono text-fg">{hw.bandwidthGBs}</span>
      <span>GB/s</span>
      <Sep />
      <select
        value={hw.ramGb}
        onChange={(e) => store.setHardware({ ...hw, ramGb: Number(e.target.value) })}
        className="plain bg-transparent text-fg outline-none"
      >
        {[8, 16, 24, 32, 48, 64, 96, 128, 192, 256].map((n) => (
          <option key={n} value={n} className="bg-panel">
            {n} GB RAM
          </option>
        ))}
      </select>
      <Sep />
      <span className="font-mono text-fg">{hw.cores}</span>
      <span>cores</span>
      {hw.unifiedMemory && (
        <>
          <Sep />
          <span>unified</span>
        </>
      )}
      <span className="ml-auto hidden text-faint lg:inline">
        S/A/B fit · C/D tight · F too heavy
      </span>
    </div>
  );
}

function Sep() {
  return <span className="text-line">/</span>;
}
