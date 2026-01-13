import { spawn } from "bun";
import path from "node:path";
import { existsSync } from "node:fs";
import { parseStreamJson, type ClaudeMessage } from "../utils/stream";
import { dbManager } from "../db/database";
import { SessionRepository } from "../db/repositories/sessionRepository";

// Allowed base paths for workDir (customize as needed)
const ALLOWED_BASE_PATHS = [
  process.env.HOME || "/",
  "/tmp",
];

// Session timeout configuration
const SESSION_TIMEOUT_MS = Number(process.env.SESSION_TIMEOUT_MS) || 30 * 60 * 1000; // 30 minutes
const TIMEOUT_CHECK_INTERVAL_MS = 60 * 1000; // 1 minute

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
  updatedAt: number;
  status: "active" | "ended";
  processAlive: boolean;
}

type ClaudeProcess = Awaited<ReturnType<typeof spawn>>;

export class ClaudeSession {
  id: string;
  workDir: string;
  createdAt: number;
  updatedAt: number;
  lastActivity: number;
  status: "active" | "ended" = "active";

  private process: ClaudeProcess | null = null;
  private messageHandlers: ((msg: ClaudeMessage) => void)[] = [];
  private errorHandlers: ((error: Error) => void)[] = [];
  private endHandlers: (() => void)[] = [];
  private endHandlersCalled = false;

  constructor(workDir: string) {
    this.id = crypto.randomUUID();
    this.workDir = workDir;
    const now = Date.now();
    this.createdAt = now;
    this.updatedAt = now;
    this.lastActivity = now;
  }

  /**
   * 最終アクティビティ時刻を更新
   */
  touch(): void {
    this.lastActivity = Date.now();
  }

  /**
   * タイムアウトしているかチェック
   */
  isTimedOut(): boolean {
    return Date.now() - this.lastActivity > SESSION_TIMEOUT_MS;
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

    // プロセス終了を検知してハンドラーを呼び出す
    this.process.exited.then(() => {
      this.callEndHandlers();
    });

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
    this.touch();
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
        // stdin に中断メッセージを送信（プロセスを終了させない）
        this.writeToStdin({ type: "abort" });
      } catch (error) {
        console.error("[Session] Failed to send abort:", error);
        // stdin への書き込みが失敗した場合のみ SIGINT を試行
        try {
          this.process.kill("SIGINT");
        } catch (killError) {
          console.error("[Session] Failed to send SIGINT:", killError);
        }
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
      updatedAt: this.updatedAt,
      status: this.status,
      processAlive: this.status === "active",
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
  private sessionRepo: SessionRepository;
  private timeoutCheckTimer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.sessionRepo = new SessionRepository(dbManager.getDb());
    // サーバー起動時に全プロセスを非活性化し、ステータスをリセット
    this.sessionRepo.resetAllProcessAlive();
    this.sessionRepo.resetAllActiveStatus();

    // タイムアウトチェッカーを開始
    this.startTimeoutChecker();
  }

  /**
   * 定期的にタイムアウトしたセッションをチェック
   */
  private startTimeoutChecker(): void {
    this.timeoutCheckTimer = setInterval(() => {
      this.checkTimeouts();
    }, TIMEOUT_CHECK_INTERVAL_MS);
  }

  /**
   * タイムアウトしたセッションを終了
   */
  private checkTimeouts(): void {
    const now = Date.now();
    for (const [id, session] of this.sessions) {
      if (session.isTimedOut()) {
        console.log(`[SessionManager] Session ${id} timed out (idle for ${Math.round((now - session.lastActivity) / 1000 / 60)} minutes)`);
        this.endSession(id);
      }
    }
  }

  /**
   * タイムアウトチェッカーを停止
   */
  stopTimeoutChecker(): void {
    if (this.timeoutCheckTimer) {
      clearInterval(this.timeoutCheckTimer);
      this.timeoutCheckTimer = null;
    }
  }

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

      // DB に保存
      this.sessionRepo.create({
        id: session.id,
        work_dir: session.workDir,
        created_at: session.createdAt,
        updated_at: session.updatedAt,
        status: "active",
        process_alive: 1,
      });

      // プロセス終了時に DB を更新
      session.onEnd(() => {
        this.sessionRepo.updateStatus(session.id, "ended");
        this.sessionRepo.updateProcessAlive(session.id, false);
        this.sessions.delete(session.id);
      });

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

  /**
   * セッション一覧を取得
   * @param includeEnded 終了済みセッションを含めるか
   */
  listSessions(includeEnded: boolean = false): SessionInfo[] {
    if (includeEnded) {
      // DB から全セッションを取得
      const dbSessions = this.sessionRepo.findAll(true);
      return dbSessions.map((s) => ({
        id: s.id,
        workDir: s.work_dir,
        createdAt: s.created_at,
        updatedAt: s.updated_at,
        status: s.status,
        processAlive: s.process_alive === 1,
      }));
    }
    // アクティブなセッションのみ（メモリから取得）
    return Array.from(this.sessions.values()).map((s) => s.getInfo());
  }

  /**
   * DB からセッション情報を取得
   */
  getSessionInfo(id: string): SessionInfo | null {
    const dbSession = this.sessionRepo.findById(id);
    if (!dbSession) return null;
    return {
      id: dbSession.id,
      workDir: dbSession.work_dir,
      createdAt: dbSession.created_at,
      updatedAt: dbSession.updated_at,
      status: dbSession.status,
      processAlive: dbSession.process_alive === 1,
    };
  }

  endSession(id: string): boolean {
    const session = this.sessions.get(id);
    if (session) {
      session.end();
      this.sessions.delete(id);
      // DB のステータスを更新
      this.sessionRepo.updateStatus(id, "ended");
      this.sessionRepo.updateProcessAlive(id, false);
      return true;
    }
    return false;
  }

  /**
   * 全セッションをシャットダウン（グレースフルシャットダウン用）
   */
  async shutdownAll(): Promise<void> {
    console.log(`[SessionManager] Shutting down ${this.sessions.size} sessions...`);

    // タイムアウトチェッカーを停止
    this.stopTimeoutChecker();

    const promises: Promise<void>[] = [];

    for (const [id, session] of this.sessions) {
      promises.push(
        new Promise((resolve) => {
          try {
            session.end();
            this.sessionRepo.updateStatus(id, "ended");
            this.sessionRepo.updateProcessAlive(id, false);
            console.log(`[SessionManager] Session ${id} ended`);
          } catch (error) {
            console.error(`[SessionManager] Error ending session ${id}:`, error);
          }
          resolve();
        })
      );
    }

    await Promise.all(promises);
    this.sessions.clear();
    console.log("[SessionManager] All sessions shut down");
  }

  /**
   * アクティブなセッション数を取得
   */
  getActiveCount(): number {
    return this.sessions.size;
  }
}

export const sessionManager = new SessionManager();
