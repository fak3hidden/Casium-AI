namespace Casium.Core;

public enum Verdict
{
    Excellent,
    Good,
    Okay,
    Tight,
    Poor,
    WontRun
}

public enum RunMode
{
    Gpu,       // fully offloaded to VRAM
    Hybrid,    // partially offloaded, rest in system RAM
    Cpu,       // system RAM only
    Blocked    // not enough RAM at all
}

/// <summary>The result of a "can this PC run this model?" estimate.</summary>
public sealed class RunAnalysis
{
    public required CatalogVariant Variant { get; init; }
    public required double SizeGB { get; init; }
    public required double KvCacheGB { get; init; }
    public required double RamNeededGB { get; init; }
    public required double VramNeededGB { get; init; }
    public required RunMode Mode { get; init; }
    public required double OffloadFraction { get; init; }
    public required double TokensPerSecond { get; init; }
    public required Verdict Verdict { get; init; }
    public required string Summary { get; init; }
    public required string ModeText { get; init; }
    public required bool RamFits { get; init; }
    public required bool VramFits { get; init; }

    public string SpeedText => $"≈ {Format.TokensPerSecond(TokensPerSecond)} tokens/sec";
}

/// <summary>
/// Estimates whether a model fits in RAM/VRAM and how fast it will run, the same way
/// sites like canirun.ai do it: model file size + KV cache vs. available memory, and
/// a memory-bandwidth-based tokens/sec projection.
/// </summary>
public static class CompatibilityEngine
{
    /// <summary>All estimates assume this context window.</summary>
    public const int EstimateContext = 8192;

    /// <memory-bandwidth efficiency>
    /// A transformer at batch 1 is memory-bound: each token reads roughly the active
    /// weights once. Real-world efficiency hovers around 45–55% of theoretical GPU
    /// bandwidth and ~75% of practical CPU bandwidth.
    /// </memory-bandwidth efficiency>
    private const double GpuEfficiency = 0.5;
    private const double CpuEfficiency = 0.75;
    private const double BytesPerParam = 0.61; // ~Q4_K_M: 4.8 bits/weight
    private const double RamOverheadGB = 2.0;  // engine + OS + framework
    private const double VramOverheadGB = 0.4;

    public static RunAnalysis Analyze(CatalogVariant variant, HardwareInfo hw)
    {
        var sizeGB = variant.SizeGB;
        var activeB = variant.ActiveB ?? variant.ParamsB;
        var readGB = BytesPerParam * activeB; // GB of weights touched per token

        // KV cache ≈ params_B × 16 KB × ctx (capped — architectures vary).
        var kvGB = Math.Min(4.0, variant.ParamsB * 16384.0 * EstimateContext / 1e9);
        if (kvGB < 0.15) kvGB = 0.15;

        var ramNeeded = sizeGB + kvGB + RamOverheadGB;
        var vramNeeded = sizeGB * 1.06 + kvGB + VramOverheadGB;

        var gpu = hw.BestGpu;
        RunMode mode;
        double offload = 0;
        double tps = 0;

        var ramFits = hw.TotalRamGB >= ramNeeded * 0.98;
        var vramFits = gpu != null && gpu.VramGB >= vramNeeded;

        if (!ramFits)
        {
            mode = RunMode.Blocked;
        }
        else if (vramFits)
        {
            mode = RunMode.Gpu;
            offload = 1.0;
            tps = gpu!.BandwidthGBps * GpuEfficiency / readGB;
        }
        else if (gpu != null && gpu.VramGB > sizeGB * 0.25)
        {
            mode = RunMode.Hybrid;
            offload = Math.Clamp((gpu.VramGB - 1.0 - kvGB * 0.5) / (sizeGB + kvGB), 0.15, 0.95);
            var tpsGpu = gpu.BandwidthGBps * GpuEfficiency / readGB;
            var tpsCpu = hw.CpuBandwidthGBps * CpuEfficiency / readGB;
            tps = 1.0 / (offload / tpsGpu + (1 - offload) / tpsCpu);
        }
        else
        {
            mode = RunMode.Cpu;
            tps = hw.CpuBandwidthGBps * CpuEfficiency / readGB;
        }

        var verdict = mode == RunMode.Blocked
            ? Verdict.WontRun
            : tps switch
            {
                >= 35 => Verdict.Excellent,
                >= 18 => Verdict.Good,
                >= 9 => Verdict.Okay,
                >= 4 => Verdict.Tight,
                >= 1.5 => Verdict.Poor,
                _ => Verdict.WontRun
            };

        var summary = mode switch
        {
            RunMode.Blocked =>
                $"Needs ≈{ramNeeded:F0} GB of system RAM, but this PC has {Format.GB(hw.TotalRamGB)}. Try a smaller size.",
            RunMode.Gpu =>
                $"Fits entirely in your {gpu!.ShortName} VRAM — expect ≈{Format.TokensPerSecond(tps)} tok/s.",
            RunMode.Hybrid =>
                $"Partially offloaded to your {gpu!.ShortName} (≈{offload:P0} of layers on GPU), rest in RAM — expect ≈{Format.TokensPerSecond(tps)} tok/s.",
            _ =>
                $"No usable GPU for this size — it will run from system RAM at ≈{Format.TokensPerSecond(tps)} tok/s."
        };

        var modeText = mode switch
        {
            RunMode.Gpu => "GPU — fully offloaded",
            RunMode.Hybrid => $"GPU + RAM hybrid (≈{offload:P0} on GPU)",
            RunMode.Cpu => "CPU — system RAM only",
            _ => "Not enough memory"
        };

        return new RunAnalysis
        {
            Variant = variant,
            SizeGB = sizeGB,
            KvCacheGB = kvGB,
            RamNeededGB = ramNeeded,
            VramNeededGB = vramNeeded,
            Mode = mode,
            OffloadFraction = offload,
            TokensPerSecond = tps,
            Verdict = verdict,
            Summary = summary,
            ModeText = modeText,
            RamFits = ramFits,
            VramFits = vramFits
        };
    }

    public static string VerdictLabel(Verdict verdict) => verdict switch
    {
        Verdict.Excellent => "Runs great",
        Verdict.Good => "Runs well",
        Verdict.Okay => "Runs okay",
        Verdict.Tight => "Runs slowly",
        Verdict.Poor => "Barely runs",
        _ => "Won't run"
    };
}
