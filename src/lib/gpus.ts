import type { GpuSpec } from "./types";

export const GPUS: GpuSpec[] = [
  // NVIDIA consumer — Blackwell
  { id: "rtx-5090", name: "RTX 5090", brand: "nvidia", vramGb: 32, bandwidthGBs: 1792, aliases: ["5090"] },
  { id: "rtx-5080", name: "RTX 5080", brand: "nvidia", vramGb: 16, bandwidthGBs: 960, aliases: ["5080"] },
  { id: "rtx-5070-ti", name: "RTX 5070 Ti", brand: "nvidia", vramGb: 16, bandwidthGBs: 896, aliases: ["5070 ti"] },
  { id: "rtx-5070", name: "RTX 5070", brand: "nvidia", vramGb: 12, bandwidthGBs: 672, aliases: ["5070"] },
  { id: "rtx-5060-ti-16", name: "RTX 5060 Ti 16GB", brand: "nvidia", vramGb: 16, bandwidthGBs: 448 },
  { id: "rtx-5060-ti", name: "RTX 5060 Ti", brand: "nvidia", vramGb: 8, bandwidthGBs: 448 },
  { id: "rtx-5060", name: "RTX 5060", brand: "nvidia", vramGb: 8, bandwidthGBs: 384 },
  // NVIDIA consumer — Ada
  { id: "rtx-4090", name: "RTX 4090", brand: "nvidia", vramGb: 24, bandwidthGBs: 1008, aliases: ["4090"] },
  { id: "rtx-4080-super", name: "RTX 4080 SUPER", brand: "nvidia", vramGb: 16, bandwidthGBs: 736 },
  { id: "rtx-4080", name: "RTX 4080", brand: "nvidia", vramGb: 16, bandwidthGBs: 717, aliases: ["4080"] },
  { id: "rtx-4070-ti-super", name: "RTX 4070 Ti SUPER", brand: "nvidia", vramGb: 16, bandwidthGBs: 672 },
  { id: "rtx-4070-ti", name: "RTX 4070 Ti", brand: "nvidia", vramGb: 12, bandwidthGBs: 504 },
  { id: "rtx-4070-super", name: "RTX 4070 SUPER", brand: "nvidia", vramGb: 12, bandwidthGBs: 504 },
  { id: "rtx-4070", name: "RTX 4070", brand: "nvidia", vramGb: 12, bandwidthGBs: 504, aliases: ["4070"] },
  { id: "rtx-4060-ti-16", name: "RTX 4060 Ti 16GB", brand: "nvidia", vramGb: 16, bandwidthGBs: 288 },
  { id: "rtx-4060-ti", name: "RTX 4060 Ti", brand: "nvidia", vramGb: 8, bandwidthGBs: 288 },
  { id: "rtx-4060", name: "RTX 4060", brand: "nvidia", vramGb: 8, bandwidthGBs: 272, aliases: ["4060"] },
  { id: "rtx-4050-laptop", name: "RTX 4050 Laptop", brand: "nvidia", vramGb: 6, bandwidthGBs: 192 },
  { id: "rtx-4070-laptop", name: "RTX 4070 Laptop", brand: "nvidia", vramGb: 8, bandwidthGBs: 256 },
  { id: "rtx-4080-laptop", name: "RTX 4080 Laptop", brand: "nvidia", vramGb: 12, bandwidthGBs: 432 },
  { id: "rtx-4090-laptop", name: "RTX 4090 Laptop", brand: "nvidia", vramGb: 16, bandwidthGBs: 576 },
  // NVIDIA Ampere
  { id: "rtx-3090-ti", name: "RTX 3090 Ti", brand: "nvidia", vramGb: 24, bandwidthGBs: 1008 },
  { id: "rtx-3090", name: "RTX 3090", brand: "nvidia", vramGb: 24, bandwidthGBs: 936, aliases: ["3090"] },
  { id: "rtx-3080-ti", name: "RTX 3080 Ti", brand: "nvidia", vramGb: 12, bandwidthGBs: 912 },
  { id: "rtx-3080-12", name: "RTX 3080 12GB", brand: "nvidia", vramGb: 12, bandwidthGBs: 912 },
  { id: "rtx-3080", name: "RTX 3080", brand: "nvidia", vramGb: 10, bandwidthGBs: 760, aliases: ["3080"] },
  { id: "rtx-3070-ti", name: "RTX 3070 Ti", brand: "nvidia", vramGb: 8, bandwidthGBs: 608 },
  { id: "rtx-3070", name: "RTX 3070", brand: "nvidia", vramGb: 8, bandwidthGBs: 448, aliases: ["3070"] },
  { id: "rtx-3060-ti", name: "RTX 3060 Ti", brand: "nvidia", vramGb: 8, bandwidthGBs: 448 },
  { id: "rtx-3060", name: "RTX 3060", brand: "nvidia", vramGb: 12, bandwidthGBs: 360, aliases: ["3060"] },
  { id: "rtx-3050", name: "RTX 3050", brand: "nvidia", vramGb: 8, bandwidthGBs: 224 },
  { id: "rtx-3060-laptop", name: "RTX 3060 Laptop", brand: "nvidia", vramGb: 6, bandwidthGBs: 336 },
  // NVIDIA Turing / Pascal
  { id: "rtx-2080-ti", name: "RTX 2080 Ti", brand: "nvidia", vramGb: 11, bandwidthGBs: 616 },
  { id: "rtx-2080-super", name: "RTX 2080 SUPER", brand: "nvidia", vramGb: 8, bandwidthGBs: 496 },
  { id: "rtx-2070-super", name: "RTX 2070 SUPER", brand: "nvidia", vramGb: 8, bandwidthGBs: 448 },
  { id: "rtx-2060-super", name: "RTX 2060 SUPER", brand: "nvidia", vramGb: 8, bandwidthGBs: 448 },
  { id: "rtx-2060", name: "RTX 2060", brand: "nvidia", vramGb: 6, bandwidthGBs: 336 },
  { id: "gtx-1660-ti", name: "GTX 1660 Ti", brand: "nvidia", vramGb: 6, bandwidthGBs: 288 },
  { id: "gtx-1660-super", name: "GTX 1660 SUPER", brand: "nvidia", vramGb: 6, bandwidthGBs: 336 },
  { id: "gtx-1080-ti", name: "GTX 1080 Ti", brand: "nvidia", vramGb: 11, bandwidthGBs: 484 },
  { id: "gtx-1080", name: "GTX 1080", brand: "nvidia", vramGb: 8, bandwidthGBs: 320 },
  { id: "gtx-1070", name: "GTX 1070", brand: "nvidia", vramGb: 8, bandwidthGBs: 256 },
  { id: "gtx-1060-6", name: "GTX 1060 6GB", brand: "nvidia", vramGb: 6, bandwidthGBs: 192 },
  // NVIDIA workstation / datacenter
  { id: "rtx-6000-ada", name: "RTX 6000 Ada", brand: "nvidia", vramGb: 48, bandwidthGBs: 960 },
  { id: "rtx-a6000", name: "RTX A6000", brand: "nvidia", vramGb: 48, bandwidthGBs: 768 },
  { id: "rtx-a5000", name: "RTX A5000", brand: "nvidia", vramGb: 24, bandwidthGBs: 768 },
  { id: "rtx-a4000", name: "RTX A4000", brand: "nvidia", vramGb: 16, bandwidthGBs: 448 },
  { id: "l40s", name: "L40S", brand: "nvidia", vramGb: 48, bandwidthGBs: 864 },
  { id: "a100-80", name: "A100 80GB", brand: "nvidia", vramGb: 80, bandwidthGBs: 2039 },
  { id: "a100-40", name: "A100 40GB", brand: "nvidia", vramGb: 40, bandwidthGBs: 1555 },
  { id: "h100", name: "H100", brand: "nvidia", vramGb: 80, bandwidthGBs: 3350 },
  { id: "h200", name: "H200", brand: "nvidia", vramGb: 141, bandwidthGBs: 4800 },
  { id: "b200", name: "B200", brand: "nvidia", vramGb: 192, bandwidthGBs: 8000 },
  { id: "t4", name: "T4", brand: "nvidia", vramGb: 16, bandwidthGBs: 320 },
  // AMD
  { id: "rx-9070-xt", name: "RX 9070 XT", brand: "amd", vramGb: 16, bandwidthGBs: 640 },
  { id: "rx-9070", name: "RX 9070", brand: "amd", vramGb: 16, bandwidthGBs: 640 },
  { id: "rx-7900-xtx", name: "RX 7900 XTX", brand: "amd", vramGb: 24, bandwidthGBs: 960 },
  { id: "rx-7900-xt", name: "RX 7900 XT", brand: "amd", vramGb: 20, bandwidthGBs: 800 },
  { id: "rx-7800-xt", name: "RX 7800 XT", brand: "amd", vramGb: 16, bandwidthGBs: 624 },
  { id: "rx-7700-xt", name: "RX 7700 XT", brand: "amd", vramGb: 12, bandwidthGBs: 432 },
  { id: "rx-7600", name: "RX 7600", brand: "amd", vramGb: 8, bandwidthGBs: 288 },
  { id: "rx-6900-xt", name: "RX 6900 XT", brand: "amd", vramGb: 16, bandwidthGBs: 512 },
  { id: "rx-6800-xt", name: "RX 6800 XT", brand: "amd", vramGb: 16, bandwidthGBs: 512 },
  { id: "rx-6800", name: "RX 6800", brand: "amd", vramGb: 16, bandwidthGBs: 512 },
  { id: "rx-6700-xt", name: "RX 6700 XT", brand: "amd", vramGb: 12, bandwidthGBs: 384 },
  { id: "rx-6600", name: "RX 6600", brand: "amd", vramGb: 8, bandwidthGBs: 224 },
  { id: "radeon-780m", name: "Radeon 780M", brand: "amd", vramGb: 0, bandwidthGBs: 89, unified: true, aliases: ["780m", "radeonsi", "phoenix"] },
  { id: "radeon-890m", name: "Radeon 890M", brand: "amd", vramGb: 0, bandwidthGBs: 120, unified: true },
  { id: "radeon-680m", name: "Radeon 680M", brand: "amd", vramGb: 0, bandwidthGBs: 68, unified: true },
  { id: "strix-halo", name: "Ryzen AI MAX+ 395", brand: "amd", vramGb: 96, bandwidthGBs: 256, unified: true },
  // Intel
  { id: "arc-a770", name: "Arc A770", brand: "intel", vramGb: 16, bandwidthGBs: 560 },
  { id: "arc-a750", name: "Arc A750", brand: "intel", vramGb: 8, bandwidthGBs: 512 },
  { id: "arc-a580", name: "Arc A580", brand: "intel", vramGb: 8, bandwidthGBs: 512 },
  { id: "arc-b580", name: "Arc B580", brand: "intel", vramGb: 12, bandwidthGBs: 456 },
  { id: "iris-xe", name: "Iris Xe", brand: "intel", vramGb: 0, bandwidthGBs: 68, unified: true, aliases: ["iris xe", "uhd"] },
  // Apple Silicon
  { id: "m1-8", name: "M1 (8 GB)", brand: "apple", vramGb: 8, bandwidthGBs: 68, unified: true },
  { id: "m1-pro", name: "M1 Pro (16 GB)", brand: "apple", vramGb: 16, bandwidthGBs: 200, unified: true },
  { id: "m1-max", name: "M1 Max (32 GB)", brand: "apple", vramGb: 32, bandwidthGBs: 400, unified: true },
  { id: "m1-ultra", name: "M1 Ultra (64 GB)", brand: "apple", vramGb: 64, bandwidthGBs: 800, unified: true },
  { id: "m2-8", name: "M2 (8 GB)", brand: "apple", vramGb: 8, bandwidthGBs: 100, unified: true },
  { id: "m2-pro", name: "M2 Pro (16 GB)", brand: "apple", vramGb: 16, bandwidthGBs: 200, unified: true },
  { id: "m2-max", name: "M2 Max (32 GB)", brand: "apple", vramGb: 32, bandwidthGBs: 400, unified: true },
  { id: "m2-ultra", name: "M2 Ultra (64 GB)", brand: "apple", vramGb: 64, bandwidthGBs: 800, unified: true },
  { id: "m3-8", name: "M3 (8 GB)", brand: "apple", vramGb: 8, bandwidthGBs: 100, unified: true },
  { id: "m3-pro", name: "M3 Pro (18 GB)", brand: "apple", vramGb: 18, bandwidthGBs: 150, unified: true },
  { id: "m3-max", name: "M3 Max (36 GB)", brand: "apple", vramGb: 36, bandwidthGBs: 400, unified: true },
  { id: "m3-ultra", name: "M3 Ultra (96 GB)", brand: "apple", vramGb: 96, bandwidthGBs: 800, unified: true },
  { id: "m4-16", name: "M4 (16 GB)", brand: "apple", vramGb: 16, bandwidthGBs: 120, unified: true },
  { id: "m4-pro", name: "M4 Pro (24 GB)", brand: "apple", vramGb: 24, bandwidthGBs: 273, unified: true },
  { id: "m4-max", name: "M4 Max (36 GB)", brand: "apple", vramGb: 36, bandwidthGBs: 546, unified: true },
  { id: "m5-16", name: "M5 (16 GB)", brand: "apple", vramGb: 16, bandwidthGBs: 153, unified: true },
  { id: "m5-pro", name: "M5 Pro (24 GB)", brand: "apple", vramGb: 24, bandwidthGBs: 307, unified: true },
  { id: "m5-max", name: "M5 Max (36 GB)", brand: "apple", vramGb: 36, bandwidthGBs: 546, unified: true },
  { id: "m5-ultra", name: "M5 Ultra (96 GB)", brand: "apple", vramGb: 96, bandwidthGBs: 819, unified: true },
  // CPU-only fallback
  { id: "cpu", name: "CPU only", brand: "other", vramGb: 0, bandwidthGBs: 50, unified: true },
];

export const GPU_BY_ID = Object.fromEntries(GPUS.map((g) => [g.id, g]));

export function matchGpu(renderer: string): GpuSpec | null {
  const r = renderer.toLowerCase();
  const scored = GPUS.map((gpu) => {
    const keys = [gpu.name, ...(gpu.aliases ?? [])].map((s) => s.toLowerCase());
    const hit = keys.some((k) => r.includes(k));
    return { gpu, hit, len: gpu.name.length };
  }).filter((x) => x.hit);
  scored.sort((a, b) => b.len - a.len);
  return scored[0]?.gpu ?? null;
}
