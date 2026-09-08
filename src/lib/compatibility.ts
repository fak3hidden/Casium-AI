import type {
  Compatibility,
  FitStatus,
  Grade,
  HardwareProfile,
  ModelSpec,
  Quant,
  QuantEstimate,
} from "./types";

export const QUANTS: Quant[] = [
  "Q2_K",
  "Q3_K_M",
  "Q4_K_M",
  "Q5_K_M",
  "Q6_K",
  "Q8_0",
  "F16",
];

export const QUANT_BITS: Record<Quant, number> = {
  Q2_K: 2.625,
  Q3_K_M: 3.4375,
  Q4_K_M: 4.5,
  Q5_K_M: 5.5,
  Q6_K: 6.5625,
  Q8_0: 8.5,
  F16: 16,
};

export const QUANT_QUALITY: Record<Quant, QuantEstimate["quality"]> = {
  Q2_K: "low",
  Q3_K_M: "moderate",
  Q4_K_M: "good",
  Q5_K_M: "good",
  Q6_K: "excellent",
  Q8_0: "excellent",
  F16: "lossless",
};

const QUALITY_SCORE: Record<QuantEstimate["quality"], number> = {
  low: 4,
  moderate: 8,
  good: 14,
  excellent: 18,
  lossless: 20,
};

export function gradeFromScore(score: number): Grade {
  if (score >= 90) return "S";
  if (score >= 75) return "A";
  if (score >= 60) return "B";
  if (score >= 42) return "C";
  if (score >= 22) return "D";
  return "F";
}

export function gradeColor(grade: Grade): string {
  switch (grade) {
    case "S":
      return "#3ee8c5";
    case "A":
      return "#6ea8ff";
    case "B":
      return "#a78bfa";
    case "C":
      return "#fbbf24";
    case "D":
      return "#fb923c";
    case "F":
      return "#f43f5e";
  }
}

export function gradeLabel(grade: Grade): string {
  switch (grade) {
    case "S":
      return "Runs great";
    case "A":
      return "Comfortable";
    case "B":
      return "Good fit";
    case "C":
      return "Tight fit";
    case "D":
      return "CPU offload";
    case "F":
      return "Too heavy";
  }
}

function usableVram(hw: HardwareProfile): number {
  if (hw.unifiedMemory) {
    // Apple / iGPU share system RAM; leave ~25% for OS
    const pool = hw.vramGb > 0 ? hw.vramGb : hw.ramGb;
    return Math.max(1, pool * 0.75);
  }
  return Math.max(hw.vramGb, 0);
}

function modelSizeGb(model: ModelSpec, quant: Quant): number {
  const bits = QUANT_BITS[quant];
  return (model.paramsB * bits) / 8;
}

function kvCacheGb(model: ModelSpec, contextTokens = 4096): number {
  // Rough KV: ~0.5–1.2 bytes per param per 1K context, scaled down for MoE
  const ctxK = Math.min(model.contextK || 4, contextTokens / 1024);
  const active = model.activeParamsB ?? model.paramsB;
  return (active * 0.08 * ctxK) / 8;
}

export function estimateQuant(
  model: ModelSpec,
  hw: HardwareProfile,
  quant: Quant,
): QuantEstimate {
  const size = modelSizeGb(model, quant);
  const kv = kvCacheGb(model, Math.min(4096, (model.contextK || 4) * 1024));
  const overhead = 0.4 + size * 0.08;
  const vramRequired = size + kv + overhead;
  const ramRequired = vramRequired * 1.35;

  const vram = usableVram(hw);
  const ram = hw.ramGb;
  const ratio = vramRequired / Math.max(vram, 0.5);

  let status: FitStatus;
  if (vram <= 0.5 && ram < ramRequired) status = "insufficient";
  else if (ratio > 1.25 && ram < ramRequired) status = "insufficient";
  else if (ratio > 1.02) status = ram >= ramRequired * 0.85 ? "cpu-offload" : "insufficient";
  else if (ratio > 0.86) status = "tight";
  else status = "comfortable";

  const bandwidth = Math.max(hw.bandwidthGBs, 40);
  const activeSize =
    model.architecture === "moe" && model.activeParamsB
      ? (model.activeParamsB * QUANT_BITS[quant]) / 8
      : size;
  const efficiency = hw.unifiedMemory ? 0.55 : status === "cpu-offload" ? 0.18 : 0.72;
  const tokensPerSecond = Math.max(
    0.4,
    (bandwidth / Math.max(activeSize, 0.3)) * efficiency,
  );

  const notes: string[] = [];
  if (status === "comfortable") {
    notes.push("The model should fit comfortably in GPU memory.");
  } else if (status === "tight") {
    notes.push("It fits, but leave other GPU apps closed and keep context modest.");
  } else if (status === "cpu-offload") {
    notes.push("Weights spill to system RAM. Expect much slower tokens/sec.");
  } else {
    notes.push("This quantization is too heavy for the selected hardware.");
  }
  if (tokensPerSecond >= 40) notes.push("Interactive chat speed on this machine.");
  else if (tokensPerSecond >= 18) notes.push("Usable conversational speed.");
  else if (tokensPerSecond >= 8) notes.push("Readable but not snappy.");
  else notes.push("Slow — better for batch or overnight jobs.");
  if (model.architecture === "moe") {
    notes.push("MoE: full weights occupy VRAM, but only active experts run per token.");
  }

  // Scoring — same spirit as CanIRun.ai
  let score = 0;
  if (status === "comfortable") score += 42;
  else if (status === "tight") score += 24;
  else if (status === "cpu-offload") score += 10;
  else score += 0;

  score += Math.min(32, tokensPerSecond * 0.55);
  const headroom = Math.max(0, vram - vramRequired);
  score += Math.min(16, headroom * 1.1);
  score += QUALITY_SCORE[QUANT_QUALITY[quant]] * (status === "insufficient" ? 0.15 : 0.55);

  if (status === "insufficient") score = Math.min(score, 18);
  if (status === "cpu-offload") score = Math.min(score, 48);

  score = Math.max(0, Math.min(100, Math.round(score)));
  const grade = gradeFromScore(score);

  return {
    quant,
    bits: QUANT_BITS[quant],
    modelSizeGb: round(size, 1),
    vramRequiredGb: round(vramRequired, 1),
    ramRequiredGb: round(ramRequired, 1),
    tokensPerSecond: Math.round(tokensPerSecond),
    quality: QUANT_QUALITY[quant],
    grade,
    score,
    status,
    notes,
  };
}

export function compatibility(model: ModelSpec, hw: HardwareProfile): Compatibility {
  const quants = QUANTS.map((q) => estimateQuant(model, hw, q));
  const runnable = quants.filter((q) => q.status !== "insufficient");
  const ranked = [...(runnable.length ? runnable : quants)].sort((a, b) => {
    const statusRank: Record<FitStatus, number> = {
      comfortable: 4,
      tight: 3,
      "cpu-offload": 2,
      unknown: 1,
      insufficient: 0,
    };
    if (statusRank[b.status] !== statusRank[a.status]) {
      return statusRank[b.status] - statusRank[a.status];
    }
    // Prefer Q4–Q6 when they fit; otherwise highest score
    const prefer = (q: Quant) => (q === "Q4_K_M" ? 3 : q === "Q5_K_M" ? 2 : q === "Q6_K" ? 1 : 0);
    if (prefer(b.quant) !== prefer(a.quant) && b.status === a.status && a.status !== "insufficient") {
      return prefer(b.quant) - prefer(a.quant);
    }
    return b.score - a.score;
  });
  const best = ranked[0];
  const q4 = quants.find((q) => q.quant === "Q4_K_M") ?? best;
  return {
    modelId: model.id,
    recommendedQuant: best.quant,
    best,
    quants,
    overallGrade: q4.grade,
    overallScore: q4.score,
  };
}

export function gradeCounts(
  models: ModelSpec[],
  hw: HardwareProfile,
): Record<Grade, number> {
  const counts: Record<Grade, number> = { S: 0, A: 0, B: 0, C: 0, D: 0, F: 0 };
  for (const m of models) counts[compatibility(m, hw).overallGrade]++;
  return counts;
}

function round(n: number, d: number) {
  const p = 10 ** d;
  return Math.round(n * p) / p;
}
