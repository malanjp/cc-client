import { create } from "zustand";

// Re-export shared types for backward compatibility
export type {
  UiMessage as ClaudeMessage,
  ToolUsePrompt,
  ToolUsePromptOption,
  UiToolResultMessage,
  UiToolUseMessage,
  UiAssistantMessage,
  UiUserMessage,
  UiSystemMessage,
  UiThinkingMessage,
  UiErrorMessage,
} from "@cc-client/shared";

// Import for internal use
import type { UiMessage } from "@cc-client/shared";

// Use the shared type internally
type ClaudeMessage = UiMessage;

// Maximum number of messages to keep in memory
const MAX_MESSAGES = 1000;

export interface ClaudeProject {
  id: string;
  path: string;
  name: string;
  lastAccessed: number;
  sessionCount: number;
}

export interface ClaudeSessionSummary {
  id: string;
  projectId: string;
  firstMessage: string;
  timestamp: string;
  messageCount: number;
}

export interface SessionState {
  // Connection state
  serverUrl: string;
  isConnected: boolean;
  isConnecting: boolean;
  connectionError: string | null;

  // Reconnection state
  isReconnecting: boolean;
  reconnectAttempts: number;

  // Session state
  sessionId: string | null;
  claudeSessionId: string | null; // Claude CLI のセッションID（resume用）
  workDir: string;
  messages: ClaudeMessage[];
  isResponding: boolean;

  // Claude CLI history state
  claudeProjects: ClaudeProject[];
  claudeSessions: ClaudeSessionSummary[];
  selectedClaudeProjectId: string | null;
  isViewingClaudeHistory: boolean; // Claude CLI 履歴閲覧モード

  // Actions
  setServerUrl: (url: string) => void;
  setConnected: (connected: boolean) => void;
  setConnecting: (connecting: boolean) => void;
  setConnectionError: (error: string | null) => void;
  setReconnecting: (reconnecting: boolean) => void;
  setReconnectAttempts: (attempts: number) => void;
  setSessionId: (id: string | null) => void;
  setClaudeSessionId: (id: string | null) => void;
  setWorkDir: (dir: string) => void;
  setResponding: (responding: boolean) => void;
  addMessage: (message: ClaudeMessage) => void;
  loadMessages: (messages: ClaudeMessage[]) => void;
  clearMessages: () => void;
  setClaudeProjects: (projects: ClaudeProject[]) => void;
  setClaudeSessions: (sessions: ClaudeSessionSummary[]) => void;
  setSelectedClaudeProjectId: (id: string | null) => void;
  setViewingClaudeHistory: (viewing: boolean) => void;
  reset: () => void;
}

// Default server URL from environment variable (Vite exposes VITE_ prefixed vars)
const defaultServerUrl =
  typeof import.meta !== "undefined" && import.meta.env?.VITE_SERVER_URL
    ? import.meta.env.VITE_SERVER_URL
    : "";

const initialState = {
  serverUrl: defaultServerUrl,
  isConnected: false,
  isConnecting: false,
  connectionError: null,
  isReconnecting: false,
  reconnectAttempts: 0,
  sessionId: null,
  claudeSessionId: null,
  workDir: "",
  messages: [] as ClaudeMessage[],
  isResponding: false,
  claudeProjects: [] as ClaudeProject[],
  claudeSessions: [] as ClaudeSessionSummary[],
  selectedClaudeProjectId: null,
  isViewingClaudeHistory: false,
};

export const useSessionStore = create<SessionState>((set) => ({
  ...initialState,

  setServerUrl: (url) => set({ serverUrl: url }),
  setConnected: (connected) => set({ isConnected: connected }),
  setConnecting: (connecting) => set({ isConnecting: connecting }),
  setConnectionError: (error) => set({ connectionError: error }),
  setReconnecting: (reconnecting) => set({ isReconnecting: reconnecting }),
  setReconnectAttempts: (attempts) => set({ reconnectAttempts: attempts }),
  setSessionId: (id) => set({ sessionId: id }),
  setClaudeSessionId: (id) => set({ claudeSessionId: id }),
  setWorkDir: (dir) => set({ workDir: dir }),
  setResponding: (responding) => set({ isResponding: responding }),

  addMessage: (message) =>
    set((state) => ({
      // Keep only the last MAX_MESSAGES to prevent memory issues
      messages: [...state.messages, message].slice(-MAX_MESSAGES),
    })),

  loadMessages: (messages) => set({ messages }),

  clearMessages: () => set({ messages: [] }),

  setClaudeProjects: (projects) => set({ claudeProjects: projects }),

  setClaudeSessions: (sessions) => set({ claudeSessions: sessions }),

  setSelectedClaudeProjectId: (id) => set({ selectedClaudeProjectId: id }),

  setViewingClaudeHistory: (viewing) => set({ isViewingClaudeHistory: viewing }),

  reset: () => set(initialState),
}));

// Safe localStorage access with error handling
function safeLocalStorageGet(key: string): string | null {
  try {
    if (typeof window !== "undefined" && window.localStorage) {
      return localStorage.getItem(key);
    }
  } catch (error) {
    console.warn("[Storage] Failed to read from localStorage:", error);
  }
  return null;
}

function safeLocalStorageSet(key: string, value: string): void {
  try {
    if (typeof window !== "undefined" && window.localStorage) {
      localStorage.setItem(key, value);
    }
  } catch (error) {
    console.warn("[Storage] Failed to write to localStorage:", error);
  }
}

function safeLocalStorageRemove(key: string): void {
  try {
    if (typeof window !== "undefined" && window.localStorage) {
      localStorage.removeItem(key);
    }
  } catch (error) {
    console.warn("[Storage] Failed to remove from localStorage:", error);
  }
}

// localStorage keys
const STORAGE_KEYS = {
  SERVER_URL: "cc-server-url",
  CLAUDE_SESSION_ID: "cc-claude-session-id",
  WORK_DIR: "cc-work-dir",
} as const;

// Persist server URL to localStorage
if (typeof window !== "undefined") {
  const savedUrl = safeLocalStorageGet(STORAGE_KEYS.SERVER_URL);
  if (savedUrl) {
    useSessionStore.getState().setServerUrl(savedUrl);
  }

  // Restore session state from localStorage
  const savedClaudeSessionId = safeLocalStorageGet(STORAGE_KEYS.CLAUDE_SESSION_ID);
  const savedWorkDir = safeLocalStorageGet(STORAGE_KEYS.WORK_DIR);
  if (savedClaudeSessionId) {
    useSessionStore.getState().setClaudeSessionId(savedClaudeSessionId);
  }
  if (savedWorkDir) {
    useSessionStore.getState().setWorkDir(savedWorkDir);
  }
}

export function saveServerUrl(url: string) {
  safeLocalStorageSet(STORAGE_KEYS.SERVER_URL, url);
  useSessionStore.getState().setServerUrl(url);
}

export function saveClaudeSessionId(id: string | null) {
  if (id) {
    safeLocalStorageSet(STORAGE_KEYS.CLAUDE_SESSION_ID, id);
  } else {
    safeLocalStorageRemove(STORAGE_KEYS.CLAUDE_SESSION_ID);
  }
  useSessionStore.getState().setClaudeSessionId(id);
}

export function saveWorkDir(dir: string) {
  if (dir) {
    safeLocalStorageSet(STORAGE_KEYS.WORK_DIR, dir);
  } else {
    safeLocalStorageRemove(STORAGE_KEYS.WORK_DIR);
  }
  useSessionStore.getState().setWorkDir(dir);
}

export function clearSessionStorage() {
  safeLocalStorageRemove(STORAGE_KEYS.CLAUDE_SESSION_ID);
  safeLocalStorageRemove(STORAGE_KEYS.WORK_DIR);
  useSessionStore.getState().setClaudeSessionId(null);
  useSessionStore.getState().setWorkDir("");
}
