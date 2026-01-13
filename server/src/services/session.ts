import { spawn } from "bun";
import path from "node:path";
import { existsSync } from "node:fs";
import { PartialJsonParser, type ClaudeMessage } from "../utils/stream";

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
  /** Claude CLI の元セッションID（resume で作成した場合のみ） */
  claudeSessionId?: string | null;
}

type ClaudeProcess = Awaited<ReturnType<typeof spawn>>;

export class ClaudeSession {
  id: string;
  workDir: string;
  createdAt: number;
  updatedAt: number;
  lastActivity: number;
  status: "active" | "ended" = "active";
  /** Claude CLI の元セッションID（resume 時に使用） */
  claudeSessionId: string | null = null;

  private process: ClaudeProcess | null = null;
  private messageHandlers: ((msg: ClaudeMessage) => void)[] = [];
  private errorHandlers: ((error: Error) => void)[] = [];
  private endHandlers: (() => void)[] = [];
  private endHandlersCalled = false;

  constructor(workDir: string, claudeSessionId?: string) {
    this.id = crypto.randomUUID();
    this.workDir = workDir;
    this.claudeSessionId = claudeSessionId || null;
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
    // コマンドを構築（モックスクリプトが指定されている場合はそちらを使用）
    const mockScript = process.env.MOCK_CLAUDE_SCRIPT;
    const cmd = mockScript
      ? ["bun", "run", mockScript]
      : [
          "claude",
          "--print",
          "--output-format", "stream-json",
          "--input-format", "stream-json",
          "--verbose",
        ];

    // resume モードの場合は --resume オプションを追加（モックでは無視）
    if (this.claudeSessionId && !mockScript) {
      cmd.push("--resume", this.claudeSessionId);
    }

    try {
      this.process = spawn({
        cmd,
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
    const parser = new PartialJsonParser();

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const messages = parser.addChunk(chunk);

        // チャンク到着ごとに即座にメッセージを配信（ストリーミング）
        for (const message of messages) {
          this.messageHandlers.forEach((h) => h(message));
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
      claudeSessionId: this.claudeSessionId,
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
  private timeoutCheckTimer: ReturnType<typeof setInterval> | null = null;

  constructor() {
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

      // プロセス終了時にメモリから削除
      session.onEnd(() => {
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
   * Claude CLI の既存セッションを再開
   * @param claudeSessionId Claude CLI のセッションID
   * @param workDir 作業ディレクトリ
   */
  async resumeSession(claudeSessionId: string, workDir: string): Promise<ClaudeSession> {
    // Validate workDir before creating session
    const validation = isValidWorkDir(workDir);
    if (!validation.valid) {
      throw new Error(validation.error);
    }

    const session = new ClaudeSession(path.resolve(workDir), claudeSessionId);
    try {
      await session.start();
      this.sessions.set(session.id, session);

      // プロセス終了時にメモリから削除
      session.onEnd(() => {
        this.sessions.delete(session.id);
      });

      return session;
    } catch (error) {
      // Clean up if start fails
      session.end();
      throw error;
    }
  }

  /**
   * アクティブなセッション一覧を取得
   */
  listSessions(): SessionInfo[] {
    return Array.from(this.sessions.values()).map((s) => s.getInfo());
  }

  /**
   * メモリ上のセッション情報を取得
   */
  getSessionInfo(id: string): SessionInfo | null {
    const session = this.sessions.get(id);
    if (!session) return null;
    return session.getInfo();
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
