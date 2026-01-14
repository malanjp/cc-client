import { HelpCircle } from "lucide-react";
import { cn } from "../lib/utils";
import type { ClaudeMessage, ToolUsePromptOption } from "../store/sessionStore";
import { useWebSocket } from "../hooks/useWebSocket";

interface ToolUsePromptProps {
  message: ClaudeMessage;
}

export function ToolUsePrompt({ message }: ToolUsePromptProps) {
  const { respondToToolUse } = useWebSocket();

  // tool_use_prompt タイプのみ toolUsePrompt プロパティを持つ
  if (message.type !== "tool_use_prompt") return null;
  const prompt = message.toolUsePrompt;

  if (!prompt) return null;

  const handleOptionClick = (value: string) => {
    respondToToolUse(prompt.toolUseId, value);
  };

  return (
    <div className="flex gap-3 p-4 rounded-lg bg-blue-900/30 border border-blue-500/50">
      <div className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center bg-blue-600">
        <HelpCircle className="w-4 h-4 text-white" />
      </div>

      <div className="flex-1">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xs text-slate-400">確認</span>
          <span className="text-xs text-slate-500">
            {new Date(message.timestamp).toLocaleTimeString()}
          </span>
        </div>

        <div className="mb-3">
          <div className="text-sm text-slate-200 whitespace-pre-wrap">
            {prompt.question}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {prompt.options.map((option: ToolUsePromptOption) => (
            <button
              key={option.value}
              type="button"
              onClick={() => handleOptionClick(option.value)}
              className={cn(
                "flex flex-col items-start px-3 py-2 rounded-md text-sm font-medium",
                "bg-blue-600/20 text-blue-300 border border-blue-600/50",
                "hover:bg-blue-600/30 transition-colors",
                "min-w-[80px]"
              )}
              title={option.description}
            >
              <span>{option.label}</span>
              {option.description && (
                <span className="text-xs text-slate-400 font-normal mt-0.5">
                  {option.description}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
