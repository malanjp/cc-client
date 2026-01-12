/**
 * メッセージ履歴の永続化を担当する Repository
 */
import type { Database } from "bun:sqlite";
import type { MessageRecord } from "../schema";

export interface FindMessagesOptions {
  limit?: number;
  offset?: number;
  order?: "asc" | "desc";
}

export class MessageRepository {
  constructor(private db: Database) {}

  /**
   * メッセージを作成
   */
  create(message: MessageRecord): void {
    const stmt = this.db.prepare(`
      INSERT INTO messages (id, session_id, type, content, timestamp, tool_name, tool_input, permission_request)
      VALUES ($id, $session_id, $type, $content, $timestamp, $tool_name, $tool_input, $permission_request)
    `);
    stmt.run({
      $id: message.id,
      $session_id: message.session_id,
      $type: message.type,
      $content: message.content,
      $timestamp: message.timestamp,
      $tool_name: message.tool_name,
      $tool_input: message.tool_input,
      $permission_request: message.permission_request,
    });
  }

  /**
   * セッション ID でメッセージを取得
   */
  findBySessionId(sessionId: string, options: FindMessagesOptions = {}): MessageRecord[] {
    const { limit = 100, offset = 0, order = "asc" } = options;
    const orderDirection = order === "desc" ? "DESC" : "ASC";

    const stmt = this.db.prepare(`
      SELECT * FROM messages
      WHERE session_id = $session_id
      ORDER BY timestamp ${orderDirection}
      LIMIT $limit OFFSET $offset
    `);

    return stmt.all({
      $session_id: sessionId,
      $limit: limit,
      $offset: offset,
    }) as MessageRecord[];
  }

  /**
   * セッション ID でメッセージ数をカウント
   */
  countBySessionId(sessionId: string): number {
    const stmt = this.db.prepare("SELECT COUNT(*) as count FROM messages WHERE session_id = $session_id");
    const result = stmt.get({ $session_id: sessionId }) as { count: number };
    return result.count;
  }

  /**
   * セッション ID でメッセージを削除
   */
  deleteBySessionId(sessionId: string): void {
    const stmt = this.db.prepare("DELETE FROM messages WHERE session_id = $session_id");
    stmt.run({ $session_id: sessionId });
  }

  /**
   * メッセージを削除
   */
  delete(id: string): void {
    const stmt = this.db.prepare("DELETE FROM messages WHERE id = $id");
    stmt.run({ $id: id });
  }
}
