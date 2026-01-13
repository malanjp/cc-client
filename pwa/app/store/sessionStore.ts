import { create } from "zustand";

// Maximum number of messages to keep in memory
const MAX_MESSAGES = 1000;

export interface ClaudeMessage {
  id: string;
  type: "assistant" | "user" | "system" | "tool_use" | "error" | "thinking" | "permission_request";
  content: string;
  timestamp: number;
  toolName?: string;
  toolInput?: Record<string, unknown>;
  permissionRequest?: {
    id: string;
    tool: string;
    description?: string;
  };
}

export interface SessionInfo {
  id: string;
  workDir: string;
  createdAt: number;
  updatedAt: number;
  status: "active" | "ended";
  processAlive: boolean;
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
  workDir: string;
  messages: ClaudeMessage[];
  isResponding: boolean;
  availableSessions: SessionInfo[];
  isViewingHistory: boolean; // 履歴閲覧モード（プロセス停止済み）

  // Actions
  setServerUrl: (url: string) => void;
  setConnected: (connected: boolean) => void;
  setConnecting: (connecting: boolean) => void;
  setConnectionError: (error: string | null) => void;
  setReconnecting: (reconnecting: boolean) => void;
  setReconnectAttempts: (attempts: number) => void;
  setSessionId: (id: string | null) => void;
  setWorkDir: (dir: string) => void;
  setResponding: (responding: boolean) => void;
  addMessage: (message: ClaudeMessage) => void;
  loadMessages: (messages: ClaudeMessage[]) => void;
  clearMessages: () => void;
  setAvailableSessions: (sessions: SessionInfo[]) => void;
  setViewingHistory: (viewing: boolean) => void;
  reset: () => void;
}

const initialState = {
  serverUrl: "",
  isConnected: false,
  isConnecting: false,
  connectionError: null,
  isReconnecting: false,
  reconnectAttempts: 0,
  sessionId: null,
  workDir: "",
  messages: [] as ClaudeMessage[],
  isResponding: false,
  availableSessions: [] as SessionInfo[],
  isViewingHistory: false,
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
  setWorkDir: (dir) => set({ workDir: dir }),
  setResponding: (responding) => set({ isResponding: responding }),

  addMessage: (message) =>
    set((state) => ({
      // Keep only the last MAX_MESSAGES to prevent memory issues
      messages: [...state.messages, message].slice(-MAX_MESSAGES),
    })),

  loadMessages: (messages) => set({ messages }),

  clearMessages: () => set({ messages: [] }),

  setAvailableSessions: (sessions) => set({ availableSessions: sessions }),

  setViewingHistory: (viewing) => set({ isViewingHistory: viewing }),

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

// Persist server URL to localStorage
if (typeof window !== "undefined") {
  const savedUrl = safeLocalStorageGet("cc-server-url");
  if (savedUrl) {
    useSessionStore.getState().setServerUrl(savedUrl);
  }
}

export function saveServerUrl(url: string) {
  safeLocalStorageSet("cc-server-url", url);
  useSessionStore.getState().setServerUrl(url);
}
