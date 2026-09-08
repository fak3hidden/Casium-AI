import { HardwareBar } from "./components/HardwareBar";
import { Sidebar } from "./components/Sidebar";
import { ChatView } from "./components/ChatView";
import { BrowseView } from "./components/BrowseView";
import { LibraryView } from "./components/LibraryView";
import { ConnectionsView } from "./components/ConnectionsView";
import { PromptsView } from "./components/PromptsView";
import { SettingsView } from "./components/SettingsView";
import { useStore } from "./lib/useStore";

export default function App() {
  const store = useStore();
  const view = store.state.view;

  return (
    <div className="relative flex h-full bg-ink-950 text-white">
      <div className="aurora" />
      <div className="noise" />
      <Sidebar />
      <div className="relative z-[1] flex min-w-0 flex-1 flex-col">
        {store.state.settings.showHardwareBar && <HardwareBar />}
        {view === "chat" && <ChatView />}
        {view === "library" && <LibraryView />}
        {view === "browse" && <BrowseView />}
        {view === "connections" && <ConnectionsView />}
        {view === "prompts" && <PromptsView />}
        {view === "settings" && <SettingsView />}
      </div>
    </div>
  );
}
