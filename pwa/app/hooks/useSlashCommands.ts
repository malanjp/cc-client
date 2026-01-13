import { useState, useMemo, useCallback } from "react";
import {
  BUILTIN_SLASH_COMMANDS,
  type SlashCommand,
} from "~/data/slashCommands";

interface UseSlashCommandsResult {
  showSuggestions: boolean;
  filteredCommands: SlashCommand[];
  selectedIndex: number;
  selectNext: () => void;
  selectPrev: () => void;
  getSelectedCommand: () => SlashCommand | null;
  resetSelection: () => void;
}

export function useSlashCommands(input: string): UseSlashCommandsResult {
  const [selectedIndex, setSelectedIndex] = useState(0);

  const showSuggestions = useMemo(() => {
    return input.startsWith("/") && !input.includes(" ") && input.length > 0;
  }, [input]);

  const filteredCommands = useMemo(() => {
    if (!showSuggestions) return [];

    const query = input.slice(1).toLowerCase();
    if (query === "") {
      return BUILTIN_SLASH_COMMANDS;
    }

    return BUILTIN_SLASH_COMMANDS.filter((cmd) =>
      cmd.name.toLowerCase().includes(query)
    );
  }, [input, showSuggestions]);

  const selectNext = useCallback(() => {
    setSelectedIndex((prev) =>
      prev < filteredCommands.length - 1 ? prev + 1 : 0
    );
  }, [filteredCommands.length]);

  const selectPrev = useCallback(() => {
    setSelectedIndex((prev) =>
      prev > 0 ? prev - 1 : filteredCommands.length - 1
    );
  }, [filteredCommands.length]);

  const getSelectedCommand = useCallback((): SlashCommand | null => {
    if (filteredCommands.length === 0) return null;
    const safeIndex = Math.min(selectedIndex, filteredCommands.length - 1);
    return filteredCommands[safeIndex] ?? null;
  }, [filteredCommands, selectedIndex]);

  const resetSelection = useCallback(() => {
    setSelectedIndex(0);
  }, []);

  // インデックスが範囲外になったらリセット
  const safeSelectedIndex = useMemo(() => {
    if (filteredCommands.length === 0) return 0;
    return Math.min(selectedIndex, filteredCommands.length - 1);
  }, [selectedIndex, filteredCommands.length]);

  return {
    showSuggestions,
    filteredCommands,
    selectedIndex: safeSelectedIndex,
    selectNext,
    selectPrev,
    getSelectedCommand,
    resetSelection,
  };
}
