import { ShieldQuestion, Check, X } from "lucide-react";
import { cn } from "../lib/utils";
import type { ClaudeMessage } from "../store/sessionStore";
import { useWebSocket } from "../hooks/useWebSocket";

interface PermissionRequestProps {
  message: ClaudeMessage;
}

export function PermissionRequest({ message }: PermissionRequestProps) {
  const { approve, reject } = useWebSocket();

  // permission_request タイプのみ permissionRequest プロパティを持つ
  if (message.type !== "permission_request") return null;
  const pr = message.permissionRequest;

  if (!pr) return null;

  return (
    <div className="flex gap-3 p-4 rounded-lg bg-orange-900/30 border border-orange-500/50">
      <div className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center bg-orange-600">
        <ShieldQuestion className="w-4 h-4 text-white" />
      </div>

      <div className="flex-1">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xs text-slate-400">権限リクエスト</span>
          <span className="text-xs text-slate-500">
            {new Date(message.timestamp).toLocaleTimeString()}
          </span>
        </div>

        <div className="mb-3">
          <div className="text-sm font-medium text-orange-300 mb-1">
            {pr.tool}
          </div>
          {pr.description && (
            <div className="text-sm text-slate-300">{pr.description}</div>
          )}
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={reject}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium",
              "bg-red-600/20 text-red-400 border border-red-600/50",
              "hover:bg-red-600/30 transition-colors"
            )}
          >
            <X className="w-4 h-4" />
            拒否
          </button>
          <button
            type="button"
            onClick={approve}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium",
              "bg-emerald-600/20 text-emerald-400 border border-emerald-600/50",
              "hover:bg-emerald-600/30 transition-colors"
            )}
          >
            <Check className="w-4 h-4" />
            承認
          </button>
        </div>
      </div>
    </div>
  );
}
