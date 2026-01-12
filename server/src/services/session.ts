import { spawn } from "bun";
import path from "node:path";
import { existsSync } from "node:fs";
import { parseStreamJson, type ClaudeMessage } from "../utils/stream";

// Allowed base paths for workDir (customize as needed)
const ALLOWED_BASE_PATHS = [
  process.env.HOME || "/",
  "/tmp",
];

export function isValidWorkDir(workDir: string): { valid: boolean; error?: string } {
  // Normalize the path to prevent traversal attacks
  const normalized = path.resolve(workDir);

  // Check if it's under an allowed base path
  const isAllowed = ALLOWED_BASE_PATHS.some(base =>
    normalized.startsWith(path.resolve(base))
  );

  if (!isAllowed) {
    return {
      valid: false,
      error: `Access denied: ${workDir} is not in allowed paths`
    };
  }

  // Check if directory exists
  if (!existsSync(normalized)) {
    return {
      valid: false,
      error: `Directory not found: ${workDir}`
    };
  }

  return { valid: true };
}

export interface SessionInfo {
  id: string;
  workDir: string;
  createdAt: number;
  status: "active" | "ended";
}

type ClaudeProcess = Awaited<ReturnType<typeof spawn>>;

export class ClaudeSession {
  id: string;
  workDir: string;
  createdAt: number;
  status: "active" | "ended" = "active";

  private process: ClaudeProcess | null = null;
  private messageHandlers: ((msg: ClaudeMessage) => void)[] = [];
  private errorHandlers: ((error: Error) => void)[] = [];
  private endHandlers: (() => void)[] = [];
  private endHandlersCalled = false;

  constructor(workDir: string) {
    this.id = crypto.randomUUID();
    this.workDir = workDir;
    this.createdAt = Date.now();
  }

  async start(): Promise<void> {
    try {
      this.process = spawn({
        cmd: [
          "claude",
          "--output-format", "stream-json",
          "--input-format", "stream-json",
          "--verbose",
        ],
        cwd: this.workDir,
        stdin: "pipe",
        stdout: "pipe",
        stderr: "pipe",
      });
    } catch (error) {
      this.status = "ended";
      const message = error instanceof Error ? error.message : "Unknown error";
      throw new Error(`Failed to start Claude CLI: ${message}. Is 'claude' installed and in PATH?`);
    }

    this.readOutputStream();
    this.readErrorStream();
  }

  private async readOutputStream(): Promise<void> {
    const stdout = this.process?.stdout;
    if (!stdout || typeof stdout === "number") return;

    const reader = stdout.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.trim()) {
            try {
              const message = parseStreamJson(line);
              if (message) {
                this.messageHandlers.forEach((h) => h(message));
              }
            } catch (error) {
              const errMsg = error instanceof Error ? error.message : "Parse error";
              console.error("[Session] Parse error:", errMsg, "Line:", line.substring(0, 100));
              this.errorHandlers.forEach((h) =>
                h(new Error(`Failed to parse Claude response: ${errMsg}`))
              );
            }
          }
        }
      }
    } catch (error) {
      const err = error instanceof Error ? error : new Error("Stream read error");
      this.errorHandlers.forEach((h) => h(err));
    } finally {
      this.callEndHandlers();
    }
  }

  private async readErrorStream(): Promise<void> {
    const stderr = this.process?.stderr;
    if (!stderr || typeof stderr === "number") return;

    const reader = stderr.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.trim()) {
            console.error("[Claude stderr]", line);
            this.errorHandlers.forEach((h) =>
              h(new Error(`Claude CLI error: ${line}`))
            );
          }
        }
      }
    } catch (error) {
      console.error("[Session] stderr read error:", error);
    }
  }

  private callEndHandlers(): void {
    if (!this.endHandlersCalled) {
      this.endHandlersCalled = true;
      this.status = "ended";
      this.endHandlers.forEach((h) => h());
    }
  }

  private getActiveStdin() {
    const stdin = this.process?.stdin;
    if (!stdin || typeof stdin === "number" || this.status !== "active") {
      throw new Error("Session is not active");
    }
    return stdin;
  }

  private writeToStdin(data: unknown): void {
    const stdin = this.getActiveStdin();
    const input = JSON.stringify(data) + "\n";
    try {
      stdin.write(input);
    } catch (error) {
      this.status = "ended";
      const message = error instanceof Error ? error.message : "Write error";
      throw new Error(`Failed to write to stdin: ${message}`);
    }
  }

  async sendMessage(message: string): Promise<void> {
    this.writeToStdin({
      type: "user",
      message: { role: "user", content: message },
    });
  }

  async approve(): Promise<void> {
    this.writeToStdin({ type: "approval", approved: true });
  }

  async reject(): Promise<void> {
    this.writeToStdin({ type: "approval", approved: false });
  }

  abort(): void {
    if (this.process && this.status === "active") {
      try {
        this.process.kill("SIGINT");
      } catch (error) {
        console.error("[Session] Failed to send SIGINT:", error);
      }
    }
  }

  onMessage(handler: (msg: ClaudeMessage) => void): void {
    this.messageHandlers.push(handler);
  }

  onError(handler: (error: Error) => void): void {
    this.errorHandlers.push(handler);
  }

  onEnd(handler: () => void): void {
    this.endHandlers.push(handler);
  }

  getInfo(): SessionInfo {
    return {
      id: this.id,
      workDir: this.workDir,
      createdAt: this.createdAt,
      status: this.status,
    };
  }

  end(): void {
    if (this.process) {
      try {
        this.process.kill();
      } catch (error) {
        console.error("[Session] Failed to kill process:", error);
      }
      this.process = null;
    }
    this.callEndHandlers();
    // Clear handlers to prevent memory leaks
    this.messageHandlers = [];
    this.errorHandlers = [];
    this.endHandlers = [];
  }
}

class SessionManager {
  private sessions = new Map<string, ClaudeSession>();

  async createSession(workDir: string): Promise<ClaudeSession> {
    // Validate workDir before creating session
    const validation = isValidWorkDir(workDir);
    if (!validation.valid) {
      throw new Error(validation.error);
    }

    const session = new ClaudeSession(path.resolve(workDir));
    try {
      await session.start();
      this.sessions.set(session.id, session);
      return session;
    } catch (error) {
      // Clean up if start fails
      session.end();
      throw error;
    }
  }

  getSession(id: string): ClaudeSession | undefined {
    return this.sessions.get(id);
  }

  listSessions(): SessionInfo[] {
    return Array.from(this.sessions.values()).map((s) => s.getInfo());
  }

  endSession(id: string): boolean {
    const session = this.sessions.get(id);
    if (session) {
      session.end();
      this.sessions.delete(id);
      return true;
    }
    return false;
  }
}

export const sessionManager = new SessionManager();
