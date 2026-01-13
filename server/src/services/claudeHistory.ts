/**
 * Claude CLI のセッション履歴を解析するサービス
 * ~/.claude/projects/ ディレクトリからプロジェクト一覧とセッション履歴を取得
 */

import { readdirSync, readFileSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

export interface ClaudeProject {
  id: string; // プロジェクトID（ディレクトリ名）
  path: string; // 実際のファイルパス
  name: string; // 表示名（ディレクトリ名）
  lastAccessed: number; // 最終アクセス日時
  sessionCount: number; // セッション数
}

export interface ClaudeSessionSummary {
  id: string; // セッションID（UUID）
  projectId: string;
  firstMessage: string; // 最初のメッセージ（タイトル代わり）
  timestamp: Date;
  messageCount: number;
}

export interface ClaudeHistoryMessage {
  uuid: string;
  type: "user" | "assistant" | "tool_use" | "tool_result" | "system" | "thinking";
  content: string;
  timestamp: string;
  toolName?: string;
  toolInput?: Record<string, unknown>;
}

export interface ClaudeSessionDetail {
  id: string;
  projectId: string;
  cwd: string;
  gitBranch?: string;
  firstMessage: string;
  messageCount: number;
  createdAt: Date;
  lastUpdated: Date;
}

const CLAUDE_DIR = join(homedir(), ".claude");
const PROJECTS_DIR = join(CLAUDE_DIR, "projects");

/**
 * プロジェクトIDからパスを復元
 * 例: "-Users-malan-repos-malan-cc-client" -> "/Users/malan/repos/malan/cc-client"
 */
function projectIdToPath(projectId: string): string {
  // 先頭のハイフンを除去し、残りのハイフンをスラッシュに変換
  return "/" + projectId.slice(1).replace(/-/g, "/");
}

/**
 * パスからプロジェクトIDを生成
 * 例: "/Users/malan/repos/malan/cc-client" -> "-Users-malan-repos-malan-cc-client"
 */
export function pathToProjectId(path: string): string {
  return path.replace(/\//g, "-");
}

/**
 * プロジェクトディレクトリ内のセッションファイルからcwdを取得
 * projectIdToPathはパス内のハイフンを正しく処理できないため、
 * セッションファイルに保存されている正確なcwdを使用する
 */
function getProjectCwdFromSession(projectDir: string): string | null {
  try {
    const files = readdirSync(projectDir).filter(
      (f) => f.endsWith(".jsonl") && !f.startsWith(".")
    );

    for (const file of files) {
      const filePath = join(projectDir, file);
      const content = readFileSync(filePath, "utf-8");
      const lines = content.split("\n").filter((l) => l.trim());

      for (const line of lines) {
        try {
          const entry = JSON.parse(line);
          if (entry.cwd && typeof entry.cwd === "string") {
            return entry.cwd;
          }
        } catch {
          // JSON パースエラーは無視
        }
      }
    }
  } catch {
    // ファイル読み込みエラー
  }
  return null;
}

/**
 * Claude CLI のプロジェクト一覧を取得
 */
export function getClaudeProjects(): ClaudeProject[] {
  if (!existsSync(PROJECTS_DIR)) {
    return [];
  }

  try {
    const entries = readdirSync(PROJECTS_DIR, { withFileTypes: true });
    const projects: ClaudeProject[] = [];

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const projectPath = join(PROJECTS_DIR, entry.name);
      // セッションファイルからcwdを取得、フォールバックとしてprojectIdToPathを使用
      const actualPath = getProjectCwdFromSession(projectPath) || projectIdToPath(entry.name);

      // .jsonl ファイル（セッションファイル）をカウント
      const sessionFiles = readdirSync(projectPath).filter(
        (f) => f.endsWith(".jsonl") && !f.startsWith(".")
      );

      // 最新のセッションファイルの更新日時を取得
      let lastAccessed = 0;
      for (const file of sessionFiles) {
        try {
          const stat = statSync(join(projectPath, file));
          if (stat.mtimeMs > lastAccessed) {
            lastAccessed = stat.mtimeMs;
          }
        } catch {
          // ファイルが削除された可能性
        }
      }

      projects.push({
        id: entry.name,
        path: actualPath,
        name: actualPath.split("/").pop() || actualPath,
        lastAccessed,
        sessionCount: sessionFiles.length,
      });
    }

    // 最終アクセス日時でソート（新しい順）
    return projects.sort((a, b) => b.lastAccessed - a.lastAccessed);
  } catch (error) {
    console.error("[ClaudeHistory] Failed to get projects:", error);
    return [];
  }
}

/**
 * プロジェクトのセッション一覧を取得
 */
export function getProjectSessions(projectId: string): ClaudeSessionSummary[] {
  const projectDir = join(PROJECTS_DIR, projectId);

  if (!existsSync(projectDir)) {
    return [];
  }

  try {
    const files = readdirSync(projectDir).filter(
      (f) => f.endsWith(".jsonl") && !f.startsWith(".")
    );

    const sessions: ClaudeSessionSummary[] = [];

    for (const file of files) {
      const sessionId = file.replace(".jsonl", "");
      const filePath = join(projectDir, file);

      try {
        const content = readFileSync(filePath, "utf-8");
        const lines = content.split("\n").filter((l) => l.trim());

        if (lines.length === 0) continue;

        // 最初のユーザーメッセージを探す
        let firstMessage = "";
        let timestamp: Date | null = null;

        for (const line of lines) {
          try {
            const entry = JSON.parse(line);

            // タイムスタンプを取得
            if (!timestamp && entry.timestamp) {
              timestamp = new Date(entry.timestamp);
            }

            // 最初のユーザーメッセージを取得
            if (!firstMessage && entry.type === "user" && entry.message?.content) {
              const content = entry.message.content;
              firstMessage = typeof content === "string"
                ? content.slice(0, 50)
                : JSON.stringify(content).slice(0, 50);
              if (firstMessage.length === 50) firstMessage += "...";
            }

            // 両方取得できたら終了
            if (timestamp && firstMessage) break;
          } catch {
            // JSON パースエラーは無視
          }
        }

        sessions.push({
          id: sessionId,
          projectId,
          firstMessage: firstMessage || "(メッセージなし)",
          timestamp: timestamp || new Date(0),
          messageCount: lines.length,
        });
      } catch {
        // ファイル読み込みエラー
      }
    }

    // タイムスタンプでソート（新しい順）
    return sessions.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  } catch (error) {
    console.error("[ClaudeHistory] Failed to get sessions:", error);
    return [];
  }
}

/**
 * よく使うプロジェクトディレクトリを取得
 * Claude CLI の履歴から最近使用したプロジェクトのパスを返す
 */
export function getRecentProjectPaths(limit = 10): string[] {
  const projects = getClaudeProjects();
  return projects
    .slice(0, limit)
    .map((p) => p.path)
    .filter((path) => existsSync(path)); // 存在するパスのみ
}

/**
 * セッションの詳細情報を取得
 */
export function getSessionDetail(
  projectId: string,
  sessionId: string
): ClaudeSessionDetail | null {
  const filePath = join(PROJECTS_DIR, projectId, `${sessionId}.jsonl`);

  if (!existsSync(filePath)) {
    return null;
  }

  try {
    const content = readFileSync(filePath, "utf-8");
    const lines = content.split("\n").filter((l) => l.trim());

    if (lines.length === 0) {
      return null;
    }

    let cwd = "";
    let gitBranch: string | undefined;
    let firstMessage = "";
    let createdAt: Date | null = null;
    let lastUpdated: Date | null = null;

    for (const line of lines) {
      try {
        const entry = JSON.parse(line);

        // メタ情報を取得
        if (entry.cwd && !cwd) {
          cwd = entry.cwd;
        }
        if (entry.gitBranch && !gitBranch) {
          gitBranch = entry.gitBranch;
        }

        // タイムスタンプを取得
        if (entry.timestamp) {
          const ts = new Date(entry.timestamp);
          if (!createdAt) {
            createdAt = ts;
          }
          lastUpdated = ts;
        }

        // 最初のユーザーメッセージを取得（isMeta でないもの）
        if (
          !firstMessage &&
          entry.type === "user" &&
          entry.message?.content &&
          !entry.isMeta
        ) {
          const msgContent = entry.message.content;
          firstMessage =
            typeof msgContent === "string"
              ? msgContent.slice(0, 100)
              : JSON.stringify(msgContent).slice(0, 100);
          if (firstMessage.length === 100) firstMessage += "...";
        }
      } catch {
        // JSON パースエラーは無視
      }
    }

    return {
      id: sessionId,
      projectId,
      cwd: cwd || projectIdToPath(projectId),
      gitBranch,
      firstMessage: firstMessage || "(メッセージなし)",
      messageCount: lines.length,
      createdAt: createdAt || new Date(0),
      lastUpdated: lastUpdated || new Date(0),
    };
  } catch (error) {
    console.error("[ClaudeHistory] Failed to get session detail:", error);
    return null;
  }
}

/**
 * セッションのメッセージ履歴を取得
 */
export function getSessionMessages(
  projectId: string,
  sessionId: string
): ClaudeHistoryMessage[] {
  const filePath = join(PROJECTS_DIR, projectId, `${sessionId}.jsonl`);

  if (!existsSync(filePath)) {
    return [];
  }

  try {
    const content = readFileSync(filePath, "utf-8");
    const lines = content.split("\n").filter((l) => l.trim());
    const messages: ClaudeHistoryMessage[] = [];

    for (const line of lines) {
      try {
        const entry = JSON.parse(line);

        // file-history-snapshot などのメタデータはスキップ
        if (entry.type === "file-history-snapshot") {
          continue;
        }

        // isMeta フラグが true のエントリはスキップ
        if (entry.isMeta) {
          continue;
        }

        // 有効なメッセージタイプのみ処理
        const validTypes = [
          "user",
          "assistant",
          "tool_use",
          "tool_result",
          "system",
          "thinking",
        ];
        if (!validTypes.includes(entry.type)) {
          continue;
        }

        // コンテンツを抽出
        let msgContent = "";
        if (entry.message?.content) {
          const content = entry.message.content;
          if (typeof content === "string") {
            msgContent = content;
          } else if (Array.isArray(content)) {
            // ContentBlock 配列の場合、テキストを結合
            msgContent = content
              .map(
                (block: {
                  type: string;
                  text?: string;
                  thinking?: string;
                  name?: string;
                }) => {
                  if (block.type === "text" && block.text) {
                    return block.text;
                  }
                  if (block.type === "thinking" && block.thinking) {
                    return block.thinking;
                  }
                  if (block.type === "tool_use" && block.name) {
                    return `Tool: ${block.name}`;
                  }
                  return "";
                }
              )
              .filter(Boolean)
              .join("\n");
          }
        } else if (entry.thinking) {
          msgContent = entry.thinking;
        }

        // 空のコンテンツはスキップ
        if (!msgContent.trim()) {
          continue;
        }

        messages.push({
          uuid: entry.uuid || crypto.randomUUID(),
          type: entry.type as ClaudeHistoryMessage["type"],
          content: msgContent,
          timestamp: entry.timestamp || new Date().toISOString(),
          toolName: entry.tool_use?.name,
          toolInput: entry.tool_use?.input,
        });
      } catch {
        // JSON パースエラーは無視
      }
    }

    return messages;
  } catch (error) {
    console.error("[ClaudeHistory] Failed to get session messages:", error);
    return [];
  }
}
