using System.ComponentModel;
using System.Runtime.CompilerServices;

namespace Casium.Core;

/// <summary>Minimal INotifyPropertyChanged base class for bindable objects.</summary>
public abstract class ObservableObject : INotifyPropertyChanged
{
    public event PropertyChangedEventHandler? PropertyChanged;

    protected void OnPropertyChanged(string name) =>
        PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(name));

    protected bool Set<T>(ref T field, T value, [CallerMemberName] string? name = null)
    {
        if (EqualityComparer<T>.Default.Equals(field, value)) return false;
        field = value;
        OnPropertyChanged(name ?? "?");
        return true;
    }
}
