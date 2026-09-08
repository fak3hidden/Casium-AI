using System.Text.Json;
using System.Text.Json.Serialization;

namespace Casium.Core;

public sealed class CatalogVariant
{
    public string Tag { get; set; } = "";
    public string Label { get; set; } = "";
    public double ParamsB { get; set; }
    public double SizeGB { get; set; }
    public double? ActiveB { get; set; }
    public bool IsDefault { get; set; }
}

public sealed class CatalogItem
{
    public string Id { get; set; } = "";
    public string Name { get; set; } = "";
    public string Publisher { get; set; } = "";
    public string Description { get; set; } = "";
    public string License { get; set; } = "";
    public string Category { get; set; } = "General";
    public string Context { get; set; } = "";
    public List<string> Capabilities { get; set; } = new();
    public List<CatalogVariant> Variants { get; set; } = new();

    /// <summary>UI cache: filled by the Browse view ("installed" badge text, empty when not).</summary>
    [JsonIgnore]
    public string InstalledLabel { get; set; } = "";

    public string ParamsRange
    {
        get
        {
            if (Variants.Count == 0) return "";
            if (Variants.Count == 1) return Variants[0].Label;
            return $"{Variants[0].Label} – {Variants[^1].Label}";
        }
    }

    public CatalogVariant? DefaultVariant =>
        Variants.FirstOrDefault(v => v.IsDefault) ?? Variants.FirstOrDefault();
}

/// <summary>Bundled catalog of popular local models (see Catalog/catalog.json).</summary>
public sealed class ModelCatalog
{
    private static readonly JsonSerializerOptions Opts = new() { PropertyNameCaseInsensitive = true };

    public List<CatalogItem> Items { get; } = new();

    public ModelCatalog()
    {
        try
        {
            var asm = typeof(ModelCatalog).Assembly;
            var resourceName = asm.GetName().Name + ".Catalog.catalog.json";
            using var stream = asm.GetManifestResourceStream(resourceName);
            if (stream == null)
            {
                Log.Error("Catalog resource not found: " + resourceName);
                return;
            }
            using var reader = new StreamReader(stream);
            var data = JsonSerializer.Deserialize<CatalogData>(reader.ReadToEnd(), Opts);
            if (data?.Models != null)
                Items.AddRange(data.Models.Where(m => m.Variants.Count > 0));
        }
        catch (Exception ex)
        {
            Log.Error(ex, "catalog load");
        }
    }

    public string[] Categories => Items.Select(i => i.Category).Distinct().OrderBy(c => c).ToArray();

    private sealed class CatalogData
    {
        public List<CatalogItem> Models { get; set; } = new();
    }
}
