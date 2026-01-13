/**
 * SQLite データベース接続管理
 * Note: sessions/messages テーブルは削除されました。
 * 将来の拡張用に DB 接続機能を維持しています。
 */
import { Database } from "bun:sqlite";
import { mkdirSync, existsSync } from "node:fs";
import { dirname } from "node:path";
import { SCHEMA } from "./schema";

const DEFAULT_DB_PATH = "./data/cc-client.db";

class DatabaseManager {
  private db: Database | null = null;
  private dbPath: string;

  constructor(dbPath: string = DEFAULT_DB_PATH) {
    this.dbPath = dbPath;
  }

  /**
   * データベース接続を取得（遅延初期化）
   */
  getDb(): Database {
    if (!this.db) {
      this.initDb();
    }
    return this.db!;
  }

  /**
   * データベースを初期化
   */
  private initDb(): void {
    // ディレクトリ作成
    const dir = dirname(this.dbPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    // データベース接続
    this.db = new Database(this.dbPath, { create: true });

    // PRAGMA 設定
    this.db.exec("PRAGMA foreign_keys = ON");
    this.db.exec("PRAGMA journal_mode = WAL");

    // スキーマ作成（空でなければ実行）
    if (SCHEMA.trim() && !SCHEMA.trim().startsWith("--")) {
      this.db.exec(SCHEMA);
    }
  }

  /**
   * データベース接続を閉じる
   */
  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }

  /**
   * テスト用: インメモリDBで初期化
   */
  static createInMemory(): DatabaseManager {
    const manager = new DatabaseManager(":memory:");
    return manager;
  }
}

// シングルトンインスタンス
export const dbManager = new DatabaseManager();

// テスト用エクスポート
export { DatabaseManager };
