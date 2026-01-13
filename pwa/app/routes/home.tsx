import { useState, useCallback } from "react";
import type { Route } from "./+types/home";
import { ConnectionPanel } from "../components/ConnectionPanel";
import { MessageStream } from "../components/MessageStream";
import { InputArea } from "../components/InputArea";
import { Sidebar } from "../components/Sidebar";
import { ProjectSelector } from "../components/ProjectSelector";
import { useSessionStore } from "../store/sessionStore";
import { useWebSocket } from "../hooks/useWebSocket";
import { Terminal, Menu } from "lucide-react";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Claude Code Mobile" },
    { name: "description", content: "Mobile interface for Claude Code CLI" },
    { name: "theme-color", content: "#0f172a" },
  ];
}

export default function Home() {
  const { isConnected, sessionId } = useSessionStore();
  const { sendMessage, abort, isResponding, createSession } = useWebSocket();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [projectSelectorOpen, setProjectSelectorOpen] = useState(false);

  const handleNewSession = useCallback(() => {
    // ProjectSelector を開く
    setProjectSelectorOpen(true);
  }, []);

  const handleProjectSelect = useCallback(
    (path: string) => {
      createSession(path);
    },
    [createSession]
  );

  return (
    <div className="h-dvh flex flex-col bg-slate-900 text-white">
      {/* Sidebar */}
      <Sidebar
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        onNewSession={handleNewSession}
      />

      {/* Project Selector Modal */}
      <ProjectSelector
        isOpen={projectSelectorOpen}
        onClose={() => setProjectSelectorOpen(false)}
        onSelect={handleProjectSelect}
      />

      {/* Header */}
      <header className="flex items-center gap-2 px-4 py-3 bg-slate-800 border-b border-slate-700">
        {isConnected && (
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-1 -ml-1 text-slate-400 hover:text-white transition-colors"
            aria-label="メニュー"
          >
            <Menu className="w-5 h-5" />
          </button>
        )}
        <Terminal className="w-5 h-5 text-emerald-500" />
        <h1 className="font-semibold">Claude Code</h1>
      </header>

      {/* Connection Panel (always visible, different states) */}
      <ConnectionPanel />

      {/* Chat Interface (only when connected with session) */}
      {isConnected && sessionId && (
        <>
          <MessageStream />
          <InputArea
            onSend={sendMessage}
            onAbort={abort}
            isResponding={isResponding}
          />
        </>
      )}
    </div>
  );
}
