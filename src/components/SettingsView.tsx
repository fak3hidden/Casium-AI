import type { ReactNode } from "react";
import { useStore } from "../lib/useStore";
import { detectHardware } from "../lib/hardware";

export function SettingsView() {
  const store = useStore();
  const { settings, hardware } = store.state;

  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-6">
      <div className="mx-auto max-w-2xl">
        <div className="font-serif text-3xl italic">Settings</div>
        <p className="mt-1 text-sm text-white/45">
          Inference, the local API, and the hardware profile used to grade models.
        </p>

        <Block title="Hardware profile">
          <p className="mb-3 text-[13px] text-white/45">
            Detected via WebGL / WebGPU renderer strings, then matched to a VRAM and bandwidth
            database — the CanIRun.ai method. Override anything that’s wrong.
          </p>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <Row k="GPU" v={hardware.gpuName} />
            <Row k="VRAM" v={`${hardware.vramGb} GB`} />
            <Row k="Bandwidth" v={`${hardware.bandwidthGBs} GB/s`} />
            <Row k="RAM" v={`${hardware.ramGb} GB`} />
            <Row k="Cores" v={String(hardware.cores)} />
            <Row k="Memory" v={hardware.unifiedMemory ? "Unified" : "Discrete"} />
          </div>
          {hardware.renderer && (
            <div className="mt-2 truncate font-mono text-[11px] text-white/30">{hardware.renderer}</div>
          )}
          <button
            className="mt-3 rounded-xl border border-white/10 px-3 py-2 text-sm text-white/70 hover:text-white"
            onClick={async () => {
              const hw = await detectHardware();
              store.setHardware(hw);
            }}
          >
            Re-detect hardware
          </button>
        </Block>

        <Block title="Inference">
          <Slider
            label="Temperature"
            value={settings.temperature}
            min={0}
            max={1.5}
            step={0.05}
            onChange={(temperature) => store.setSettings({ temperature })}
          />
          <Slider
            label="Context length"
            value={settings.contextLength}
            min={2048}
            max={131072}
            step={1024}
            onChange={(contextLength) => store.setSettings({ contextLength })}
          />
          <Slider
            label="GPU layers"
            value={settings.gpuLayers}
            min={0}
            max={99}
            step={1}
            onChange={(gpuLayers) => store.setSettings({ gpuLayers })}
          />
        </Block>

        <Block title="Local API">
          <label className="flex items-center justify-between text-sm">
            <span>OpenAI-compatible server</span>
            <input
              type="checkbox"
              className="accent-casium"
              checked={settings.apiEnabled}
              onChange={(e) => store.setSettings({ apiEnabled: e.target.checked })}
            />
          </label>
          <label className="mt-3 block text-[12px] text-white/40">
            Port
            <input
              type="number"
              className="field mt-1"
              value={settings.apiPort}
              onChange={(e) => store.setSettings({ apiPort: Number(e.target.value) })}
            />
          </label>
          <pre className="mt-3 overflow-x-auto rounded-xl border border-white/10 bg-ink-950 p-3 font-mono text-[11px] text-white/60">{`curl http://127.0.0.1:${settings.apiPort}/v1/chat/completions \\
  -H "Content-Type: application/json" \\
  -d '{"model":"qwen2.5:7b","messages":[{"role":"user","content":"hi"}]}'`}</pre>
        </Block>

        <Block title="Data">
          <button
            onClick={() => {
              if (confirm("Reset Casium to factory defaults?")) store.reset();
            }}
            className="rounded-xl border border-rose-400/30 px-3 py-2 text-sm text-rose-300"
          >
            Reset local state
          </button>
        </Block>

        <p className="mt-8 text-center font-mono text-[11px] text-white/25">
          Casium AI · models stay on your machine · v1.0
        </p>
      </div>
    </div>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-6 rounded-2xl border border-white/[0.07] bg-ink-800/40 p-5">
      <div className="mb-3 text-[11px] uppercase tracking-[0.18em] text-white/35">{title}</div>
      {children}
    </section>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="rounded-xl border border-white/[0.06] px-3 py-2">
      <div className="text-[10px] uppercase tracking-wider text-white/35">{k}</div>
      <div>{v}</div>
    </div>
  );
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (n: number) => void;
}) {
  return (
    <label className="mb-3 block">
      <div className="mb-1 flex justify-between text-[12px] text-white/50">
        <span>{label}</span>
        <span className="font-mono text-white/70">{value}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-casium"
      />
    </label>
  );
}
