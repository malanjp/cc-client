import { useEffect, useRef } from "react";
import { cn } from "~/lib/utils";
import type { SlashCommand } from "~/data/slashCommands";

interface CommandSuggestionListProps {
  commands: SlashCommand[];
  selectedIndex: number;
  onSelect: (command: SlashCommand) => void;
}

const CATEGORY_LABELS: Record<SlashCommand["category"], string> = {
  session: "セッション",
  context: "コンテキスト",
  diagnostic: "診断",
  config: "設定",
  other: "その他",
};

export function CommandSuggestionList({
  commands,
  selectedIndex,
  onSelect,
}: CommandSuggestionListProps) {
  const listRef = useRef<HTMLUListElement>(null);
  const selectedRef = useRef<HTMLLIElement>(null);

  useEffect(() => {
    selectedRef.current?.scrollIntoView({
      block: "nearest",
      behavior: "smooth",
    });
  }, [selectedIndex]);

  if (commands.length === 0) {
    return null;
  }

  return (
    <ul
      ref={listRef}
      className={cn(
        "absolute bottom-full left-0 right-0 mb-2",
        "max-h-64 overflow-y-auto",
        "bg-slate-800 border border-slate-600 rounded-lg",
        "shadow-lg"
      )}
      role="listbox"
    >
      {commands.map((command, index) => (
        <li
          key={command.name}
          ref={index === selectedIndex ? selectedRef : null}
          role="option"
          aria-selected={index === selectedIndex}
          onClick={() => onSelect(command)}
          className={cn(
            "px-4 py-2 cursor-pointer",
            "flex items-center justify-between gap-2",
            "transition-colors",
            index === selectedIndex
              ? "bg-blue-600 text-white"
              : "hover:bg-slate-700 text-slate-200"
          )}
        >
          <div className="flex items-center gap-3">
            <span className="font-mono font-medium">{command.name}</span>
            <span
              className={cn(
                "text-sm",
                index === selectedIndex ? "text-blue-100" : "text-slate-400"
              )}
            >
              {command.description}
            </span>
          </div>
          <span
            className={cn(
              "text-xs px-2 py-0.5 rounded",
              index === selectedIndex
                ? "bg-blue-500 text-blue-100"
                : "bg-slate-700 text-slate-400"
            )}
          >
            {CATEGORY_LABELS[command.category]}
          </span>
        </li>
      ))}
    </ul>
  );
}
