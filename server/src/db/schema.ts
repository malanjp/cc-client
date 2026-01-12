/**
 * SQLite スキーマ定義
 */

export const SCHEMA = `
-- セッションテーブル
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  work_dir TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active', 'ended')),
  process_alive INTEGER NOT NULL DEFAULT 0
);

-- メッセージ履歴テーブル
CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  type TEXT NOT NULL,
  content TEXT NOT NULL,
  timestamp INTEGER NOT NULL,
  tool_name TEXT,
  tool_input TEXT,
  permission_request TEXT,
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
);

-- インデックス
CREATE INDEX IF NOT EXISTS idx_messages_session_id ON messages(session_id);
CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages(timestamp);
CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status);
`;

export type SessionStatus = "active" | "ended";

export interface SessionRecord {
  id: string;
  work_dir: string;
  created_at: number;
  updated_at: number;
  status: SessionStatus;
  process_alive: number; // SQLite では boolean を INTEGER で扱う
}

export interface MessageRecord {
  id: string;
  session_id: string;
  type: string;
  content: string;
  timestamp: number;
  tool_name: string | null;
  tool_input: string | null; // JSON 文字列
  permission_request: string | null; // JSON 文字列
}
