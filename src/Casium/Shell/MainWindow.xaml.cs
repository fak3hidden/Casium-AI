using System.Windows;
using System.Windows.Input;
using System.Windows.Media;
using Casium.Core;
using Casium.Services;
using Casium.Views;

namespace Casium.Shell;

public partial class MainWindow : Window
{
    private readonly Dictionary<string, FrameworkElement> _views = new();
    private FrameworkElement? _current;
    private bool _syncingNav;

    public static MainWindow? Instance { get; private set; }

    public MainWindow()
    {
        InitializeComponent();
        Instance = this;
        ToastService.Attach(ToastLayer);
        Loaded += OnLoaded;
        StateChanged += (_, _) => UpdateMaximizeGlyph();
        Bus.EngineChanged += UpdateEngineUi;
    }

    private void OnLoaded(object sender, RoutedEventArgs e)
    {
        UpdateEngineUi();
        AppServices.Engine.Start();
        Navigate("Chat");
    }

    // ---------------------------------------------------------------- navigation

    public void Navigate(string label)
    {
        var view = label switch
        {
            "Browse models" => Cached("Browse models", () => new BrowseView()),
            "Local models" => Cached("Local models", () => new ModelsView()),
            "Prompts" => Cached("Prompts", () => new PromptsView()),
            "Connections" => Cached("Connections", () => new McpView()),
            "Settings" => Cached("Settings", () => new SettingsView()),
            _ => Cached("Chat", () => new ChatView())
        };

        if (!ReferenceEquals(view, _current))
        {
            Host.Content = view;
            _current = view;
        }
        PageTitle.Text = label;

        _syncingNav = true;
        try
        {
            NavChat.IsChecked = label == "Chat";
            NavBrowse.IsChecked = label == "Browse models";
            NavModels.IsChecked = label == "Local models";
            NavPrompts.IsChecked = label == "Prompts";
            NavConnections.IsChecked = label == "Connections";
            NavSettings.IsChecked = label == "Settings";
        }
        finally
        {
            _syncingNav = false;
        }
    }

    private void Nav_Checked(object sender, RoutedEventArgs e)
    {
        if (_syncingNav) return;
        if (sender is RadioButton { Content: string label })
            Navigate(label);
    }

    private FrameworkElement Cached(string key, Func<FrameworkElement> factory)
    {
        if (!_views.TryGetValue(key, out var view))
        {
            view = factory();
            _views[key] = view;
        }
        return view;
    }

    private void OnPreviewKeyDown(object sender, KeyEventArgs e)
    {
        if (Keyboard.Modifiers != ModifierKeys.Control) return;
        var index = e.Key switch
        {
            Key.D1 or Key.NumPad1 => 0,
            Key.D2 or Key.NumPad2 => 1,
            Key.D3 or Key.NumPad3 => 2,
            Key.D4 or Key.NumPad4 => 3,
            Key.D5 or Key.NumPad5 => 4,
            Key.D6 or Key.NumPad6 => 5,
            _ => -1
        };
        if (index >= 0)
        {
            var label = index switch
            {
                0 => "Chat",
                1 => "Browse models",
                2 => "Local models",
                3 => "Prompts",
                4 => "Connections",
                _ => "Settings"
            };
            Navigate(label);
            e.Handled = true;
        }
    }

    // ---------------------------------------------------------------- engine pill

    private void UpdateEngineUi()
    {
        var online = AppServices.Engine.IsOnline;
        var version = AppServices.Engine.Version;

        var brush = TryFindResource(online ? "Brush.Success" : "Brush.Danger") as Brush ?? Brushes.Gray;
        EngineDot.Fill = brush;
        FooterDot.Fill = brush;
        EngineText.Text = online
            ? (string.IsNullOrEmpty(version) ? "Engine online" : $"Engine online · {version}")
            : "Engine offline";
        FooterEngineText.Text = online
            ? (string.IsNullOrEmpty(version) ? "Running" : $"Ollama {version}")
            : "Not running";
    }

    private void EngineStatus_Click(object sender, RoutedEventArgs e) => Navigate("Settings");

    // ---------------------------------------------------------------- window chrome

    private void Minimize_Click(object sender, RoutedEventArgs e) => WindowState = WindowState.Minimized;

    private void Maximize_Click(object sender, RoutedEventArgs e)
    {
        WindowState = WindowState == WindowState.Maximized ? WindowState.Normal : WindowState.Maximized;
    }

    private void Close_Click(object sender, RoutedEventArgs e) => Close();

    private void UpdateMaximizeGlyph()
    {
        MaximizeButton.Content = WindowState == WindowState.Maximized ? "\uE923" : "\uE922";
    }
}
