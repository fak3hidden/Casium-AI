using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.RegularExpressions;

namespace Casium.Core;

public sealed class GpuInfo
{
    public string Name { get; set; } = "";
    public int VramMB { get; set; }
    public int BandwidthGBps { get; set; }
    public string Source { get; set; } = "";

    public double VramGB => VramMB / 1024.0;
    public string ShortName => GpuDatabase.ShortName(Name);
}

/// <summary>A snapshot of the machine's AI-relevant hardware.</summary>
public sealed class HardwareInfo
{
    public string CpuName { get; set; } = "";
    public int CpuThreads { get; set; }
    public double TotalRamGB { get; set; }
    public double CpuBandwidthGBps { get; set; } = 45;
    public List<GpuInfo> Gpus { get; } = new();

    public GpuInfo? BestGpu => Gpus.Count == 0 ? null
        : Gpus.OrderByDescending(g => g.VramMB).First();

    public string RamText => Format.GB(TotalRamGB);

    public string Summary
    {
        get
        {
            var gpu = BestGpu;
            var gpuText = gpu == null ? "no dedicated GPU" : $"{gpu.ShortName} · {Format.GB(gpu.VramGB)} VRAM";
            return $"{CpuName} · {CpuThreads} threads · {Format.GB(TotalRamGB)} RAM · {gpuText}";
        }
    }

    public static HardwareInfo Detect()
    {
        var hw = new HardwareInfo();
        try
        {
            var cpu = RegUtil.GetString(@"HARDWARE\DESCRIPTION\System\CentralProcessor\0", "ProcessorNameString")
                      ?? Environment.GetEnvironmentVariable("PROCESSOR_IDENTIFIER")
                      ?? "Unknown CPU";
            hw.CpuName = Regex.Replace(cpu, @"\s+", " ").Trim();
        }
        catch { hw.CpuName = "Unknown CPU"; }

        hw.CpuThreads = Environment.ProcessorCount;
        hw.CpuBandwidthGBps = GuessCpuBandwidth(hw.CpuName);

        try
        {
            var status = new MemoryStatus();
            if (Native.GlobalMemoryStatusEx(status))
                hw.TotalRamGB = status.TotalPhysicalBytes / 1024.0 / 1024 / 1024;
        }
        catch { }

        // Fallbacks so compatibility math never sees zero/NaN.
        if (hw.TotalRamGB <= 0)
        {
            try
            {
                hw.TotalRamGB = GC.GetGCMemoryInfo().TotalAvailableMemoryBytes / 1024.0 / 1024 / 1024;
            }
            catch { }
        }
        if (hw.TotalRamGB < 1) hw.TotalRamGB = 16; // last resort: assume a typical machine

        foreach (var (name, vramMB, source) in DetectGpus())
        {
            hw.Gpus.Add(new GpuInfo
            {
                Name = name,
                VramMB = vramMB,
                Source = source,
                BandwidthGBps = GpuDatabase.Bandwidth(name, vramMB)
            });
        }
        return hw;
    }

    private static double GuessCpuBandwidth(string cpuName)
    {
        var n = cpuName.ToLowerInvariant();
        if (n.Contains("epyc") || n.Contains("xeon") || n.Contains("threadripper")) return 120;
        if (n.Contains("ryzen 9") || n.Contains("ryzen 7") || n.Contains("core i9") || n.Contains("core i7")) return 55;
        return 45;
    }

    private static IEnumerable<(string Name, int VramMB, string Source)> DetectGpus()
    {
        var results = new List<(string, int, string)>();

        // 1) nvidia-smi is the most reliable source for NVIDIA cards.
        foreach (var (name, vramMB) in QueryNvidiaSmi())
            results.Add((name, vramMB, "nvidia-smi"));

        // 2) Fall back to the driver registry class (works for AMD/Intel too).
        if (results.Count == 0)
        {
            foreach (var (name, vramBytes) in QueryRegistryGpus())
            {
                if (string.IsNullOrEmpty(name)) continue;
                var virtualized = name.Contains("Basic Display", StringComparison.OrdinalIgnoreCase)
                               || name.Contains("Parallels", StringComparison.OrdinalIgnoreCase)
                               || name.Contains("Virtual", StringComparison.OrdinalIgnoreCase)
                               || name.Contains("RDP", StringComparison.OrdinalIgnoreCase)
                               || name.Contains("Mirror", StringComparison.OrdinalIgnoreCase);
                if (virtualized) continue;
                var mb = (int)Math.Round(vramBytes / 1024.0 / 1024);
                if (mb < 128) continue;
                if (results.Any(r => r.Item1.Equals(name, StringComparison.OrdinalIgnoreCase))) continue;
                results.Add((name, mb, "registry"));
            }
        }

        return results;
    }

    private static IEnumerable<(string Name, int VramMB)> QueryNvidiaSmi()
    {
        var list = new List<(string, int)>();
        try
        {
            var psi = new ProcessStartInfo
            {
                FileName = "nvidia-smi",
                Arguments = "--query-gpu=name,memory.total --format=csv,noheader,nounits",
                UseShellExecute = false,
                CreateNoWindow = true,
                RedirectStandardOutput = true,
                RedirectStandardError = true
            };
            using var process = Process.Start(psi);
            if (process == null) return list;

            var stderrTask = process.StandardError.ReadToEndAsync();
            var output = process.StandardOutput.ReadToEnd();
            try { process.WaitForExit(5000); } catch { }
            if (process.ExitCode != 0)
            {
                Log.Warn("nvidia-smi exited with " + process.ExitCode);
                return list;
            }

            foreach (var line in output.Split('\n'))
            {
                var parts = line.Split(',');
                if (parts.Length != 2) continue;
                if (int.TryParse(parts[1].Trim(), out var mb) && mb > 0)
                    list.Add((parts[0].Trim(), mb));
            }
        }
        catch
        {
            // No NVIDIA tooling installed — fine.
        }
        return list;
    }

    private static IEnumerable<(string? Name, long VramBytes)> QueryRegistryGpus()
    {
        const string classKey =
            @"SYSTEM\CurrentControlSet\Control\Class\{4d36e968-e325-11ce-bfc1-08002be10318}";
        var list = new List<(string?, long)>();
        for (var i = 0; i < 12; i++)
        {
            var subKey = classKey + "\\" + i.ToString("0000");
            var desc = RegUtil.GetString(subKey, "DriverDesc");
            if (string.IsNullOrEmpty(desc)) continue;

            long bytes = RegUtil.GetQword(subKey, "HardwareInformation.qwMemorySize") ?? 0;
            if (bytes <= 0)
            {
                var dword = RegUtil.GetDword(subKey, "HardwareInformation.MemorySize");
                if (dword is < 0)
                    bytes = unchecked((uint)dword.Value); // some drivers report signed values
                else if (dword is > 0)
                    bytes = dword.Value;
            }
            list.Add((desc, bytes));
        }
        return list;
    }
}

/// <summary>VRAM size + memory bandwidth for common GPUs, used for speed estimates.</summary>
public static class GpuDatabase
{
    private static readonly (string Key, int VramMB, int Bandwidth)[] Table =
    {
        // NVIDIA RTX 50
        ("5090", 32768, 1792), ("5080", 16384, 960), ("5070 ti", 16384, 896), ("5070", 12288, 672),
        // NVIDIA RTX 40
        ("4090", 24576, 1008), ("4080 super", 16384, 736), ("4080", 16384, 717),
        ("4070 ti super", 16384, 672), ("4070 ti", 12288, 672), ("4070 super", 12288, 504),
        ("4070", 12288, 504), ("4060 ti", 8192, 288), ("4060", 8192, 272), ("4050", 6144, 216),
        // NVIDIA RTX 30
        ("3090 ti", 24576, 1008), ("3090", 24576, 936), ("3080 ti", 12288, 912), ("3080", 10240, 760),
        ("3070 ti", 8192, 608), ("3070", 8192, 448), ("3060 ti", 8192, 448), ("3060", 12288, 360),
        ("3050", 8192, 224),
        // NVIDIA RTX 20
        ("2080 ti", 11264, 616), ("2080 super", 8192, 496), ("2080", 8192, 448),
        ("2070 super", 8192, 448), ("2070", 8192, 448), ("2060 super", 8192, 448), ("2060", 6144, 336),
        // NVIDIA GTX 10
        ("1080 ti", 11264, 484), ("1080", 8192, 320), ("1070 ti", 8192, 320), ("1070", 8192, 256),
        ("1060", 6144, 192), ("1050 ti", 4096, 112), ("1050", 2048, 112),
        // NVIDIA Titan
        ("titan v", 12288, 653), ("titan xp", 12288, 547), ("titan x", 12288, 480), ("titan rtx", 24576, 672),
        // AMD RX 7000
        ("7900 xtx", 24576, 960), ("7900 xt", 20480, 800), ("7900 gre", 16384, 800),
        ("7800 xt", 16384, 624), ("7700 xt", 12288, 432), ("7600 xt", 16384, 288), ("7600", 8192, 288),
        // AMD RX 6000
        ("6950 xt", 16384, 576), ("6900 xt", 16384, 512), ("6800 xt", 16384, 512), ("6800", 16384, 512),
        ("6750 xt", 12288, 432), ("6700 xt", 12288, 384), ("6650 xt", 8192, 336), ("6600 xt", 8192, 288),
        ("6600", 8192, 224), ("6500 xt", 4096, 144), ("6400", 4096, 128),
        // AMD RX 5000
        ("5700 xt", 8192, 448), ("5700", 8192, 448), ("5600 xt", 6144, 288), ("5500 xt", 8192, 224),
        // Intel Arc
        ("b580", 12288, 456), ("b570", 12288, 380), ("a770", 16384, 560), ("a750", 8192, 512),
        ("a580", 8192, 432), ("a380", 6144, 186)
    };

    /// <summary>Looks up bandwidth by GPU name; falls back to a VRAM-tier estimate.</summary>
    public static int Bandwidth(string gpuName, int vramMB)
    {
        var key = Normalize(gpuName);
        (string, int, int)? best = null;
        foreach (var entry in Table)
        {
            if (!key.Contains(entry.Key)) continue;
            if (best == null || entry.Key.Length > best.Value.Item1.Length)
                best = entry;
        }
        if (best != null) return best.Value.Item3;

        // Unknown GPU: estimate by VRAM tier.
        if (vramMB >= 20480) return 800;
        if (vramMB >= 15360) return 600;
        if (vramMB >= 11776) return 450;
        if (vramMB >= 6144) return 320;
        return 200;
    }

    /// <summary>Strips vendor noise for compact display: "NVIDIA GeForce RTX 4070" → "RTX 4070".</summary>
    public static string ShortName(string gpuName)
    {
        if (string.IsNullOrEmpty(gpuName)) return "GPU";
        var n = Regex.Replace(gpuName, @"\s+", " ").Trim();
        var lowered = n.ToLowerInvariant();
        if (lowered.Contains("rtx") || lowered.Contains("gtx") || lowered.Contains("titan"))
        {
            n = Regex.Replace(n, @"^(nvidia\s+)?(geforce\s+)?", "", RegexOptions.IgnoreCase);
        }
        else if (lowered.Contains("radeon"))
        {
            n = Regex.Replace(n, @"^(amd\s+)?(radeon\s+)?", "", RegexOptions.IgnoreCase);
        }
        else if (lowered.Contains("arc"))
        {
            n = Regex.Replace(n, @"^intel(\(r\))?\s+", "", RegexOptions.IgnoreCase);
            n = n.Replace("(tm)", "").Trim();
        }
        return string.IsNullOrWhiteSpace(n) ? gpuName : n;
    }

    private static string Normalize(string gpuName)
    {
        var n = (gpuName ?? "").ToLowerInvariant();
        var noise = new HashSet<string>
        {
            "nvidia", "geforce", "amd", "radeon", "intel", "(r)", "(tm)", "graphics",
            "arc", "laptop", "gpu", "mobile", "with", "series"
        };
        var words = n.Split(' ', StringSplitOptions.RemoveEmptyEntries)
            .Where(w => !noise.Contains(w))
            .ToList();
        return string.Join(" ", words).Replace(",", " ");
    }
}

/// <summary>Minimal HKLM registry reader via P/Invoke (no extra NuGet packages).</summary>
internal static class RegUtil
{
    private static readonly IntPtr Hklm = new(unchecked((int)0x80000002));
    private const int KeyRead = 0x20019;
    private const int RegSz = 1, RegDword = 4, RegQword = 11;

    [DllImport("advapi32.dll", CharSet = CharSet.Unicode)]
    private static extern int RegOpenKeyExW(IntPtr key, string subKey, int options, int sam, out IntPtr result);

    [DllImport("advapi32.dll", CharSet = CharSet.Unicode)]
    private static extern int RegQueryValueExW(IntPtr key, string valueName, IntPtr reserved, out int type, byte[]? data, ref int cbData);

    [DllImport("advapi32.dll")]
    private static extern int RegCloseKey(IntPtr key);

    public static string? GetString(string subKey, string value)
    {
        var data = Read(subKey, value, RegSz);
        if (data == null) return null;
        var text = Encoding.Unicode.GetString(data);
        var stop = text.IndexOf('\0');
        return stop >= 0 ? text[..stop] : text;
    }

    public static long? GetQword(string subKey, string value)
    {
        var data = Read(subKey, value, RegQword);
        return data != null && data.Length >= 8 ? BitConverter.ToInt64(data, 0) : null;
    }

    public static int? GetDword(string subKey, string value)
    {
        var data = Read(subKey, value, RegDword);
        return data != null && data.Length >= 4 ? BitConverter.ToInt32(data, 0) : null;
    }

    private static byte[]? Read(string subKey, string value, int expectedType)
    {
        try
        {
            if (RegOpenKeyExW(Hklm, subKey, 0, KeyRead, out var handle) != 0)
                return null;
            try
            {
                var size = 0;
                if (RegQueryValueExW(handle, value, IntPtr.Zero, out _, null, ref size) != 0 ||
                    size <= 0 || size > 4096)
                    return null;

                var buffer = new byte[size];
                if (RegQueryValueExW(handle, value, IntPtr.Zero, out var type, buffer, ref size) != 0)
                    return null;
                if (type != expectedType) return null;
                return buffer;
            }
            finally
            {
                RegCloseKey(handle);
            }
        }
        catch
        {
            return null;
        }
    }
}

internal sealed class MemoryStatus
{
    public uint Length = (uint)Marshal.SizeOf<MemoryStatus>();
    public uint MemoryLoad;
    public ulong TotalPhysicalBytes;
    public ulong AvailablePhysicalBytes;
    public ulong TotalPageFileBytes;
    public ulong AvailablePageFileBytes;
    public ulong TotalVirtualBytes;
    public ulong AvailableVirtualBytes;
    public ulong AvailableExtendedVirtualBytes;
}

internal static partial class Native
{
    [DllImport("kernel32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    internal static extern bool GlobalMemoryStatusEx([In, Out] MemoryStatus buffer);
}
