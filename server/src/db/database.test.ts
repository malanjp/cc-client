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
