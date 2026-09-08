import type { ReactNode } from "react";
import { Cpu, Gauge, MemoryStick, Microchip, Waves } from "lucide-react";
import { GPUS } from "../lib/gpus";
import { useStore } from "../lib/useStore";

export function HardwareBar() {
  const store = useStore();
  const hw = store.state.hardware;

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-white/[0.06] bg-ink-900/80 px-4 py-2 backdrop-blur-xl">
      <div className="mr-1 flex items-center gap-1.5 text-[10px] uppercase tracking-[0.18em] text-white/35">
        <span className="h-1.5 w-1.5 rounded-full bg-casium shadow-[0_0_8px_#3ee8c5]" />
        {hw.detected ? "Detected" : "Profile"}
      </div>

      <SelectWrap icon={<Microchip size={12} />}>
        <select
          value={hw.gpuId}
          onChange={(e) => store.pickGpu(e.target.value)}
          className="max-w-[220px] bg-transparent text-[12px] text-white/85 outline-none"
        >
          {GPUS.map((g) => (
            <option key={g.id} value={g.id} className="bg-ink-800">
              {g.name}
              {g.vramGb ? ` (${g.vramGb} GB)` : ""}
            </option>
          ))}
        </select>
      </SelectWrap>

      <Chip icon={<Gauge size={12} />} label="VRAM" value={`${hw.vramGb} GB`} />
      <Chip icon={<Waves size={12} />} label="BW" value={`${hw.bandwidthGBs} GB/s`} />

      <SelectWrap icon={<MemoryStick size={12} />}>
        <select
          value={hw.ramGb}
          onChange={(e) =>
            store.setHardware({ ...hw, ramGb: Number(e.target.value) })
          }
          className="bg-transparent text-[12px] text-white/85 outline-none"
        >
          {[8, 16, 24, 32, 48, 64, 96, 128, 192, 256].map((n) => (
            <option key={n} value={n} className="bg-ink-800">
              {n} GB RAM
            </option>
          ))}
        </select>
      </SelectWrap>

      <Chip icon={<Cpu size={12} />} label="CPU" value={`${hw.cores} cores`} />

      {hw.unifiedMemory && (
        <span className="rounded-full border border-electric/25 bg-electric/10 px-2 py-0.5 font-mono text-[10px] text-electric">
          unified
        </span>
      )}

      <div className="ml-auto hidden text-[11px] text-white/30 sm:block">
        Grades use this profile · S/A/B run well · C/D tight · F too heavy
      </div>
    </div>
  );
}

function Chip({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-1.5 rounded-full border border-white/[0.06] bg-white/[0.03] px-2.5 py-1 text-[12px]">
      <span className="text-white/35">{icon}</span>
      <span className="text-white/35">{label}</span>
      <span className="font-mono text-white/80">{value}</span>
    </div>
  );
}

function SelectWrap({
  icon,
  children,
}: {
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <label className="flex items-center gap-1.5 rounded-full border border-white/[0.06] bg-white/[0.03] px-2.5 py-1">
      <span className="text-white/35">{icon}</span>
      {children}
    </label>
  );
}
