import type { ReactNode } from "react";
import { useStore } from "../lib/useStore";
import { detectHardware } from "../lib/hardware";

export function SettingsView() {
  const store = useStore();
  const { settings, hardware } = store.state;

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="border-b border-line px-4 py-3">
        <h1 className="text-[15px] font-medium">Settings</h1>
        <p className="mt-0.5 text-[12px] text-mute">Inference, local API, hardware profile.</p>
      </div>

      <div className="mx-auto max-w-[640px] px-4 py-5">
        <Block title="Hardware">
          <p className="mb-3 text-[13px] text-mute">
            WebGL / WebGPU renderer string matched to a VRAM and bandwidth table. Override if the
            guess is wrong.
          </p>
          <div className="grid grid-cols-2 gap-px overflow-hidden border border-line bg-line text-[13px]">
            <Row k="GPU" v={hardware.gpuName} />
            <Row k="VRAM" v={`${hardware.vramGb} GB`} />
            <Row k="Bandwidth" v={`${hardware.bandwidthGBs} GB/s`} />
            <Row k="RAM" v={`${hardware.ramGb} GB`} />
            <Row k="Cores" v={String(hardware.cores)} />
            <Row k="Memory" v={hardware.unifiedMemory ? "Unified" : "Discrete"} />
          </div>
          {hardware.renderer && (
            <div className="mt-2 truncate font-mono text-[11px] text-faint">{hardware.renderer}</div>
          )}
          <button
            className="btn btn-ghost mt-3"
            onClick={async () => store.setHardware(await detectHardware())}
          >
            Re-detect
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
          <label className="flex h-8 items-center justify-between text-[13px]">
            <span>OpenAI-compatible server</span>
            <input
              type="checkbox"
              className="accent-white"
              checked={settings.apiEnabled}
              onChange={(e) => store.setSettings({ apiEnabled: e.target.checked })}
            />
          </label>
          <label className="mt-2 block text-[12px] text-mute">
            Port
            <input
              type="number"
              className="field mt-1"
              value={settings.apiPort}
              onChange={(e) => store.setSettings({ apiPort: Number(e.target.value) })}
            />
          </label>
          <pre className="mt-3 overflow-x-auto border border-line bg-bg p-3 font-mono text-[11px] text-mute">{`curl http://127.0.0.1:${settings.apiPort}/v1/chat/completions \\
  -H "Content-Type: application/json" \\
  -d '{"model":"qwen2.5:7b","messages":[{"role":"user","content":"hi"}]}'`}</pre>
        </Block>

        <Block title="Data">
          <button
            onClick={() => {
              if (confirm("Reset Casium?")) store.reset();
            }}
            className="btn btn-danger"
          >
            Reset local state
          </button>
        </Block>
      </div>
    </div>
  );
}

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mb-8">
      <div className="mb-3 text-[12px] font-medium text-mute">{title}</div>
      {children}
    </section>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="bg-panel px-3 py-2">
      <div className="text-[11px] text-faint">{k}</div>
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
      <div className="mb-1 flex justify-between text-[12px] text-mute">
        <span>{label}</span>
        <span className="font-mono text-fg">{value}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-white"
      />
    </label>
  );
}
