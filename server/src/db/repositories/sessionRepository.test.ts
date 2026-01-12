import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { DatabaseManager } from "../database";
import { SessionRepository } from "./sessionRepository";
import type { SessionRecord } from "../schema";

describe("SessionRepository", () => {
  let dbManager: DatabaseManager;
  let repo: SessionRepository;

  beforeEach(() => {
    dbManager = DatabaseManager.createInMemory();
    repo = new SessionRepository(dbManager.getDb());
  });

  afterEach(() => {
    dbManager.close();
  });

  const createTestSession = (overrides: Partial<SessionRecord> = {}): SessionRecord => ({
    id: "test-session-id",
    work_dir: "/home/user/project",
    created_at: Date.now(),
    updated_at: Date.now(),
    status: "active",
    process_alive: 1,
    ...overrides,
  });

  describe("create", () => {
    it("should create a session", () => {
      const session = createTestSession();
      repo.create(session);

      const found = repo.findById(session.id);
      expect(found).not.toBeNull();
      expect(found?.id).toBe(session.id);
      expect(found?.work_dir).toBe(session.work_dir);
      expect(found?.status).toBe("active");
    });
  });

  describe("findById", () => {
    it("should return null for non-existent session", () => {
      const result = repo.findById("non-existent");
      expect(result).toBeNull();
    });

    it("should find existing session", () => {
      const session = createTestSession();
      repo.create(session);

      const found = repo.findById(session.id);
      expect(found).not.toBeNull();
      expect(found?.id).toBe(session.id);
    });
  });

  describe("findAll", () => {
    it("should return empty array when no sessions", () => {
      const sessions = repo.findAll();
      expect(sessions).toEqual([]);
    });

    it("should return only active sessions by default", () => {
      repo.create(createTestSession({ id: "active-1", status: "active" }));
      repo.create(createTestSession({ id: "ended-1", status: "ended" }));

      const sessions = repo.findAll();
      expect(sessions).toHaveLength(1);
      expect(sessions[0].id).toBe("active-1");
    });

    it("should return all sessions when includeEnded is true", () => {
      repo.create(createTestSession({ id: "active-1", status: "active" }));
      repo.create(createTestSession({ id: "ended-1", status: "ended" }));

      const sessions = repo.findAll(true);
      expect(sessions).toHaveLength(2);
    });

    it("should order by created_at descending", () => {
      const now = Date.now();
      repo.create(createTestSession({ id: "old", created_at: now - 1000 }));
      repo.create(createTestSession({ id: "new", created_at: now }));

      const sessions = repo.findAll();
      expect(sessions[0].id).toBe("new");
      expect(sessions[1].id).toBe("old");
    });
  });

  describe("updateStatus", () => {
    it("should update session status", () => {
      const session = createTestSession();
      repo.create(session);

      repo.updateStatus(session.id, "ended");

      const found = repo.findById(session.id);
      expect(found?.status).toBe("ended");
    });

    it("should update updated_at timestamp", () => {
      const oldTime = Date.now() - 10000;
      const session = createTestSession({ updated_at: oldTime });
      repo.create(session);

      repo.updateStatus(session.id, "ended");

      const found = repo.findById(session.id);
      expect(found!.updated_at).toBeGreaterThan(oldTime);
    });
  });

  describe("updateProcessAlive", () => {
    it("should set process_alive to true", () => {
      const session = createTestSession({ process_alive: 0 });
      repo.create(session);

      repo.updateProcessAlive(session.id, true);

      const found = repo.findById(session.id);
      expect(found?.process_alive).toBe(1);
    });

    it("should set process_alive to false", () => {
      const session = createTestSession({ process_alive: 1 });
      repo.create(session);

      repo.updateProcessAlive(session.id, false);

      const found = repo.findById(session.id);
      expect(found?.process_alive).toBe(0);
    });
  });

  describe("resetAllProcessAlive", () => {
    it("should reset all sessions to process_alive=0", () => {
      repo.create(createTestSession({ id: "s1", process_alive: 1 }));
      repo.create(createTestSession({ id: "s2", process_alive: 1 }));

      repo.resetAllProcessAlive();

      const s1 = repo.findById("s1");
      const s2 = repo.findById("s2");
      expect(s1?.process_alive).toBe(0);
      expect(s2?.process_alive).toBe(0);
    });
  });

  describe("delete", () => {
    it("should delete a session", () => {
      const session = createTestSession();
      repo.create(session);

      repo.delete(session.id);

      const found = repo.findById(session.id);
      expect(found).toBeNull();
    });
  });
});
