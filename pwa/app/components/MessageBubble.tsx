import { useState } from "react";
import Markdown from "react-markdown";
import { cn } from "../lib/utils";
import type { ClaudeMessage } from "../store/sessionStore";
import { Bot, User, Wrench, AlertCircle, Brain, ShieldQuestion, FileText, ChevronDown, ChevronRight, type LucideIcon } from "lucide-react";

interface MessageBubbleProps {
  message: ClaudeMessage;
}

// Configuration maps for different message types
const iconMap: Record<ClaudeMessage["type"], LucideIcon> = {
  user: User,
  error: AlertCircle,
  tool_use: Wrench,
  tool_result: FileText,
  thinking: Brain,
  assistant: Bot,
  system: Bot,
  permission_request: ShieldQuestion,
};

const styleMap: Record<ClaudeMessage["type"], { bg: string; iconBg: string }> = {
  user: { bg: "bg-blue-900/30 ml-8", iconBg: "bg-blue-600" },
  error: { bg: "bg-red-900/30", iconBg: "bg-red-600" },
  tool_use: { bg: "bg-amber-900/20", iconBg: "bg-amber-600" },
  tool_result: { bg: "bg-slate-700/30", iconBg: "bg-slate-500" },
  thinking: { bg: "bg-purple-900/20", iconBg: "bg-purple-600" },
  assistant: { bg: "bg-slate-800/50 mr-8", iconBg: "bg-emerald-600" },
  system: { bg: "bg-slate-800/50 mr-8", iconBg: "bg-emerald-600" },
  permission_request: { bg: "bg-orange-900/30 border border-orange-500/50", iconBg: "bg-orange-600" },
};

const labelMap: Record<ClaudeMessage["type"], string> = {
  user: "あなた",
  error: "エラー",
  tool_use: "",
  tool_result: "実行結果",
  thinking: "思考中",
  assistant: "Claude",
  system: "Claude",
  permission_request: "権限リクエスト",
};

export function MessageBubble({ message }: MessageBubbleProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const Icon = iconMap[message.type];
  const styles = styleMap[message.type];
  const label = message.type === "tool_use"
    ? message.toolName || "ツール"
    : labelMap[message.type];

  const renderToolInput = () => {
    if (!message.toolInput) return null;

    const entries = Object.entries(message.toolInput);
    const previewEntries = entries.slice(0, 2);
    const hasMore = entries.length > 2;

    return (
      <div className="space-y-2">
        <div className="space-y-1">
          {previewEntries.map(([key, value]) => (
            <div key={key} className="text-xs">
              <span className="text-amber-400">{key}:</span>{" "}
              <span className="text-slate-300">
                {typeof value === "string"
                  ? value.length > 50 ? `${value.slice(0, 50)}...` : value
                  : JSON.stringify(value)}
              </span>
            </div>
          ))}
        </div>

        {(hasMore || isExpanded) && (
          <button
            type="button"
            onClick={() => setIsExpanded(!isExpanded)}
            className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-300 transition-colors"
          >
            {isExpanded ? (
              <>
                <ChevronDown className="w-3 h-3" />
                折りたたむ
              </>
            ) : (
              <>
                <ChevronRight className="w-3 h-3" />
                詳細を表示 ({entries.length - 2} 件)
              </>
            )}
          </button>
        )}

        {isExpanded && (
          <pre className="text-xs bg-slate-900/50 p-2 rounded overflow-x-auto mt-2">
            <code>{JSON.stringify(message.toolInput, null, 2)}</code>
          </pre>
        )}
      </div>
    );
  };

  return (
    <div className={cn("flex gap-3 p-4 rounded-lg", styles.bg)}>
      <div
        className={cn(
          "flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center",
          styles.iconBg
        )}
      >
        <Icon className="w-4 h-4 text-white" />
      </div>

      <div className="flex-1 overflow-hidden">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xs text-slate-400">{label}</span>
          <span className="text-xs text-slate-500">
            {new Date(message.timestamp).toLocaleTimeString()}
          </span>
        </div>

        <div className="prose prose-sm prose-invert max-w-none">
          {message.type === "tool_use" ? (
            renderToolInput()
          ) : (
            <Markdown>{message.content}</Markdown>
          )}
        </div>
      </div>
    </div>
  );
}
