import type { ServerWebSocket } from "bun";
import { sessionManager, isValidWorkDir, type ClaudeSession } from "../services/session";
import type { ClaudeMessage } from "../utils/stream";

interface WebSocketData {
  sessionId: string | null;
}

/** tool_use ブロックから caller など余分なフィールドを除外 */
function sanitizeToolUseBlock(block: unknown): unknown {
  if (typeof block === "object" && block !== null && (block as { type?: string }).type === "tool_use") {
    const { id, name, input } = block as { id: string; name: string; input: Record<string, unknown> };
    return { type: "tool_use" as const, id, name, input };
  }
  return block;
}

/** tool_use メッセージから caller など余分なフィールドを除外 */
function sanitizeCliMessage(msg: ClaudeMessage): ClaudeMessage {
  // トップレベルの tool_use メッセージ
  if (msg.type === "tool_use" && msg.tool_use) {
    const { id, name, input } = msg.tool_use;
    return {
      ...msg,
      tool_use: { id, name, input }
    };
  }

  // assistant メッセージ内の content 配列内の tool_use ブロック
  if (msg.type === "assistant" && Array.isArray(msg.message.content)) {
    return {
      ...msg,
      message: {
        ...msg.message,
        content: msg.message.content.map(sanitizeToolUseBlock),
      },
    } as ClaudeMessage;
  }

  // user メッセージ内の content 配列内の tool_use ブロック
  if (msg.type === "user" && Array.isArray(msg.message.content)) {
    return {
      ...msg,
      message: {
        ...msg.message,
        content: msg.message.content.map(sanitizeToolUseBlock),
      },
    } as ClaudeMessage;
  }

  return msg;
}

/** WebSocket送信用のメッセージを作成 */
function createWsMessage(msg: ClaudeMessage) {
  const sanitized = sanitizeCliMessage(msg);
  return {
    ...sanitized,
    type: "claude_message" as const,
    message_type: msg.type,
  };
}

function sendError(ws: ServerWebSocket<WebSocketData>, error: string): void {
  ws.send(JSON.stringify({ type: "error", error }));
}

function getActiveSession(ws: ServerWebSocket<WebSocketData>): ClaudeSession | null {
  if (!ws.data.sessionId) return null;
  return sessionManager.getSession(ws.data.sessionId) ?? null;
}

function requireSession(ws: ServerWebSocket<WebSocketData>): ClaudeSession | null {
  const session = getActiveSession(ws);
  if (!session) {
    sendError(ws, "No active session");
  }
  return session;
}

export function createWebSocketHandler() {
  return {
    open(ws: ServerWebSocket<WebSocketData>) {
      console.log("[WS] Client connected");
      ws.data = { sessionId: null };
      ws.send(JSON.stringify({ type: "connected", message: "Welcome to Claude Code Bridge" }));
    },

    async message(ws: ServerWebSocket<WebSocketData>, message: string | Buffer) {
      try {
        const data = JSON.parse(message.toString());

        switch (data.type) {
          case "create_session": {
            // 既存セッションがあれば終了
            if (ws.data.sessionId) {
              sessionManager.endSession(ws.data.sessionId);
              ws.data.sessionId = null;
            }

            const workDir = data.workDir || process.cwd();

            // Validate workDir before creating session
            const validation = isValidWorkDir(workDir);
            if (!validation.valid) {
              sendError(ws, validation.error || "Invalid work directory");
              return;
            }

            const session = await sessionManager.createSession(workDir);
            ws.data.sessionId = session.id;

            // Subscribe to session events
            session.onMessage((msg) => {
              try {
                ws.send(JSON.stringify(createWsMessage(msg)));
              } catch (err) {
                console.error("[WS] Failed to send message:", err);
              }
            });

            session.onError((error) => {
              sendError(ws, error.message);
            });

            session.onEnd(() => {
              // abort 時は session_ended を送信しない（abort ハンドラで処理する）
              if (session.isAborting) return;

              try {
                ws.send(JSON.stringify({ type: "session_ended" }));
              } catch {
                // Client may have disconnected
              }
              ws.data.sessionId = null;
            });

            ws.send(JSON.stringify({
              type: "session_created",
              sessionId: session.id,
              workDir
            }));
            break;
          }

          case "send_message": {
            const session = requireSession(ws);
            if (!session) return;

            const userMessage = data.message as string;
            await session.sendMessage(userMessage);
            break;
          }

          case "approve": {
            const session = requireSession(ws);
            if (!session) return;
            await session.approve();
            break;
          }

          case "reject": {
            const session = requireSession(ws);
            if (!session) return;
            await session.reject();
            break;
          }

          case "respond_to_tool_use": {
            const session = requireSession(ws);
            if (!session) return;

            // toolUseId の検証
            if (typeof data.toolUseId !== "string" || !data.toolUseId.trim()) {
              sendError(ws, "toolUseId is required and must be a non-empty string");
              return;
            }
            const toolUseId = data.toolUseId;

            // content の検証（省略可能だが、存在する場合は文字列であること）
            const content =
              data.content == null
                ? ""
                : typeof data.content === "string"
                  ? data.content
                  : String(data.content);

            await session.respondToToolUse(toolUseId, content);
            break;
          }

          case "abort": {
            const session = requireSession(ws);
            if (!session) return;

            // Claude CLI のセッションIDと作業ディレクトリを取得
            const claudeSessionId = session.getClaudeSessionId();
            const workDir = session.workDir;

            // 現在のプロセスを終了
            await session.abort();

            // セッションIDがあれば自動再開
            if (claudeSessionId) {
              try {
                const newSession = await sessionManager.resumeSession(claudeSessionId, workDir);
                ws.data.sessionId = newSession.id;

                // イベントハンドラを再登録
                newSession.onMessage((msg) => {
                  try {
                    ws.send(JSON.stringify(createWsMessage(msg)));
                  } catch (err) {
                    console.error("[WS] Failed to send message:", err);
                  }
                });

                newSession.onError((error) => {
                  sendError(ws, error.message);
                });

                newSession.onEnd(() => {
                  // abort 時は session_ended を送信しない（abort ハンドラで処理する）
                  if (newSession.isAborting) return;

                  try {
                    ws.send(JSON.stringify({ type: "session_ended" }));
                  } catch {
                    // Client may have disconnected
                  }
                  ws.data.sessionId = null;
                });

                ws.send(JSON.stringify({
                  type: "session_resumed_after_abort",
                  sessionId: newSession.id,
                  claudeSessionId,
                }));
              } catch (error) {
                console.error("[WS] Failed to resume session after abort:", error);
                // 失敗時は sessionId をクリア
                ws.data.sessionId = null;
                sendError(ws, "Failed to resume session after abort");
              }
            } else {
              // セッションIDがない場合は単純に終了通知
              ws.send(JSON.stringify({ type: "session_ended" }));
              ws.data.sessionId = null;
            }
            break;
          }

          case "end_session": {
            if (ws.data.sessionId) {
              sessionManager.endSession(ws.data.sessionId);
              ws.data.sessionId = null;
            }
            break;
          }

          case "attach_session": {
            // 既存のアクティブなセッションに再接続
            const sessionId = data.sessionId as string;
            if (!sessionId) {
              sendError(ws, "sessionId is required");
              return;
            }

            const session = sessionManager.getSession(sessionId);
            if (!session) {
              sendError(ws, "Session not found or not active");
              return;
            }

            if (session.status !== "active") {
              sendError(ws, "Session process is not alive");
              return;
            }

            // WebSocket 接続をセッションに紐付け
            ws.data.sessionId = sessionId;

            // 既存のハンドラをクリアしてから再登録（重複防止）
            session.clearAllHandlers();
            session.onMessage((msg) => {
              try {
                ws.send(JSON.stringify(createWsMessage(msg)));
              } catch (err) {
                console.error("[WS] Failed to send message:", err);
              }
            });

            session.onError((error) => {
              sendError(ws, error.message);
            });

            session.onEnd(() => {
              // abort 時は session_ended を送信しない（abort ハンドラで処理する）
              if (session.isAborting) return;

              try {
                ws.send(JSON.stringify({ type: "session_ended" }));
              } catch {
                // Client may have disconnected
              }
              ws.data.sessionId = null;
            });

            ws.send(JSON.stringify({
              type: "session_attached",
              sessionId,
            }));
            break;
          }

          case "resume_claude_session": {
            // 既存セッションがあれば終了
            if (ws.data.sessionId) {
              sessionManager.endSession(ws.data.sessionId);
              ws.data.sessionId = null;
            }

            // Claude CLI の既存セッションを --resume で再開
            const claudeSessionId = data.sessionId as string;
            const workDir = data.workDir as string;

            if (!claudeSessionId) {
              sendError(ws, "sessionId is required");
              return;
            }
            if (!workDir) {
              sendError(ws, "workDir is required");
              return;
            }

            const validation = isValidWorkDir(workDir);
            if (!validation.valid) {
              sendError(ws, validation.error || "Invalid work directory");
              return;
            }

            try {
              const session = await sessionManager.resumeSession(claudeSessionId, workDir);
              ws.data.sessionId = session.id;

              // イベントハンドラを登録
              session.onMessage((msg) => {
                try {
                  ws.send(JSON.stringify(createWsMessage(msg)));
                } catch (err) {
                  console.error("[WS] Failed to send message:", err);
                }
              });

              session.onError((error) => {
                sendError(ws, error.message);
              });

              session.onEnd(() => {
                // abort 時は session_ended を送信しない（abort ハンドラで処理する）
                if (session.isAborting) return;

                try {
                  ws.send(JSON.stringify({ type: "session_ended" }));
                } catch {
                  // Client may have disconnected
                }
                ws.data.sessionId = null;
              });

              ws.send(JSON.stringify({
                type: "session_resumed",
                sessionId: session.id,
                claudeSessionId,
                workDir,
              }));
            } catch (error) {
              sendError(ws, error instanceof Error ? error.message : "Failed to resume session");
            }
            break;
          }

          default:
            sendError(ws, `Unknown message type: ${data.type}`);
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        console.error("[WS] Message handling error:", errorMessage);
        sendError(ws, errorMessage);
      }
    },

    close(ws: ServerWebSocket<WebSocketData>) {
      console.log("[WS] Client disconnected");
      if (ws.data.sessionId) {
        sessionManager.endSession(ws.data.sessionId);
      }
    },
  };
}
