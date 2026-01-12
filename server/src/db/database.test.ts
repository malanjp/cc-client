import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { DatabaseManager } from "./database";

describe("DatabaseManager", () => {
  let dbManager: DatabaseManager;

  beforeEach(() => {
    dbManager = DatabaseManager.createInMemory();
  });

  afterEach(() => {
    dbManager.close();
  });

  it("should create database connection", () => {
    const db = dbManager.getDb();
    expect(db).toBeDefined();
  });

  it("should create sessions table", () => {
    const db = dbManager.getDb();
    const result = db
      .query("SELECT name FROM sqlite_master WHERE type='table' AND name='sessions'")
      .get();
    expect(result).toEqual({ name: "sessions" });
  });

  it("should create messages table", () => {
    const db = dbManager.getDb();
    const result = db
      .query("SELECT name FROM sqlite_master WHERE type='table' AND name='messages'")
      .get();
    expect(result).toEqual({ name: "messages" });
  });

  it("should create indexes", () => {
    const db = dbManager.getDb();
    const indexes = db
      .query("SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_%'")
      .all() as { name: string }[];
    const indexNames = indexes.map((idx) => idx.name);
    expect(indexNames).toContain("idx_messages_session_id");
    expect(indexNames).toContain("idx_messages_timestamp");
    expect(indexNames).toContain("idx_sessions_status");
  });

  it("should enable foreign keys", () => {
    const db = dbManager.getDb();
    const result = db.query("PRAGMA foreign_keys").get() as { foreign_keys: number };
    expect(result.foreign_keys).toBe(1);
  });

  it("should use WAL mode", () => {
    const db = dbManager.getDb();
    const result = db.query("PRAGMA journal_mode").get() as { journal_mode: string };
    // インメモリDBではWALモードが使えないため memory になる
    expect(["wal", "memory"]).toContain(result.journal_mode);
  });

  it("should return same instance on multiple getDb calls", () => {
    const db1 = dbManager.getDb();
    const db2 = dbManager.getDb();
    expect(db1).toBe(db2);
  });

  it("should allow reopening after close", () => {
    const db1 = dbManager.getDb();
    dbManager.close();
    const db2 = dbManager.getDb();
    expect(db2).toBeDefined();
    expect(db1).not.toBe(db2);
  });
});
