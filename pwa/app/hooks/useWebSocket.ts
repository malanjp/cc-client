import { useCallback, useRef, useEffect } from "react";
import { useSessionStore, type ClaudeMessage } from "../store/sessionStore";

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
    isViewingHistory,
    isReconnecting,
    reconnectAttempts,
    setConnected,
    setConnecting,
    setConnectionError,
    setReconnecting,
    setReconnectAttempts,
    setSessionId,
    setResponding,
    addMessage,
    loadMessages,
    setAvailableSessions,
    setViewingHistory,
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

          const content = extractContent(data);

          // 空コンテンツまたは表示対象外のタイプはスキップ
          if (!content || !["assistant", "tool_use", "thinking"].includes(messageType)) {
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
          setViewingHistory(false);
          break;

        case "session_history": {
          // DB から取得したメッセージ履歴を変換してロード
          const rawMessages = data.messages as Array<{
            id: string;
            type: string;
            content: string;
            timestamp: number;
            tool_name?: string;
            tool_input?: string;
            permission_request?: string;
          }>;
          const processAlive = data.processAlive as boolean;

          const messages: ClaudeMessage[] = rawMessages.map((m) => ({
            id: m.id,
            type: m.type as ClaudeMessage["type"],
            content: m.content,
            timestamp: m.timestamp,
            toolName: m.tool_name || undefined,
            toolInput: m.tool_input ? JSON.parse(m.tool_input) : undefined,
            permissionRequest: m.permission_request
              ? JSON.parse(m.permission_request)
              : undefined,
          }));

          loadMessages(messages);
          setViewingHistory(!processAlive);

          // プロセスが終了している場合は通知メッセージを追加
          if (!processAlive) {
            addMessage({
              id: crypto.randomUUID(),
              type: "system",
              content:
                "このセッションのプロセスは終了しています。履歴のみ表示されます。新しいメッセージを送信するには新規セッションを作成してください。",
              timestamp: Date.now(),
            });
          }
          break;
        }

        case "session_attached":
          setSessionId(data.sessionId as string);
          setViewingHistory(false);
          break;
      }
    },
    [setSessionId, setResponding, addMessage, loadMessages, setViewingHistory]
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

  const sendMessage = useCallback(
    (message: string) => {
      const sent = send({ type: "send_message", message });
      if (sent) {
        setResponding(true);
        addMessage({
          id: crypto.randomUUID(),
          type: "user",
          content: message,
          timestamp: Date.now(),
        });
      }
    },
    [send, addMessage, setResponding]
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

  const restoreSession = useCallback(
    (sessionId: string) => {
      send({ type: "restore_session", sessionId });
    },
    [send]
  );

  const attachSession = useCallback(
    (sessionId: string) => {
      send({ type: "attach_session", sessionId });
    },
    [send]
  );

  const fetchSessions = useCallback(async () => {
    if (!serverUrl) return;
    try {
      const res = await fetch(`${serverUrl}/api/sessions?include_ended=true`);
      if (!res.ok) throw new Error("Failed to fetch sessions");
      const data = await res.json();
      setAvailableSessions(data.sessions || []);
    } catch (error) {
      console.error("[WS] Failed to fetch sessions:", error);
    }
  }, [serverUrl, setAvailableSessions]);

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
    restoreSession,
    attachSession,
    fetchSessions,
    isConnected,
    isConnecting,
    isResponding,
    isViewingHistory,
    isReconnecting,
    reconnectAttempts,
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
