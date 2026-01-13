import type { ServerWebSocket } from "bun";
import { sessionManager, isValidWorkDir, type ClaudeSession } from "../services/session";

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
            session.onMessage((msg) => {
              try {
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
            session.onMessage((msg) => {
              try {
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
              type: "session_attached",
              sessionId,
            }));
            break;
          }

          case "resume_claude_session": {
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
