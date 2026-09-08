import clsx from "clsx";
import {
  Box,
  Compass,
  Link2,
  MessageSquare,
  Plus,
  ScrollText,
  Settings,
} from "lucide-react";
import { useStore } from "../lib/useStore";
import type { View } from "../lib/types";

const NAV: { id: View; label: string; icon: typeof Compass }[] = [
  { id: "chat", label: "Chat", icon: MessageSquare },
  { id: "library", label: "Library", icon: Box },
  { id: "browse", label: "Browse", icon: Compass },
  { id: "connections", label: "Connections", icon: Link2 },
  { id: "prompts", label: "Prompts", icon: ScrollText },
  { id: "settings", label: "Settings", icon: Settings },
];

export function Sidebar() {
  const store = useStore();
  const { view, installed, mcp } = store.state;
  const ready = installed.filter((i) => i.status === "ready").length;
  const liveMcp = mcp.filter((m) => m.enabled).length;

  return (
    <aside className="flex w-[200px] shrink-0 flex-col border-r border-line bg-panel">
      <div className="flex h-11 items-center gap-2 px-3">
        <span className="flex h-[18px] w-[18px] items-center justify-center rounded-[4px] bg-fg text-[11px] font-semibold text-bg">
          C
        </span>
        <span className="text-[13px] font-medium">Casium</span>
      </div>

      <div className="px-2 pb-2">
        <button onClick={() => store.newChat()} className="btn btn-primary w-full">
          <Plus size={14} />
          New chat
        </button>
      </div>

      <nav className="flex flex-1 flex-col gap-px px-2">
        {NAV.map((item) => {
          const Icon = item.icon;
          const active = view === item.id;
          const badge =
            item.id === "library" ? ready : item.id === "connections" ? liveMcp : null;
          return (
            <button
              key={item.id}
              onClick={() => store.setView(item.id)}
              className={clsx(
                "flex h-8 items-center gap-2 rounded-md px-2 text-[13px]",
                active ? "bg-raised text-fg" : "text-mute hover:bg-raised/60 hover:text-fg",
              )}
            >
              <Icon size={15} strokeWidth={1.75} />
              <span className="flex-1 text-left">{item.label}</span>
              {badge != null && badge > 0 && (
                <span className="font-mono text-[11px] text-faint">{badge}</span>
              )}
            </button>
          );
        })}
      </nav>

      <div className="border-t border-line px-3 py-2.5 font-mono text-[11px] text-faint">
        127.0.0.1:{store.state.settings.apiPort}/v1
      </div>
    </aside>
  );
}
