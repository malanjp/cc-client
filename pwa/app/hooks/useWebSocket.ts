import { useCallback, useRef } from "react";
import {
  useSessionStore,
  type ClaudeMessage,
  type ClaudeProject,
  type ClaudeSessionSummary,
} from "../store/sessionStore";
import { BUILTIN_SLASH_COMMANDS } from "~/data/slashCommands";

// Singleton WebSocket instance to prevent multiple connections
let globalWs: WebSocket | null = null;

// Reconnection configuration
const MAX_RECONNECT_ATTEMPTS = 5;
const getReconnectDelay = (attempt: number) =>
  Math.min(1000 * Math.pow(2, attempt), 30000); // 1s, 2s, 4s, 8s, 16s (max 30s)

// Track if disconnect was intentional
let intentionalDisconnect = false;
// Reconnection timer
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

export function useWebSocket() {
  const connectingRef = useRef(false);

  const {
    serverUrl,
    isConnected,
    isConnecting,
    isResponding,
    isReconnecting,
    reconnectAttempts,
    isViewingClaudeHistory,
    sessionId,
    setConnected,
    setConnecting,
    setConnectionError,
    setReconnecting,
    setReconnectAttempts,
    setSessionId,
    setResponding,
    addMessage,
    loadMessages,
    clearMessages,
    setClaudeProjects,
    setClaudeSessions,
    setViewingClaudeHistory,
  } = useSessionStore();

  const handleMessage = useCallback(
    (data: Record<string, unknown>) => {
      const type = data.type as string;

      switch (type) {
        case "connected":
          console.log("[WS] Server welcome:", data.message);
          break;

        case "session_created":
          setSessionId(data.sessionId as string);
          setViewingClaudeHistory(false);
          break;

        case "claude_message": {
          const messageType = data.message_type as string;

          // result タイプのメッセージを受信したら応答完了
          if (messageType === "result") {
            setResponding(false);
          }

          // permission_request タイプの処理（許可待ち時は応答完了扱い）
          if (messageType === "permission_request" && data.permission_request) {
            setResponding(false);
            const pr = data.permission_request as ClaudeMessage["permissionRequest"];
            addMessage({
              id: crypto.randomUUID(),
              type: "permission_request",
              content: pr?.description || `${pr?.tool} の実行許可を求めています`,
              timestamp: Date.now(),
              permissionRequest: pr,
            });
            break;
          }

          // userメッセージからtool_resultブロックを抽出して表示
          if (messageType === "user") {
            const toolResults = extractToolResults(data);
            for (const msg of toolResults) {
              addMessage(msg);
            }
            // ユーザーメッセージ本体も追加（contentがある場合）
            const userContent = extractContent(data);
            if (userContent) {
              addMessage({
                id: crypto.randomUUID(),
                type: "user",
                content: userContent,
                timestamp: Date.now(),
              });
            }
            break;
          }

          const content = extractContent(data);

          // 表示対象のメッセージタイプ
          const displayableTypes = ["assistant", "user", "tool_use", "thinking", "system"];

          // 空コンテンツまたは表示対象外のタイプはスキップ
          if (!content || !displayableTypes.includes(messageType)) {
            break;
          }

          const msg: ClaudeMessage = {
            id: crypto.randomUUID(),
            type: (messageType as ClaudeMessage["type"]) || "assistant",
            content,
            timestamp: Date.now(),
            toolName: (data.tool_use as { name?: string })?.name,
            toolInput: (data.tool_use as { input?: Record<string, unknown> })
              ?.input,
            permissionRequest: data.permission_request as
              | ClaudeMessage["permissionRequest"]
              | undefined,
          };
          addMessage(msg);
          break;
        }

        case "error":
          setResponding(false);
          addMessage({
            id: crypto.randomUUID(),
            type: "error",
            content: data.error as string,
            timestamp: Date.now(),
          });
          break;

        case "session_ended":
          setSessionId(null);
          break;

        case "session_attached":
          setSessionId(data.sessionId as string);
          setViewingClaudeHistory(false);
          break;

        case "session_resumed":
          setSessionId(data.sessionId as string);
          setViewingClaudeHistory(false);
          addMessage({
            id: crypto.randomUUID(),
            type: "system",
            content: `セッション ${(data.claudeSessionId as string).slice(0, 8)}... を再開しました`,
            timestamp: Date.now(),
          });
          break;
      }
    },
    [setSessionId, setResponding, addMessage, setViewingClaudeHistory]
  );

  const connect = useCallback((urlOverride?: string, isReconnect = false) => {
    const url = urlOverride || serverUrl;

    // Prevent multiple connections
    if (connectingRef.current || globalWs?.readyState === WebSocket.OPEN) {
      console.log("[WS] Already connected or connecting");
      return;
    }

    if (!url) {
      setConnectionError("サーバーURLを入力してください");
      return;
    }

    connectingRef.current = true;
    setConnecting(true);
    setConnectionError(null);

    if (!isReconnect) {
      intentionalDisconnect = false;
    }

    // Close existing connection if any
    if (globalWs) {
      globalWs.close();
      globalWs = null;
    }

    try {
      const wsUrl = url.replace(/^http/, "ws") + "/ws";
      console.log("[WS] Connecting to:", wsUrl);
      const ws = new WebSocket(wsUrl);
      globalWs = ws;

      ws.onopen = () => {
        console.log("[WS] Connected successfully");
        connectingRef.current = false;
        setConnecting(false);
        setConnected(true);

        // 再接続成功時はリセット
        if (isReconnect) {
          setReconnecting(false);
          setReconnectAttempts(0);
          addMessage({
            id: crypto.randomUUID(),
            type: "system",
            content: "サーバーに再接続しました",
            timestamp: Date.now(),
          });
        }

        // 接続成功時に自動でセッションを作成
        ws.send(JSON.stringify({ type: "create_session" }));
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          handleMessage(data);
        } catch (error) {
          const message = error instanceof Error ? error.message : "パースエラー";
          console.error("[WS] Parse error:", message);
          addMessage({
            id: crypto.randomUUID(),
            type: "error",
            content: `サーバーからのメッセージを解析できませんでした: ${message}`,
            timestamp: Date.now(),
          });
        }
      };

      ws.onerror = () => {
        console.error("[WS] Connection error");
        connectingRef.current = false;
        if (!isReconnect) {
          setConnectionError(
            "接続エラーが発生しました。サーバーが起動しているか、URLが正しいか確認してください。"
          );
        }
      };

      ws.onclose = (event) => {
        console.log("[WS] Disconnected, code:", event.code, "reason:", event.reason);
        connectingRef.current = false;
        setConnected(false);
        setConnecting(false);
        globalWs = null;

        // 意図的な切断の場合は再接続しない
        if (intentionalDisconnect) {
          console.log("[WS] Intentional disconnect, not reconnecting");
          return;
        }

        // 予期しない切断の場合は自動再接続を試みる
        if (event.code !== 1000 && event.code !== 1001) {
          const currentAttempts = useSessionStore.getState().reconnectAttempts;

          if (currentAttempts < MAX_RECONNECT_ATTEMPTS) {
            const delay = getReconnectDelay(currentAttempts);
            console.log(`[WS] Reconnecting in ${delay}ms (attempt ${currentAttempts + 1}/${MAX_RECONNECT_ATTEMPTS})`);

            setReconnecting(true);
            setReconnectAttempts(currentAttempts + 1);

            reconnectTimer = setTimeout(() => {
              const savedUrl = useSessionStore.getState().serverUrl;
              if (savedUrl) {
                connect(savedUrl, true);
              }
            }, delay);
          } else {
            // 最大試行回数に達した
            setReconnecting(false);
            const reason = event.reason || getCloseReason(event.code);
            addMessage({
              id: crypto.randomUUID(),
              type: "error",
              content: `接続が切断されました: ${reason}。再接続に失敗しました（${MAX_RECONNECT_ATTEMPTS}回試行）。手動で再接続してください。`,
              timestamp: Date.now(),
            });
          }
        }
      };
    } catch (error) {
      connectingRef.current = false;
      setConnecting(false);
      setConnectionError(
        error instanceof Error ? error.message : "接続に失敗しました"
      );
    }
  }, [serverUrl, setConnected, setConnecting, setConnectionError, setReconnecting, setReconnectAttempts, handleMessage, addMessage]);

  const cancelReconnect = useCallback(() => {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    setReconnecting(false);
    setReconnectAttempts(0);
    intentionalDisconnect = true;
  }, [setReconnecting, setReconnectAttempts]);

  const disconnect = useCallback(() => {
    intentionalDisconnect = true;
    cancelReconnect();
    if (globalWs) {
      globalWs.close(1000, "User disconnected");
      globalWs = null;
    }
    setConnected(false);
  }, [setConnected, cancelReconnect]);

  const send = useCallback((message: Record<string, unknown>): boolean => {
    if (!globalWs || globalWs.readyState !== WebSocket.OPEN) {
      console.warn("[WS] Cannot send, not connected");
      addMessage({
        id: crypto.randomUUID(),
        type: "error",
        content: "メッセージを送信できません。接続が切断されています。再接続してください。",
        timestamp: Date.now(),
      });
      return false;
    }

    try {
      globalWs.send(JSON.stringify(message));
      return true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Send error";
      console.error("[WS] Send error:", errorMessage);
      addMessage({
        id: crypto.randomUUID(),
        type: "error",
        content: `送信エラー: ${errorMessage}`,
        timestamp: Date.now(),
      });
      return false;
    }
  }, [addMessage]);

  const createSession = useCallback(
    (workDir?: string) => {
      send({ type: "create_session", workDir });
    },
    [send]
  );

  // ローカルコマンドハンドラ
  const handleLocalCommand = useCallback(
    (command: string) => {
      switch (command) {
        case "/clear":
          clearMessages();
          addMessage({
            id: crypto.randomUUID(),
            type: "system",
            content: "メッセージ履歴をクリアしました",
            timestamp: Date.now(),
          });
          break;

        case "/help": {
          const helpText = BUILTIN_SLASH_COMMANDS
            .map(c => `${c.name} - ${c.description}`)
            .join("\n");
          addMessage({
            id: crypto.randomUUID(),
            type: "system",
            content: `利用可能なコマンド:\n${helpText}`,
            timestamp: Date.now(),
          });
          break;
        }

        case "/status":
          addMessage({
            id: crypto.randomUUID(),
            type: "system",
            content: `接続状態: ${isConnected ? "接続中 ✓" : "未接続"}\nセッションID: ${sessionId || "なし"}`,
            timestamp: Date.now(),
          });
          break;
      }
    },
    [clearMessages, addMessage, isConnected, sessionId]
  );

  const sendMessage = useCallback(
    (message: string) => {
      // ユーザーメッセージを追加
      addMessage({
        id: crypto.randomUUID(),
        type: "user",
        content: message,
        timestamp: Date.now(),
      });

      // スラッシュコマンドの処理
      if (message.startsWith("/")) {
        const commandName = message.split(" ")[0];
        const command = BUILTIN_SLASH_COMMANDS.find(c => c.name === commandName);

        if (command) {
          switch (command.handler) {
            case "local":
              handleLocalCommand(commandName);
              return;
            case "unsupported":
              addMessage({
                id: crypto.randomUUID(),
                type: "system",
                content: `${commandName} はPWAでは対応していません`,
                timestamp: Date.now(),
              });
              return;
            // "cli" の場合はそのまま送信
          }
        }
      }

      // CLIに送信
      const sent = send({ type: "send_message", message });
      if (sent && !message.startsWith("/")) {
        setResponding(true);
      }
    },
    [send, addMessage, setResponding, handleLocalCommand]
  );

  const approve = useCallback(() => {
    send({ type: "approve" });
  }, [send]);

  const reject = useCallback(() => {
    send({ type: "reject" });
  }, [send]);

  const abort = useCallback(() => {
    send({ type: "abort" });
    setResponding(false);
  }, [send, setResponding]);

  const endSession = useCallback(() => {
    send({ type: "end_session" });
  }, [send]);

  const attachSession = useCallback(
    (sessionId: string) => {
      send({ type: "attach_session", sessionId });
    },
    [send]
  );

  // Claude CLI 履歴関連のメソッド
  const resumeClaudeSession = useCallback(
    (sessionId: string, workDir: string) => {
      send({ type: "resume_claude_session", sessionId, workDir });
    },
    [send]
  );

  const fetchClaudeProjects = useCallback(async () => {
    if (!serverUrl) return;
    try {
      const res = await fetch(`${serverUrl}/api/claude-projects`);
      if (!res.ok) throw new Error("Failed to fetch Claude projects");
      const data = await res.json();
      setClaudeProjects((data.projects || []) as ClaudeProject[]);
    } catch (error) {
      console.error("[WS] Failed to fetch Claude projects:", error);
    }
  }, [serverUrl, setClaudeProjects]);

  const fetchClaudeSessions = useCallback(
    async (projectId: string) => {
      if (!serverUrl) return;
      try {
        const res = await fetch(
          `${serverUrl}/api/claude-projects/${encodeURIComponent(projectId)}/sessions`
        );
        if (!res.ok) throw new Error("Failed to fetch Claude sessions");
        const data = await res.json();
        setClaudeSessions((data.sessions || []) as ClaudeSessionSummary[]);
      } catch (error) {
        console.error("[WS] Failed to fetch Claude sessions:", error);
      }
    },
    [serverUrl, setClaudeSessions]
  );

  const fetchClaudeSessionMessages = useCallback(
    async (
      projectId: string,
      sessionId: string,
      options?: { showSystemMessage?: boolean }
    ) => {
      if (!serverUrl) return;
      try {
        const res = await fetch(
          `${serverUrl}/api/claude-projects/${encodeURIComponent(projectId)}/sessions/${sessionId}/messages`
        );
        if (!res.ok) throw new Error("Failed to fetch Claude session messages");
        const data = await res.json();

        // メッセージを ClaudeMessage 形式に変換
        const messages: ClaudeMessage[] = (
          data.messages as Array<{
            uuid: string;
            type: string;
            content: string;
            timestamp: string;
            toolName?: string;
            toolInput?: Record<string, unknown>;
          }>
        ).map((m) => ({
          id: m.uuid,
          type: m.type as ClaudeMessage["type"],
          content: m.content,
          timestamp: new Date(m.timestamp).getTime(),
          toolName: m.toolName,
          toolInput: m.toolInput,
        }));

        loadMessages(messages);
        setViewingClaudeHistory(true);

        // 履歴閲覧中の通知（オプションで非表示可能）
        if (options?.showSystemMessage !== false) {
          addMessage({
            id: crypto.randomUUID(),
            type: "system",
            content:
              "Claude CLI の過去のセッション履歴を表示しています。「セッション再開」で続きから会話できます。",
            timestamp: Date.now(),
          });
        }
      } catch (error) {
        console.error("[WS] Failed to fetch Claude session messages:", error);
        addMessage({
          id: crypto.randomUUID(),
          type: "error",
          content: "セッション履歴の取得に失敗しました",
          timestamp: Date.now(),
        });
      }
    },
    [serverUrl, loadMessages, setViewingClaudeHistory, addMessage]
  );

  return {
    connect,
    disconnect,
    cancelReconnect,
    createSession,
    sendMessage,
    approve,
    reject,
    abort,
    endSession,
    attachSession,
    // Claude CLI 履歴関連
    resumeClaudeSession,
    fetchClaudeProjects,
    fetchClaudeSessions,
    fetchClaudeSessionMessages,
    isConnected,
    isConnecting,
    isResponding,
    isReconnecting,
    reconnectAttempts,
    isViewingClaudeHistory,
  };
}

function extractContent(data: Record<string, unknown>): string {
  const message = data.message as {
    content?: string | Array<{ type: string; text?: string }>;
  } | undefined;

  if (!message?.content) {
    if (typeof data.thinking === "string") return data.thinking;
    if (isToolUse(data.tool_use)) return `Tool: ${data.tool_use.name}`;
    return "";
  }

  if (typeof message.content === "string") {
    return message.content;
  }

  return message.content
    .filter((block) => block.type === "text")
    .map((block) => block.text || "")
    .join("\n");
}

interface ToolResultBlock {
  type: "tool_result";
  tool_use_id: string;
  content?: string;
  is_error?: boolean;
}

function isToolResultBlock(block: unknown): block is ToolResultBlock {
  return (
    typeof block === "object" &&
    block !== null &&
    (block as Record<string, unknown>).type === "tool_result"
  );
}

/**
 * userメッセージからtool_resultブロックを抽出してClaudeMessage形式に変換
 */
function extractToolResults(data: Record<string, unknown>): import("../store/sessionStore").ClaudeMessage[] {
  const message = data.message as {
    content?: unknown[];
  } | undefined;

  if (!message?.content || !Array.isArray(message.content)) {
    return [];
  }

  return message.content
    .filter(isToolResultBlock)
    .map((block) => ({
      id: crypto.randomUUID(),
      type: "tool_result" as const,
      content: typeof block.content === "string" ? block.content : JSON.stringify(block.content ?? ""),
      timestamp: Date.now(),
      toolResult: {
        toolUseId: block.tool_use_id,
        isError: block.is_error,
      },
    }));
}

function isToolUse(value: unknown): value is { name: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    "name" in value &&
    typeof (value as { name: unknown }).name === "string"
  );
}

function getCloseReason(code: number): string {
  const reasons: Record<number, string> = {
    1000: "正常終了",
    1001: "接続先が終了しました",
    1002: "プロトコルエラー",
    1003: "サポートされていないデータ形式",
    1006: "ネットワークの問題により接続が切断されました",
    1007: "無効なデータを受信しました",
    1008: "ポリシー違反",
    1009: "メッセージが大きすぎます",
    1011: "サーバーエラー",
    1015: "TLSハンドシェイクに失敗しました",
  };
  return reasons[code] || `不明なエラー (コード: ${code})`;
}
