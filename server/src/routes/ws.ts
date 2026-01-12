import type { ServerWebSocket } from "bun";
import { sessionManager, isValidWorkDir, type ClaudeSession } from "../services/session";
import { dbManager } from "../db/database";
import { MessageRepository } from "../db/repositories/messageRepository";
import type { ClaudeMessage } from "../utils/stream";

// メッセージから content を抽出するヘルパー
function extractContent(msg: ClaudeMessage): string {
  if ("message" in msg && msg.message) {
    return typeof msg.message.content === "string"
      ? msg.message.content
      : JSON.stringify(msg.message.content);
  }
  if ("tool_use" in msg && msg.tool_use) {
    return `Tool: ${msg.tool_use.name}`;
  }
  if ("permission_request" in msg && msg.permission_request) {
    return msg.permission_request.description || `Permission for ${msg.permission_request.tool}`;
  }
  if ("result" in msg && msg.result) {
    return JSON.stringify(msg.result);
  }
  return "";
}

interface WebSocketData {
  sessionId: string | null;
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
            const messageRepo = new MessageRepository(dbManager.getDb());

            session.onMessage((msg) => {
              try {
                // DB にメッセージを保存
                messageRepo.create({
                  id: crypto.randomUUID(),
                  session_id: session.id,
                  type: msg.type,
                  content: extractContent(msg),
                  timestamp: Date.now(),
                  tool_name: "tool_use" in msg && msg.tool_use ? msg.tool_use.name : null,
                  tool_input: "tool_use" in msg && msg.tool_use ? JSON.stringify(msg.tool_use.input) : null,
                  permission_request: "permission_request" in msg && msg.permission_request
                    ? JSON.stringify(msg.permission_request)
                    : null,
                });

                // Spread msg first, then override type for WebSocket message type
                // and preserve original Claude message type as message_type
                const wsMessage = {
                  ...msg,
                  type: "claude_message",
                  message_type: msg.type,
                };
                ws.send(JSON.stringify(wsMessage));
              } catch (err) {
                console.error("[WS] Failed to send message:", err);
              }
            });

            session.onError((error) => {
              sendError(ws, error.message);
            });

            session.onEnd(() => {
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

            // ユーザーメッセージを DB に保存
            const messageRepo = new MessageRepository(dbManager.getDb());
            messageRepo.create({
              id: crypto.randomUUID(),
              session_id: session.id,
              type: "user",
              content: data.message,
              timestamp: Date.now(),
              tool_name: null,
              tool_input: null,
              permission_request: null,
            });

            await session.sendMessage(data.message);
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

          case "abort": {
            const session = requireSession(ws);
            if (!session) return;
            session.abort();
            break;
          }

          case "end_session": {
            if (ws.data.sessionId) {
              sessionManager.endSession(ws.data.sessionId);
              ws.data.sessionId = null;
            }
            break;
          }

          case "restore_session": {
            // 過去のセッション履歴を取得（プロセスが終了している場合）
            const sessionId = data.sessionId as string;
            if (!sessionId) {
              sendError(ws, "sessionId is required");
              return;
            }

            const sessionInfo = sessionManager.getSessionInfo(sessionId);
            if (!sessionInfo) {
              sendError(ws, "Session not found");
              return;
            }

            const messageRepo = new MessageRepository(dbManager.getDb());
            const messages = messageRepo.findBySessionId(sessionId);

            ws.send(JSON.stringify({
              type: "session_history",
              sessionId,
              messages,
              processAlive: sessionInfo.processAlive,
            }));
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

            // イベントハンドラを再登録
            const messageRepo = new MessageRepository(dbManager.getDb());

            session.onMessage((msg) => {
              try {
                // DB にメッセージを保存
                messageRepo.create({
                  id: crypto.randomUUID(),
                  session_id: session.id,
                  type: msg.type,
                  content: extractContent(msg),
                  timestamp: Date.now(),
                  tool_name: "tool_use" in msg && msg.tool_use ? msg.tool_use.name : null,
                  tool_input: "tool_use" in msg && msg.tool_use ? JSON.stringify(msg.tool_use.input) : null,
                  permission_request: "permission_request" in msg && msg.permission_request
                    ? JSON.stringify(msg.permission_request)
                    : null,
                });

                const wsMessage = {
                  ...msg,
                  type: "claude_message",
                  message_type: msg.type,
                };
                ws.send(JSON.stringify(wsMessage));
              } catch (err) {
                console.error("[WS] Failed to send message:", err);
              }
            });

            session.onError((error) => {
              sendError(ws, error.message);
            });

            session.onEnd(() => {
              try {
                ws.send(JSON.stringify({ type: "session_ended" }));
              } catch {
                // Client may have disconnected
              }
              ws.data.sessionId = null;
            });

            // 履歴を送信
            const messages = messageRepo.findBySessionId(sessionId);
            ws.send(JSON.stringify({
              type: "session_history",
              sessionId,
              messages,
              processAlive: true,
            }));

            ws.send(JSON.stringify({
              type: "session_attached",
              sessionId,
            }));
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
