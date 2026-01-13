import { useState, useCallback, useEffect, type FormEvent, type KeyboardEvent } from "react";
import { Send, Square } from "lucide-react";
import { cn } from "../lib/utils";

interface InputAreaProps {
  onSend: (message: string) => void;
  onAbort: () => void;
  isResponding: boolean;
  disabled?: boolean;
}

export function InputArea({ onSend, onAbort, isResponding, disabled }: InputAreaProps) {
  const [message, setMessage] = useState("");
  const [isComposing, setIsComposing] = useState(false);

  // Esc キーで応答を中断
  useEffect(() => {
    const handleKeyDown = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape" && isResponding) {
        onAbort();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isResponding, onAbort]);

  const handleSubmit = useCallback(
    (e: FormEvent) => {
      e.preventDefault();
      if (message.trim() && !disabled && !isResponding) {
        onSend(message.trim());
        setMessage("");
      }
    },
    [message, onSend, disabled, isResponding]
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      // IME 変換中は Enter で送信しない
      if (e.key === "Enter" && !e.shiftKey && !isComposing) {
        e.preventDefault();
        if (message.trim() && !disabled && !isResponding) {
          onSend(message.trim());
          setMessage("");
        }
      }
    },
    [message, onSend, disabled, isResponding, isComposing]
  );

  return (
    <form
      onSubmit={handleSubmit}
      className="border-t border-slate-700 bg-slate-900 p-4"
    >
      <div className="flex items-end gap-2">
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={handleKeyDown}
          onCompositionStart={() => setIsComposing(true)}
          onCompositionEnd={() => setIsComposing(false)}
          placeholder="Message Claude..."
          disabled={disabled || isResponding}
          rows={1}
          className={cn(
            "flex-1 resize-none rounded-lg border border-slate-600",
            "bg-slate-800 px-4 py-3 text-white placeholder:text-slate-400",
            "focus:outline-none focus:ring-2 focus:ring-blue-500",
            "disabled:opacity-50 disabled:cursor-not-allowed",
            "min-h-[48px] max-h-[200px]"
          )}
          style={{
            height: "auto",
            minHeight: "48px",
          }}
          onInput={(e) => {
            const target = e.target as HTMLTextAreaElement;
            target.style.height = "auto";
            target.style.height = Math.min(target.scrollHeight, 200) + "px";
          }}
        />

        {isResponding ? (
          <button
            type="button"
            onClick={onAbort}
            className={cn(
              "flex-shrink-0 w-12 h-12 rounded-lg",
              "bg-red-600 hover:bg-red-500",
              "flex items-center justify-center",
              "transition-colors"
            )}
            title="停止 (Esc)"
          >
            <Square className="w-5 h-5 text-white" />
          </button>
        ) : (
          <button
            type="submit"
            disabled={disabled || !message.trim()}
            className={cn(
              "flex-shrink-0 w-12 h-12 rounded-lg",
              "bg-blue-600 hover:bg-blue-500",
              "flex items-center justify-center",
              "disabled:opacity-50 disabled:cursor-not-allowed",
              "transition-colors"
            )}
          >
            <Send className="w-5 h-5 text-white" />
          </button>
        )}
      </div>

      <p className="text-xs text-slate-500 mt-2 text-center">
        {isResponding
          ? "応答中... Esc または停止ボタンで中断"
          : "Enter で送信、Shift+Enter で改行"}
      </p>
    </form>
  );
}
