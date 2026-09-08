using System.Collections.ObjectModel;

namespace Casium.Core;

public sealed class PullJob : ObservableObject
{
    private string _status = "Connecting…";
    private double _progress; // -1 = indeterminate, 0..1 = downloading
    private bool _running = true;

    public PullJob(string tag) => Tag = tag;

    public string Tag { get; }
    public CancellationTokenSource Cts { get; } = new();

    public string Status { get => _status; private set => Set(ref _status, value); }

    public double Progress
    {
        get => _progress;
        private set
        {
            if (Set(ref _progress, value))
            {
                OnPropertyChanged(nameof(ProgressFraction));
                OnPropertyChanged(nameof(IsIndeterminate));
            }
        }
    }

    /// <summary>Clamped 0..1 value safe to feed a ProgressBar.</summary>
    public double ProgressFraction => Math.Max(0, _progress);

    public bool IsIndeterminate => _running && _progress < 0;

    public bool Running
    {
        get => _running;
        private set
        {
            if (Set(ref _running, value))
                OnPropertyChanged(nameof(IsIndeterminate));
        }
    }

    public bool Failed { get; private set; }

    internal void SetStatus(string status) => Status = status;
    internal void SetProgress(double progress) => Progress = progress;
    internal void SetIndeterminate() => Progress = -1;
    internal void Finish(string status, bool failed)
    {
        Failed = failed;
        Running = false;
        if (!failed) Progress = 1;
        Status = status;
    }
}

/// <summary>Tracks in-flight model downloads (pulls) started from any view.</summary>
public sealed class PullManager
{
    private readonly OllamaClient _client;
    private readonly EngineMonitor _engine;

    public PullManager(OllamaClient client, EngineMonitor engine)
    {
        _client = client;
        _engine = engine;
    }

    public ObservableCollection<PullJob> Jobs { get; } = new();

    public bool IsPulling(string tag)
    {
        for (var i = 0; i < Jobs.Count; i++)
            if (Jobs[i].Tag == tag && Jobs[i].Running) return true;
        return false;
    }

    public void Start(string tag)
    {
        if (IsPulling(tag)) return;
        var job = new PullJob(tag);
        Jobs.Add(job);
        Bus.RaisePullsChanged();
        _ = RunAsync(job);
    }

    public void Cancel(PullJob job) => job.Cts.Cancel();

    private async Task RunAsync(PullJob job)
    {
        var layers = new Dictionary<string, (long Completed, long Total)>();
        var progress = new Progress<PullProgress>(p =>
        {
            if (p.Digest != null && p.Total is > 0)
                layers[p.Digest] = ((p.Completed ?? 0), p.Total.Value);

            if (layers.Count > 0)
            {
                long done = 0, total = 0;
                foreach (var layer in layers.Values) { done += layer.Completed; total += layer.Total; }
                job.SetProgress(total > 0 ? (double)done / total : -1);
                job.SetStatus($"Downloading — {Format.Bytes(Math.Max(0, total - done))} left");
            }
            else if (p.Status != null)
            {
                job.SetIndeterminate();
                job.SetStatus(char.ToUpper(p.Status[0]) + p.Status[1..]);
            }
        });

        try
        {
            await _client.PullAsync(job.Tag, progress, job.Cts.Token);
            await _engine.RefreshModelsAsync();
            job.Finish("Done", failed: false);
            Bus.RaiseModelsChanged();
        }
        catch (OperationCanceledException)
        {
            job.Finish("Cancelled", failed: true);
        }
        catch (Exception ex)
        {
            Log.Error(ex, "pull " + job.Tag);
            job.Finish("Failed — " + ex.Message, failed: true);
        }
        finally
        {
            Bus.RaisePullsChanged();
            _ = Task.Delay(15000).ContinueWith(_ =>
                Bus.RunOnUi(() =>
                {
                    if (!job.Running) Jobs.Remove(job);
                }));
        }
    }
}
