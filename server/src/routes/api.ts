import { Hono } from "hono";
import { sessionManager, isValidWorkDir } from "../services/session";
import { dbManager } from "../db/database";
import { MessageRepository } from "../db/repositories/messageRepository";

export const apiRoutes = new Hono();

// List sessions
apiRoutes.get("/sessions", (c) => {
  const includeEnded = c.req.query("include_ended") === "true";
  const sessions = sessionManager.listSessions(includeEnded);
  return c.json({ sessions });
});

// Create a new session
apiRoutes.post("/sessions", async (c) => {
  const body = await c.req.json<{ workDir?: string }>();
  const workDir = body.workDir || process.cwd();

  // Validate workDir before creating session
  const validation = isValidWorkDir(workDir);
  if (!validation.valid) {
    return c.json({ error: validation.error }, 403);
  }

  try {
    const session = await sessionManager.createSession(workDir);
    return c.json({ session: session.getInfo() }, 201);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return c.json({ error: message }, 500);
  }
});

// Get session details
apiRoutes.get("/sessions/:id", (c) => {
  const id = c.req.param("id");

  // まずメモリ上のアクティブセッションを確認
  const activeSession = sessionManager.getSession(id);
  if (activeSession) {
    return c.json({ session: activeSession.getInfo() });
  }

  // DB から過去のセッションを取得
  const sessionInfo = sessionManager.getSessionInfo(id);
  if (sessionInfo) {
    return c.json({ session: sessionInfo });
  }

  return c.json({ error: "Session not found" }, 404);
});

// End a session
apiRoutes.delete("/sessions/:id", (c) => {
  const id = c.req.param("id");
  const success = sessionManager.endSession(id);

  if (!success) {
    return c.json({ error: "Session not found" }, 404);
  }

  return c.json({ success: true });
});

// Get session messages
apiRoutes.get("/sessions/:id/messages", (c) => {
  const id = c.req.param("id");
  const limit = Number(c.req.query("limit")) || 100;
  const offset = Number(c.req.query("offset")) || 0;
  const order = c.req.query("order") === "desc" ? "desc" : "asc";

  // セッションの存在確認
  const sessionInfo = sessionManager.getSessionInfo(id);
  if (!sessionInfo) {
    return c.json({ error: "Session not found" }, 404);
  }

  const messageRepo = new MessageRepository(dbManager.getDb());
  const messages = messageRepo.findBySessionId(id, { limit, offset, order });
  const total = messageRepo.countBySessionId(id);

  return c.json({
    sessionId: id,
    messages,
    total,
    hasMore: offset + messages.length < total,
  });
});

// List available projects/directories (only returns validated paths)
apiRoutes.get("/projects", async (c) => {
  const homeDir = process.env.HOME || "/";
  const projectDirs = ["repos", "projects", "code", "dev"].map(
    (d) => `${homeDir}/${d}`
  );

  const available: string[] = [];
  for (const dir of projectDirs) {
    // Only include directories that pass validation
    const validation = isValidWorkDir(dir);
    if (validation.valid) {
      available.push(dir);
    }
  }

  return c.json({ projects: available });
});
