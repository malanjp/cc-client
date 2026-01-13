import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { apiRoutes } from "./routes/api";
import { createWebSocketHandler } from "./routes/ws";
import { sessionManager } from "./services/session";
import { dbManager } from "./db/database";

const app = new Hono();

// CORS configuration from environment variable
// Format: comma-separated list of origins, e.g., "http://localhost:5173,http://localhost:3000"
const corsOrigins = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(",").map((o) => o.trim())
  : ["http://localhost:5173", "http://localhost:3000"];

// Middleware
app.use("*", logger());
app.use(
  "*",
  cors({
    origin: corsOrigins,
    credentials: true,
  })
);

// Root
app.get("/", (c) =>
  c.json({
    name: "Claude Code Bridge Server",
    version: "0.1.0",
    endpoints: {
      health: "/health",
      api: "/api/sessions",
      websocket: "/ws",
    },
  })
);

// Health check
app.get("/health", (c) => c.json({ status: "ok", timestamp: Date.now() }));

// REST API routes
app.route("/api", apiRoutes);

const port = Number(process.env.PORT) || 8080;

console.log(`Bridge Server starting on port ${port}...`);

// Bun server with WebSocket support
const server = Bun.serve({
  port,
  hostname: "0.0.0.0",
  fetch(req, server) {
    const url = new URL(req.url);

    // Handle WebSocket upgrade
    if (url.pathname === "/ws") {
      const upgraded = server.upgrade(req, {
        data: { sessionId: null },
      });
      if (upgraded) {
        return undefined;
      }
      return new Response("WebSocket upgrade failed", { status: 400 });
    }

    // Handle HTTP requests with Hono
    return app.fetch(req);
  },
  websocket: createWebSocketHandler(),
});

console.log(`Bridge Server running at http://localhost:${server.port}`);
console.log(`WebSocket available at ws://localhost:${server.port}/ws`);

// Graceful shutdown handler
let isShuttingDown = false;

async function gracefulShutdown(signal: string): Promise<void> {
  if (isShuttingDown) {
    console.log(`[Server] Already shutting down, ignoring ${signal}`);
    return;
  }

  isShuttingDown = true;
  console.log(`\n[Server] Received ${signal}, starting graceful shutdown...`);

  try {
    // 1. アクティブセッションをシャットダウン
    const activeCount = sessionManager.getActiveCount();
    if (activeCount > 0) {
      console.log(`[Server] Shutting down ${activeCount} active sessions...`);
      await sessionManager.shutdownAll();
    }

    // 2. DB 接続を閉じる
    console.log("[Server] Closing database connection...");
    dbManager.close();

    // 3. サーバーを停止
    console.log("[Server] Stopping server...");
    server.stop();

    console.log("[Server] Graceful shutdown complete");
    process.exit(0);
  } catch (error) {
    console.error("[Server] Error during shutdown:", error);
    process.exit(1);
  }
}

// シグナルハンドラを登録
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));
