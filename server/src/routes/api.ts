import { Hono } from "hono";
import { sessionManager, isValidWorkDir } from "../services/session";

export const apiRoutes = new Hono();

// List all active sessions
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

// Get session details
apiRoutes.get("/sessions/:id", (c) => {
  const id = c.req.param("id");
  const session = sessionManager.getSession(id);

  if (!session) {
    return c.json({ error: "Session not found" }, 404);
  }

  return c.json({ session: session.getInfo() });
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
