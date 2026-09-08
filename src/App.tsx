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
    <div className="flex h-full bg-bg text-fg">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
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
