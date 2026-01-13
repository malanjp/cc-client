import { useState, useCallback, type FormEvent } from "react";
import { Wifi, WifiOff, Loader2, History, Play, Eye, RefreshCw, X } from "lucide-react";
import { cn } from "../lib/utils";
import { useSessionStore, saveServerUrl, type SessionInfo } from "../store/sessionStore";
import { useWebSocket } from "../hooks/useWebSocket";

const MAX_RECONNECT_ATTEMPTS = 5;

export function ConnectionPanel() {
  const {
    serverUrl,
    isConnected,
    isConnecting,
    connectionError,
    sessionId,
    availableSessions,
    isReconnecting,
    reconnectAttempts,
  } = useSessionStore();
  const {
    connect,
    disconnect,
    cancelReconnect,
    endSession,
    fetchSessions,
    restoreSession,
    attachSession,
  } = useWebSocket();

  const [inputUrl, setInputUrl] = useState(serverUrl || "http://localhost:8080");
  const [showSessions, setShowSessions] = useState(false);

  const handleConnect = useCallback(
    (e: FormEvent) => {
      e.preventDefault();
      const url = inputUrl.trim();
      if (url) {
        saveServerUrl(url);
        connect(url);
      }
    },
    [inputUrl, connect]
  );

  const handleDisconnect = useCallback(() => {
    if (sessionId) {
      endSession();
    }
    disconnect();
  }, [sessionId, endSession, disconnect]);

  // セッション一覧を取得
  const handleShowSessions = useCallback(async () => {
    if (showSessions) {
      setShowSessions(false);
    } else {
      await fetchSessions();
      setShowSessions(true);
    }
  }, [showSessions, fetchSessions]);

  const handleSelectSession = useCallback(
    (session: (typeof availableSessions)[0]) => {
      if (session.processAlive) {
        attachSession(session.id);
      } else {
        restoreSession(session.id);
      }
      setShowSessions(false);
    },
    [attachSession, restoreSession]
  );

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleString("ja-JP", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  if (isConnected && sessionId) {
    return (
      <div className="bg-slate-800 border-b border-slate-700">
        <div className="px-4 py-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Wifi className="w-4 h-4 text-green-500" />
            <span className="text-sm text-slate-300">接続中</span>
            <span className="text-xs text-slate-500">セッション: {sessionId.slice(0, 8)}...</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleShowSessions}
              className="text-xs text-slate-400 hover:text-slate-300 flex items-center gap-1"
            >
              <History className="w-3 h-3" />
              履歴
            </button>
            <button
              onClick={handleDisconnect}
              className="text-xs text-red-400 hover:text-red-300"
            >
              切断
            </button>
          </div>
        </div>
        {showSessions && (
          <SessionList
            sessions={availableSessions}
            onSelect={handleSelectSession}
            formatDate={formatDate}
          />
        )}
      </div>
    );
  }

  if (isConnected && !sessionId) {
    return (
      <div className="bg-slate-800 border-b border-slate-700 p-4">
        <div className="flex items-center justify-center gap-2">
          <Loader2 className="w-4 h-4 text-emerald-500 animate-spin" />
          <span className="text-sm text-slate-300">セッションを初期化中...</span>
        </div>
      </div>
    );
  }

  // 再接続中の表示
  if (isReconnecting) {
    return (
      <div className="bg-slate-800 p-6">
        <div className="max-w-md mx-auto">
          <div className="flex flex-col items-center gap-4">
            <div className="flex items-center gap-2">
              <RefreshCw className="w-5 h-5 text-amber-500 animate-spin" />
              <h2 className="text-lg font-semibold text-white">再接続中...</h2>
            </div>
            <p className="text-sm text-slate-400">
              {reconnectAttempts} / {MAX_RECONNECT_ATTEMPTS} 回目の試行
            </p>
            <button
              type="button"
              onClick={cancelReconnect}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-lg",
                "bg-slate-700 hover:bg-slate-600",
                "text-slate-300 text-sm",
                "transition-colors"
              )}
            >
              <X className="w-4 h-4" />
              再接続をキャンセル
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-slate-800 p-6">
      <div className="max-w-md mx-auto">
        <div className="flex items-center gap-2 mb-4">
          <WifiOff className="w-5 h-5 text-slate-400" />
          <h2 className="text-lg font-semibold text-white">
            Bridge Server に接続
          </h2>
        </div>

        <form onSubmit={handleConnect} className="space-y-4">
          <div>
            <label className="block text-sm text-slate-400 mb-1">
              サーバー URL
            </label>
            <input
              type="text"
              value={inputUrl}
              onChange={(e) => setInputUrl(e.target.value)}
              placeholder="http://100.x.x.x:8080"
              className={cn(
                "w-full rounded-lg border border-slate-600",
                "bg-slate-700 px-4 py-3 text-white placeholder:text-slate-400",
                "focus:outline-none focus:ring-2 focus:ring-blue-500"
              )}
            />
            <p className="text-xs text-slate-500 mt-1">
              Mac の Tailscale IP アドレスを入力
            </p>
          </div>

          {connectionError && (
            <p className="text-sm text-red-400">{connectionError}</p>
          )}

          <button
            type="submit"
            disabled={isConnecting || !inputUrl.trim()}
            className={cn(
              "w-full py-3 rounded-lg",
              "bg-blue-600 hover:bg-blue-500",
              "text-white font-medium",
              "disabled:opacity-50 disabled:cursor-not-allowed",
              "flex items-center justify-center gap-2",
              "transition-colors"
            )}
          >
            {isConnecting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                接続中...
              </>
            ) : (
              "接続"
            )}
          </button>
        </form>
      </div>
    </div>
  );
}

// セッション一覧コンポーネント
interface SessionListProps {
  sessions: SessionInfo[];
  onSelect: (session: SessionInfo) => void;
  formatDate: (timestamp: number) => string;
}

function SessionList({ sessions, onSelect, formatDate }: SessionListProps) {
  if (sessions.length === 0) {
    return (
      <div className="px-4 py-3 border-t border-slate-700">
        <p className="text-xs text-slate-500 text-center">履歴がありません</p>
      </div>
    );
  }

  return (
    <div className="border-t border-slate-700 max-h-48 overflow-y-auto">
      {sessions.map((session) => (
        <button
          key={session.id}
          onClick={() => onSelect(session)}
          className={cn(
            "w-full px-4 py-2 flex items-center gap-3",
            "hover:bg-slate-700/50 transition-colors",
            "text-left border-b border-slate-700/50 last:border-b-0"
          )}
        >
          {session.processAlive ? (
            <Play className="w-3 h-3 text-green-500 flex-shrink-0" />
          ) : (
            <Eye className="w-3 h-3 text-slate-500 flex-shrink-0" />
          )}
          <div className="flex-1 min-w-0">
            <p className="text-xs text-slate-300 truncate">
              {session.workDir.split("/").pop() || session.workDir}
            </p>
            <p className="text-xs text-slate-500">{formatDate(session.createdAt)}</p>
          </div>
          <span
            className={cn(
              "text-xs px-1.5 py-0.5 rounded",
              session.processAlive
                ? "bg-green-900/50 text-green-400"
                : "bg-slate-700 text-slate-400"
            )}
          >
            {session.processAlive ? "実行中" : "履歴"}
          </span>
        </button>
      ))}
    </div>
  );
}
