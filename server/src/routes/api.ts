import { Hono } from "hono";
import { readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { sessionManager, isValidWorkDir } from "../services/session";
import {
  getClaudeProjects,
  getProjectSessions,
  getRecentProjectPaths,
  getSessionDetail,
  getSessionMessages,
} from "../services/claudeHistory";

export const apiRoutes = new Hono();

// List active sessions (memory only, no DB)
apiRoutes.get("/sessions", (c) => {
  const sessions = sessionManager.listSessions();
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

// Get session details (active sessions only)
apiRoutes.get("/sessions/:id", (c) => {
  const id = c.req.param("id");

  const session = sessionManager.getSession(id);
  if (session) {
    return c.json({ session: session.getInfo() });
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

// List available projects/directories (only returns validated paths)
apiRoutes.get("/projects", async (c) => {
  const homeDir = process.env.HOME || "/";

  // Claude CLI の履歴から最近使ったプロジェクトを取得
  const recentPaths = getRecentProjectPaths(20);

  // よく使うディレクトリパターン
  const projectDirs = ["repos", "projects", "code", "dev"].map(
    (d) => `${homeDir}/${d}`
  );

  // 利用可能なプロジェクトディレクトリを収集
  const available: Array<{ path: string; name: string; isRecent: boolean }> = [];
  const seenPaths = new Set<string>();

  // 最近使ったプロジェクトを優先
  for (const path of recentPaths) {
    if (seenPaths.has(path)) continue;
    const validation = isValidWorkDir(path);
    if (validation.valid) {
      seenPaths.add(path);
      available.push({
        path,
        name: path.split("/").pop() || path,
        isRecent: true,
      });
    }
  }

  // よく使うディレクトリからサブディレクトリを取得
  for (const dir of projectDirs) {
    if (!existsSync(dir)) continue;
    try {
      const entries = readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
        const fullPath = join(dir, entry.name);
        if (seenPaths.has(fullPath)) continue;

        const validation = isValidWorkDir(fullPath);
        if (validation.valid) {
          seenPaths.add(fullPath);
          available.push({
            path: fullPath,
            name: entry.name,
            isRecent: false,
          });
        }
      }
    } catch {
      // ディレクトリ読み込みエラー
    }
  }

  return c.json({ projects: available });
});

// Claude CLI のプロジェクト一覧を取得
apiRoutes.get("/claude-projects", (c) => {
  const projects = getClaudeProjects();
  return c.json({ projects });
});

// Claude CLI のプロジェクトのセッション一覧を取得
apiRoutes.get("/claude-projects/:projectId/sessions", (c) => {
  const projectId = c.req.param("projectId");
  const sessions = getProjectSessions(projectId);
  return c.json({ sessions });
});

// Claude CLI のセッション詳細を取得
apiRoutes.get("/claude-projects/:projectId/sessions/:sessionId", (c) => {
  const projectId = c.req.param("projectId");
  const sessionId = c.req.param("sessionId");
  const detail = getSessionDetail(projectId, sessionId);

  if (!detail) {
    return c.json({ error: "Session not found" }, 404);
  }

  return c.json({ session: detail });
});

// Claude CLI のセッションメッセージ履歴を取得
apiRoutes.get("/claude-projects/:projectId/sessions/:sessionId/messages", (c) => {
  const projectId = c.req.param("projectId");
  const sessionId = c.req.param("sessionId");
  const limit = Number(c.req.query("limit")) || 100;
  const offset = Number(c.req.query("offset")) || 0;

  const messages = getSessionMessages(projectId, sessionId);

  if (messages.length === 0) {
    // セッションが存在しないか、メッセージがない
    const detail = getSessionDetail(projectId, sessionId);
    if (!detail) {
      return c.json({ error: "Session not found" }, 404);
    }
  }

  const paginated = messages.slice(offset, offset + limit);

  return c.json({
    projectId,
    sessionId,
    messages: paginated,
    total: messages.length,
    hasMore: offset + paginated.length < messages.length,
  });
});

// ディレクトリのサブディレクトリ一覧を取得（ディレクトリブラウザ用）
apiRoutes.get("/browse", (c) => {
  const path = c.req.query("path") || process.env.HOME || "/";

  const validation = isValidWorkDir(path);
  if (!validation.valid) {
    return c.json({ error: validation.error }, 403);
  }

  try {
    const entries = readdirSync(path, { withFileTypes: true });
    const directories = entries
      .filter((e) => e.isDirectory() && !e.name.startsWith("."))
      .map((e) => ({
        name: e.name,
        path: join(path, e.name),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));

    return c.json({
      currentPath: path,
      parentPath: path !== "/" ? join(path, "..") : null,
      directories,
    });
  } catch (error) {
    return c.json({ error: "Failed to read directory" }, 500);
  }
});
