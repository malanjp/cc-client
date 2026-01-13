import { useState, useCallback, type FormEvent } from "react";
import { Wifi, WifiOff, Loader2, RefreshCw, X } from "lucide-react";
import { cn } from "../lib/utils";
import { useSessionStore, saveServerUrl } from "../store/sessionStore";
import { useWebSocket } from "../hooks/useWebSocket";

const MAX_RECONNECT_ATTEMPTS = 5;

export function ConnectionPanel() {
  const {
    serverUrl,
    isConnected,
    isConnecting,
    connectionError,
    sessionId,
    isReconnecting,
    reconnectAttempts,
  } = useSessionStore();
  const {
    connect,
    disconnect,
    cancelReconnect,
    endSession,
  } = useWebSocket();

  const [inputUrl, setInputUrl] = useState(serverUrl || "http://localhost:8080");

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
              onClick={handleDisconnect}
              className="text-xs text-red-400 hover:text-red-300"
            >
              切断
            </button>
          </div>
        </div>
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
