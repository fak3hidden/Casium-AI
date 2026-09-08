import { GPUS, GPU_BY_ID, matchGpu } from "./gpus";
import type { HardwareProfile } from "./types";

export const DEFAULT_HARDWARE: HardwareProfile = {
  gpuId: "rtx-4070",
  gpuName: "RTX 4070",
  vramGb: 12,
  bandwidthGBs: 504,
  ramGb: 32,
  cores: 16,
  detected: false,
  unifiedMemory: false,
};

export async function detectHardware(): Promise<HardwareProfile> {
  const cores = navigator.hardwareConcurrency || 8;
  const ramGb = clampRam((navigator as Navigator & { deviceMemory?: number }).deviceMemory);
  let renderer = "";
  let gpu = matchGpu("") ?? GPU_BY_ID.cpu;

  try {
    renderer = await readRenderer();
    const matched = matchGpu(renderer);
    if (matched) gpu = matched;
  } catch {
    /* keep fallback */
  }

  // Apple Silicon via UA / renderer
  const ua = navigator.userAgent;
  if (/Macintosh/.test(ua) && /Apple/.test(renderer || ua)) {
    const apple = inferApple(ramGb);
    if (apple) gpu = apple;
  }

  const unified = Boolean(gpu.unified) || gpu.vramGb === 0;
  const vramGb = gpu.vramGb > 0 ? gpu.vramGb : ramGb;

  return {
    gpuId: gpu.id,
    gpuName: gpu.name,
    vramGb,
    bandwidthGBs: gpu.bandwidthGBs,
    ramGb,
    cores,
    detected: Boolean(renderer),
    renderer,
    unifiedMemory: unified,
  };
}

function clampRam(deviceMemory?: number): number {
  if (!deviceMemory) return 16;
  // deviceMemory is a privacy-capped lower bound (often 8)
  if (deviceMemory >= 8) return 16;
  return deviceMemory;
}

async function readRenderer(): Promise<string> {
  const webgpu = await readWebGPU();
  if (webgpu) return webgpu;

  const canvas = document.createElement("canvas");
  const gl =
    canvas.getContext("webgl2") ||
    canvas.getContext("webgl") ||
    (canvas.getContext("experimental-webgl") as WebGLRenderingContext | null);
  if (!gl) return "";
  const ext = gl.getExtension("WEBGL_debug_renderer_info");
  if (!ext) return gl.getParameter(gl.RENDERER) as string;
  return String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) || "");
}

async function readWebGPU(): Promise<string> {
  const nav = navigator as Navigator & {
    gpu?: {
      requestAdapter: () => Promise<{
        info?: { device?: string; description?: string };
        requestAdapterInfo?: () => Promise<{ description?: string; device?: string }>;
      } | null>;
    };
  };
  if (!nav.gpu) return "";
  try {
    const adapter = await nav.gpu.requestAdapter();
    if (!adapter) return "";
    const info = adapter.requestAdapterInfo ? await adapter.requestAdapterInfo() : adapter.info;
    return info?.description || info?.device || "";
  } catch {
    return "";
  }
}

function inferApple(ramGb: number) {
  if (ramGb >= 64) return GPU_BY_ID["m2-ultra"];
  if (ramGb >= 32) return GPU_BY_ID["m2-max"];
  if (ramGb >= 16) return GPU_BY_ID["m4-16"];
  return GPU_BY_ID["m1-8"];
}

export function applyGpu(gpuId: string, current: HardwareProfile): HardwareProfile {
  const gpu = GPU_BY_ID[gpuId] ?? GPUS[0];
  const unified = Boolean(gpu.unified);
  return {
    ...current,
    gpuId: gpu.id,
    gpuName: gpu.name,
    vramGb: gpu.vramGb > 0 ? gpu.vramGb : current.ramGb,
    bandwidthGBs: gpu.bandwidthGBs,
    unifiedMemory: unified,
    detected: false,
  };
}

export const RAM_OPTIONS = [8, 16, 32, 64, 128, 256];
export const CORE_OPTIONS = [4, 6, 8, 10, 12, 14, 16, 24, 32, 64];
