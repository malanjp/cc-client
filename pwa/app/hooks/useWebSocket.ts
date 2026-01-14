import { useCallback, useRef } from "react";
import {
  useSessionStore,
  saveClaudeSessionId,
  saveWorkDir,
  clearSessionStorage,
  type ClaudeMessage,
  type ClaudeProject,
  type ClaudeSessionSummary,
  type ToolUsePrompt,
  type UiToolResultMessage,
} from "../store/sessionStore";
import { BUILTIN_SLASH_COMMANDS } from "~/data/slashCommands";

// ユーザー確認が必要な tool_use のツール名
const PROMPT_TOOL_NAMES = ["ExitPlanMode", "AskUserQuestion"];

// 確認メッセージのパターン（CLI からの自動 tool_result を検出）
const CONFIRMATION_PATTERNS = [
  /^Exit plan mode\?$/i,
];

/** 確認が必要な tool_use かどうかを判定 */
function isPromptToolUse(toolName: string): boolean {
  return PROMPT_TOOL_NAMES.includes(toolName);
}

/** CLI からの自動確認 tool_result かどうかを判定 */
function isAutoConfirmationToolResult(content: string, isError: boolean): boolean {
  if (!isError) return false;
  return CONFIRMATION_PATTERNS.some(pattern => pattern.test(content));
}

interface ToolUseBlock {
  type: "tool_use";
  id: string;
  name: string;
  input: Record<string, unknown>;
}

function isToolUseBlock(block: unknown): block is ToolUseBlock {
  if (typeof block !== "object" || block === null) {
    return false;
  }
  const obj = block as Record<string, unknown>;
  return (
    obj.type === "tool_use" &&
    typeof obj.id === "string" &&
    typeof obj.name === "string" &&
    typeof obj.input === "object" &&
    obj.input !== null
  );
}

/**
 * assistant メッセージから確認が必要な tool_use を抽出して ToolUsePrompt 形式に変換
 */
function extractToolUsePrompt(data: Record<string, unknown>): ToolUsePrompt | null {
  const message = data.message as {
    content?: unknown[];
  } | undefined;

  if (!message?.content || !Array.isArray(message.content)) {
    return null;
  }

  // tool_use ブロックを探す
  const toolUseBlock = message.content.find(isToolUseBlock);
  if (!toolUseBlock || !isPromptToolUse(toolUseBlock.name)) {
    return null;
  }

  // ツールごとに適切な質問と選択肢を生成
  switch (toolUseBlock.name) {
    case "ExitPlanMode":
      return {
        toolUseId: toolUseBlock.id,
        toolName: toolUseBlock.name,
        question: "Exit plan mode?",
        options: [
          { label: "はい", value: "yes" },
          { label: "いいえ", value: "no" },
        ],
      };

    case "AskUserQuestion": {
      // AskUserQuestion の input から質問と選択肢を抽出
      const input = toolUseBlock.input as {
        questions?: Array<{
          question: string;
          options: Array<{ label: string; description?: string }>;
        }>;
      };
      const firstQuestion = input.questions?.[0];
      if (!firstQuestion) {
        return {
          toolUseId: toolUseBlock.id,
          toolName: toolUseBlock.name,
          question: "質問に回答してください",
          options: [
            { label: "OK", value: "ok" },
          ],
        };
      }
      return {
        toolUseId: toolUseBlock.id,
        toolName: toolUseBlock.name,
        question: firstQuestion.question,
        options: firstQuestion.options.map((opt) => ({
          label: opt.label,
          value: opt.label, // AskUserQuestion はラベルをそのまま値として使用
          description: opt.description,
        })),
      };
    }

    default:
      return null;
  }
}

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
  const handleMessageRef = useRef<(data: Record<string, unknown>) => void>(() => {});

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
    setWorkDir,
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
          clearMessages();
          setSessionId(data.sessionId as string);
          // workDir が存在しない場合は空文字列をセット
          setWorkDir(typeof data.workDir === "string" ? data.workDir : "");
          setViewingClaudeHistory(false);
          break;

        case "claude_message": {
          const messageType = data.message_type as string;

          // system/init メッセージから session_id を取得して保存
          if (messageType === "system" && data.subtype === "init") {
            const sessionIdFromInit = data.session_id as string | undefined;
            if (sessionIdFromInit) {
              console.log("[WS] Captured Claude session ID:", sessionIdFromInit.slice(0, 8) + "...");
              saveClaudeSessionId(sessionIdFromInit);
              // workDir も保存
              const currentWorkDir = useSessionStore.getState().workDir;
              if (currentWorkDir) {
                saveWorkDir(currentWorkDir);
              }
            }
          }

          // result タイプのメッセージを受信したら応答完了
          if (messageType === "result") {
            setResponding(false);
          }

          // permission_request タイプの処理（許可待ち時は応答完了扱い）
          if (messageType === "permission_request" && data.permission_request) {
            setResponding(false);
            const pr = data.permission_request as {
              id: string;
              tool: string;
              description?: string;
            };
            addMessage({
              id: crypto.randomUUID(),
              type: "permission_request",
              content: pr.description || `${pr.tool} の実行許可を求めています`,
              timestamp: Date.now(),
              permissionRequest: {
                id: pr.id,
                tool: pr.tool,
                description: pr.description,
              },
            });
            break;
          }

          // userメッセージからtool_resultブロックを抽出して表示
          if (messageType === "user") {
            const toolResults = extractToolResults(data);
            for (const msg of toolResults) {
              // CLI からの自動確認 tool_result はスキップ
              if (msg.toolResult?.isError && isAutoConfirmationToolResult(msg.content, true)) {
                console.log("[WS] Skipping auto confirmation tool_result:", msg.content);
                continue;
              }
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

          // assistant メッセージ内の tool_use を検出
          if (messageType === "assistant") {
            const toolUsePrompt = extractToolUsePrompt(data);
            if (toolUsePrompt) {
              // テキスト部分があれば先に表示
              const textContent = extractContent(data);
              if (textContent) {
                addMessage({
                  id: crypto.randomUUID(),
                  type: "assistant",
                  content: textContent,
                  timestamp: Date.now(),
                });
              }

              setResponding(false);
              addMessage({
                id: crypto.randomUUID(),
                type: "tool_use_prompt",
                content: toolUsePrompt.question,
                timestamp: Date.now(),
                toolUsePrompt,
              });
              // tool_use_prompt を表示したら、通常の tool_use 表示はスキップ
              break;
            }
          }

          const content = extractContent(data);

          // 空コンテンツはスキップ
          if (!content) {
            break;
          }

          // タイプごとに適切なメッセージオブジェクトを作成
          const timestamp = Date.now();
          const id = crypto.randomUUID();

          switch (messageType) {
            case "assistant":
              addMessage({ id, type: "assistant", content, timestamp });
              break;
            case "thinking":
              addMessage({ id, type: "thinking", content, timestamp });
              break;
            case "system":
              addMessage({ id, type: "system", content, timestamp });
              break;
            case "tool_use": {
              const toolUse = data.tool_use as { name?: string; input?: Record<string, unknown> } | undefined;
              addMessage({
                id,
                type: "tool_use",
                content,
                timestamp,
                toolName: toolUse?.name ?? "Unknown Tool",
                toolInput: toolUse?.input ?? {},
              });
              break;
            }
            // user メッセージは既に上で処理済み、その他は無視
            default:
              break;
          }
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
          clearSessionStorage();
          break;

        case "session_attached":
          setSessionId(data.sessionId as string);
          setViewingClaudeHistory(false);
          break;

        case "session_resumed": {
          setSessionId(data.sessionId as string);
          setViewingClaudeHistory(false);
          const resumedClaudeSessionId = data.claudeSessionId as string;
          const resumedWorkDir = data.workDir as string;
          if (resumedClaudeSessionId) {
            saveClaudeSessionId(resumedClaudeSessionId);
          }
          if (resumedWorkDir) {
            saveWorkDir(resumedWorkDir);
          }
          addMessage({
            id: crypto.randomUUID(),
            type: "system",
            content: `セッション ${resumedClaudeSessionId.slice(0, 8)}... を再開しました`,
            timestamp: Date.now(),
          });
          break;
        }

        case "session_resumed_after_abort": {
          setSessionId(data.sessionId as string);
          setResponding(false);
          const abortClaudeSessionId = data.claudeSessionId as string | undefined;
          if (abortClaudeSessionId) {
            saveClaudeSessionId(abortClaudeSessionId);
          }
          addMessage({
            id: crypto.randomUUID(),
            type: "system",
            content: "処理を中断しました",
            timestamp: Date.now(),
          });
          break;
        }
      }
    },
    [setSessionId, setWorkDir, setResponding, addMessage, clearMessages, setViewingClaudeHistory]
  );

  // handleMessage を ref に保存して、connect の依存配列から除外
  handleMessageRef.current = handleMessage;

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

        // 保存された Claude セッションがあれば復元、なければ新規作成
        const { claudeSessionId, workDir } = useSessionStore.getState();
        if (claudeSessionId && workDir) {
          console.log("[WS] Resuming Claude session:", claudeSessionId.slice(0, 8) + "...");
          ws.send(JSON.stringify({
            type: "resume_claude_session",
            sessionId: claudeSessionId,
            workDir,
          }));
        } else {
          ws.send(JSON.stringify({ type: "create_session" }));
        }
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          handleMessageRef.current(data);
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
  }, [serverUrl, setConnected, setConnecting, setConnectionError, setReconnecting, setReconnectAttempts, addMessage]);

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

  const respondToToolUse = useCallback(
    (toolUseId: string, content: string) => {
      send({ type: "respond_to_tool_use", toolUseId, content });
    },
    [send]
  );

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

        // メッセージを ClaudeMessage 形式に変換（タイプごとに適切な構造で）
        const rawMessages = data.messages as Array<{
          uuid: string;
          type: string;
          content: string;
          timestamp: string;
          toolName?: string;
          toolInput?: Record<string, unknown>;
        }>;

        const messages: ClaudeMessage[] = rawMessages.map((m): ClaudeMessage => {
          const base = {
            id: m.uuid,
            content: m.content,
            timestamp: new Date(m.timestamp).getTime(),
          };

          switch (m.type) {
            case "tool_use":
              return {
                ...base,
                type: "tool_use",
                toolName: m.toolName ?? "Unknown Tool",
                toolInput: m.toolInput ?? {},
              };
            case "assistant":
              return { ...base, type: "assistant" };
            case "user":
              return { ...base, type: "user" };
            case "system":
              return { ...base, type: "system" };
            case "thinking":
              return { ...base, type: "thinking" };
            case "error":
              return { ...base, type: "error" };
            default:
              // 不明なタイプは system として扱う
              return { ...base, type: "system" };
          }
        });

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
    respondToToolUse,
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
 * userメッセージからtool_resultブロックを抽出してUiToolResultMessage形式に変換
 */
function extractToolResults(data: Record<string, unknown>): UiToolResultMessage[] {
  const message = data.message as {
    content?: unknown[];
  } | undefined;

  if (!message?.content || !Array.isArray(message.content)) {
    return [];
  }

  return message.content.filter(isToolResultBlock).map((block): UiToolResultMessage => ({
    id: crypto.randomUUID(),
    type: "tool_result",
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
