import clsx from "clsx";
import {
  BookOpen,
  Box,
  Compass,
  Link2,
  MessageSquarePlus,
  ScrollText,
  Settings,
} from "lucide-react";
import { useStore } from "../lib/useStore";
import type { View } from "../lib/types";

const NAV: { id: View; label: string; icon: typeof Compass }[] = [
  { id: "chat", label: "Chat", icon: MessageSquarePlus },
  { id: "library", label: "Library", icon: Box },
  { id: "browse", label: "Browse AIs", icon: Compass },
  { id: "connections", label: "Connections", icon: Link2 },
  { id: "prompts", label: "Prompts", icon: ScrollText },
  { id: "settings", label: "Settings", icon: Settings },
];

export function Sidebar() {
  const store = useStore();
  const { view, installed, mcp, conversations } = store.state;
  const ready = installed.filter((i) => i.status === "ready").length;
  const liveMcp = mcp.filter((m) => m.enabled).length;

  return (
    <aside className="flex w-[72px] shrink-0 flex-col items-center border-r border-white/[0.06] bg-ink-900/90 py-4 lg:w-[232px] lg:items-stretch lg:px-3">
      <div className="mb-6 flex items-center gap-3 px-1 lg:px-2">
        <img
          src="/logo.png"
          alt="Casium"
          className="h-10 w-10 rounded-xl ring-1 ring-white/10"
        />
        <div className="hidden lg:block">
          <div className="font-serif text-lg leading-none text-white">Casium</div>
          <div className="mt-1 font-mono text-[10px] uppercase tracking-[0.22em] text-casium/70">
            Local AI
          </div>
        </div>
      </div>

      <nav className="flex flex-1 flex-col gap-1">
        {NAV.map((item) => {
          const Icon = item.icon;
          const active = view === item.id;
          const badge =
            item.id === "library"
              ? ready
              : item.id === "connections"
                ? liveMcp
                : item.id === "chat"
                  ? conversations.length
                  : null;
          return (
            <button
              key={item.id}
              onClick={() => store.setView(item.id)}
              className={clsx(
                "group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition",
                active
                  ? "bg-white/[0.06] text-white shadow-inner"
                  : "text-white/50 hover:bg-white/[0.03] hover:text-white/80",
              )}
            >
              {active && (
                <span className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-casium lg:left-1" />
              )}
              <Icon size={18} strokeWidth={1.7} />
              <span className="hidden flex-1 text-left lg:block">{item.label}</span>
              {badge != null && (
                <span className="hidden font-mono text-[10px] text-white/30 lg:block">
                  {badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      <button
        onClick={() => store.newChat()}
        className="mt-3 hidden items-center justify-center gap-2 rounded-xl bg-casium px-3 py-2.5 text-sm font-semibold text-ink-950 transition hover:brightness-110 lg:flex"
      >
        <MessageSquarePlus size={16} />
        New chat
      </button>

      <div className="mt-4 hidden rounded-xl border border-white/[0.06] bg-white/[0.03] p-3 lg:block">
        <div className="flex items-center gap-2 text-[11px] text-white/45">
          <BookOpen size={12} />
          OpenAI-compatible
        </div>
        <div className="mt-1 truncate font-mono text-[11px] text-casium/80">
          127.0.0.1:{store.state.settings.apiPort}/v1
        </div>
      </div>
    </aside>
  );
}
