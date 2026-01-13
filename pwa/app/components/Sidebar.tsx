import { useCallback, useEffect } from "react";
import { X, Plus, Eye, FolderOpen, History, ChevronRight, RotateCcw } from "lucide-react";
import { cn } from "../lib/utils";
import {
  useSessionStore,
  type ClaudeProject,
  type ClaudeSessionSummary,
} from "../store/sessionStore";
import { useWebSocket } from "../hooks/useWebSocket";

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
  onNewSession: () => void;
}

export function Sidebar({ isOpen, onClose, onNewSession }: SidebarProps) {
  const { claudeProjects, claudeSessions, selectedClaudeProjectId, setSelectedClaudeProjectId } =
    useSessionStore();
  const {
    fetchClaudeProjects,
    fetchClaudeSessions,
    fetchClaudeSessionMessages,
    resumeClaudeSession,
  } = useWebSocket();

  // サイドバーが開いたときにプロジェクト一覧を取得
  useEffect(() => {
    if (isOpen) {
      fetchClaudeProjects();
    }
  }, [isOpen, fetchClaudeProjects]);

  // プロジェクト選択時にセッション一覧を取得
  useEffect(() => {
    if (selectedClaudeProjectId) {
      fetchClaudeSessions(selectedClaudeProjectId);
    }
  }, [selectedClaudeProjectId, fetchClaudeSessions]);

  const handleSelectClaudeProject = useCallback(
    (project: ClaudeProject) => {
      setSelectedClaudeProjectId(project.id);
    },
    [setSelectedClaudeProjectId]
  );

  const handleViewClaudeHistory = useCallback(
    (session: ClaudeSessionSummary) => {
      fetchClaudeSessionMessages(session.projectId, session.id);
      onClose();
    },
    [fetchClaudeSessionMessages, onClose]
  );

  const handleResumeClaudeSession = useCallback(
    (session: ClaudeSessionSummary, workDir: string) => {
      resumeClaudeSession(session.id, workDir);
      onClose();
    },
    [resumeClaudeSession, onClose]
  );

  return (
    <>
      {/* Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      {/* Sidebar */}
      <div
        className={cn(
          "fixed top-0 left-0 h-full w-80 bg-slate-800 z-50",
          "transform transition-transform duration-200 ease-in-out",
          isOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-700">
          <div className="flex items-center gap-2">
            <History className="w-5 h-5 text-slate-400" />
            <h2 className="text-lg font-semibold text-white">Claude 履歴</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-white transition-colors"
            aria-label="閉じる"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* New Session Button */}
        <div className="p-3 border-b border-slate-700">
          <button
            onClick={() => {
              onNewSession();
              onClose();
            }}
            className={cn(
              "w-full flex items-center justify-center gap-2",
              "py-2.5 px-4 rounded-lg",
              "bg-blue-600 hover:bg-blue-500",
              "text-white font-medium text-sm",
              "transition-colors"
            )}
          >
            <Plus className="w-4 h-4" />
            新規セッション
          </button>
        </div>

        {/* Content Area */}
        <div className="overflow-y-auto h-[calc(100%-140px)]">
          <ClaudeHistoryBrowser
            projects={claudeProjects}
            sessions={claudeSessions}
            selectedProjectId={selectedClaudeProjectId}
            onSelectProject={handleSelectClaudeProject}
            onViewHistory={handleViewClaudeHistory}
            onResumeSession={handleResumeClaudeSession}
          />
        </div>
      </div>
    </>
  );
}

// Claude History Browser Component
interface ClaudeHistoryBrowserProps {
  projects: ClaudeProject[];
  sessions: ClaudeSessionSummary[];
  selectedProjectId: string | null;
  onSelectProject: (project: ClaudeProject) => void;
  onViewHistory: (session: ClaudeSessionSummary) => void;
  onResumeSession: (session: ClaudeSessionSummary, workDir: string) => void;
}

function ClaudeHistoryBrowser({
  projects,
  sessions,
  selectedProjectId,
  onSelectProject,
  onViewHistory,
  onResumeSession,
}: ClaudeHistoryBrowserProps) {
  const selectedProject = projects.find((p) => p.id === selectedProjectId);

  if (!selectedProjectId) {
    // プロジェクト一覧を表示
    return (
      <div className="py-2">
        <h3 className="px-4 py-2 text-xs font-medium text-slate-500 uppercase tracking-wider">
          プロジェクト
        </h3>
        {projects.length === 0 ? (
          <div className="p-4 text-center text-slate-500 text-sm">
            プロジェクトがありません
          </div>
        ) : (
          projects.map((project) => (
            <button
              key={project.id}
              onClick={() => onSelectProject(project)}
              className="w-full px-4 py-3 flex items-center gap-3 hover:bg-slate-700/50 transition-colors text-left"
            >
              <FolderOpen className="w-4 h-4 text-slate-400 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-slate-200 truncate">{project.name}</p>
                <p className="text-xs text-slate-500 truncate">{project.path}</p>
                <p className="text-xs text-slate-500 mt-0.5">
                  {project.sessionCount} セッション
                </p>
              </div>
              <ChevronRight className="w-4 h-4 text-slate-500 flex-shrink-0" />
            </button>
          ))
        )}
      </div>
    );
  }

  // セッション一覧を表示
  return (
    <div className="py-2">
      {/* Back to projects */}
      <button
        onClick={() => onSelectProject({ id: "", path: "", name: "", lastAccessed: 0, sessionCount: 0 })}
        className="w-full px-4 py-2 flex items-center gap-2 text-sm text-blue-400 hover:text-blue-300 transition-colors"
      >
        ← プロジェクト一覧
      </button>

      <h3 className="px-4 py-2 text-xs font-medium text-slate-500">
        {selectedProject?.name || "セッション"}
      </h3>

      {sessions.length === 0 ? (
        <div className="p-4 text-center text-slate-500 text-sm">
          セッションがありません
        </div>
      ) : (
        sessions.map((session) => (
          <div
            key={session.id}
            className="px-4 py-3 hover:bg-slate-700/50 transition-colors"
          >
            <p className="text-sm text-slate-200 line-clamp-2">{session.firstMessage}</p>
            <p className="text-xs text-slate-500 mt-1">
              {new Date(session.timestamp).toLocaleString("ja-JP")} · {session.messageCount} messages
            </p>
            <div className="flex gap-2 mt-2">
              <button
                onClick={() => onViewHistory(session)}
                className="flex items-center gap-1 px-2 py-1 text-xs rounded bg-slate-700 hover:bg-slate-600 text-slate-300 transition-colors"
              >
                <Eye className="w-3 h-3" />
                履歴閲覧
              </button>
              <button
                onClick={() => onResumeSession(session, selectedProject?.path || "")}
                className="flex items-center gap-1 px-2 py-1 text-xs rounded bg-green-900/50 hover:bg-green-800/50 text-green-400 transition-colors"
              >
                <RotateCcw className="w-3 h-3" />
                再開
              </button>
            </div>
          </div>
        ))
      )}
    </div>
  );
}
