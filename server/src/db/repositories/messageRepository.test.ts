import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { DatabaseManager } from "../database";
import { SessionRepository } from "./sessionRepository";
import { MessageRepository } from "./messageRepository";
import type { MessageRecord } from "../schema";

describe("MessageRepository", () => {
  let dbManager: DatabaseManager;
  let sessionRepo: SessionRepository;
  let messageRepo: MessageRepository;

  beforeEach(() => {
    dbManager = DatabaseManager.createInMemory();
    const db = dbManager.getDb();
    sessionRepo = new SessionRepository(db);
    messageRepo = new MessageRepository(db);

    // テスト用セッションを作成
    sessionRepo.create({
      id: "test-session",
      work_dir: "/home/user/project",
      created_at: Date.now(),
      updated_at: Date.now(),
      status: "active",
      process_alive: 1,
    });
  });

  afterEach(() => {
    dbManager.close();
  });

  const createTestMessage = (overrides: Partial<MessageRecord> = {}): MessageRecord => ({
    id: `msg-${Date.now()}-${Math.random()}`,
    session_id: "test-session",
    type: "user",
    content: "Hello, Claude!",
    timestamp: Date.now(),
    tool_name: null,
    tool_input: null,
    permission_request: null,
    ...overrides,
  });

  describe("create", () => {
    it("should create a message", () => {
      const message = createTestMessage({ id: "msg-1" });
      messageRepo.create(message);

      const messages = messageRepo.findBySessionId("test-session");
      expect(messages).toHaveLength(1);
      expect(messages[0].id).toBe("msg-1");
      expect(messages[0].content).toBe("Hello, Claude!");
    });

    it("should create message with tool_use data", () => {
      const toolInput = JSON.stringify({ file_path: "/path/to/file" });
      const message = createTestMessage({
        id: "msg-tool",
        type: "tool_use",
        tool_name: "Read",
        tool_input: toolInput,
      });
      messageRepo.create(message);

      const messages = messageRepo.findBySessionId("test-session");
      expect(messages[0].type).toBe("tool_use");
      expect(messages[0].tool_name).toBe("Read");
      expect(messages[0].tool_input).toBe(toolInput);
    });

    it("should create message with permission_request", () => {
      const permRequest = JSON.stringify({ id: "perm-1", tool: "Bash", description: "Run npm install" });
      const message = createTestMessage({
        id: "msg-perm",
        type: "permission_request",
        permission_request: permRequest,
      });
      messageRepo.create(message);

      const messages = messageRepo.findBySessionId("test-session");
      expect(messages[0].type).toBe("permission_request");
      expect(messages[0].permission_request).toBe(permRequest);
    });
  });

  describe("findBySessionId", () => {
    it("should return empty array for no messages", () => {
      const messages = messageRepo.findBySessionId("test-session");
      expect(messages).toEqual([]);
    });

    it("should order by timestamp ascending by default", () => {
      const now = Date.now();
      messageRepo.create(createTestMessage({ id: "msg-2", timestamp: now + 1000 }));
      messageRepo.create(createTestMessage({ id: "msg-1", timestamp: now }));

      const messages = messageRepo.findBySessionId("test-session");
      expect(messages[0].id).toBe("msg-1");
      expect(messages[1].id).toBe("msg-2");
    });

    it("should order by timestamp descending when specified", () => {
      const now = Date.now();
      messageRepo.create(createTestMessage({ id: "msg-1", timestamp: now }));
      messageRepo.create(createTestMessage({ id: "msg-2", timestamp: now + 1000 }));

      const messages = messageRepo.findBySessionId("test-session", { order: "desc" });
      expect(messages[0].id).toBe("msg-2");
      expect(messages[1].id).toBe("msg-1");
    });

    it("should respect limit option", () => {
      for (let i = 0; i < 10; i++) {
        messageRepo.create(createTestMessage({ id: `msg-${i}`, timestamp: Date.now() + i }));
      }

      const messages = messageRepo.findBySessionId("test-session", { limit: 5 });
      expect(messages).toHaveLength(5);
    });

    it("should respect offset option", () => {
      const now = Date.now();
      for (let i = 0; i < 10; i++) {
        messageRepo.create(createTestMessage({ id: `msg-${i}`, timestamp: now + i }));
      }

      const messages = messageRepo.findBySessionId("test-session", { offset: 3, limit: 3 });
      expect(messages).toHaveLength(3);
      expect(messages[0].id).toBe("msg-3");
    });
  });

  describe("countBySessionId", () => {
    it("should return 0 for no messages", () => {
      const count = messageRepo.countBySessionId("test-session");
      expect(count).toBe(0);
    });

    it("should return correct count", () => {
      messageRepo.create(createTestMessage({ id: "msg-1" }));
      messageRepo.create(createTestMessage({ id: "msg-2" }));
      messageRepo.create(createTestMessage({ id: "msg-3" }));

      const count = messageRepo.countBySessionId("test-session");
      expect(count).toBe(3);
    });

    it("should count only messages for specified session", () => {
      // 別のセッションを作成
      sessionRepo.create({
        id: "other-session",
        work_dir: "/other",
        created_at: Date.now(),
        updated_at: Date.now(),
        status: "active",
        process_alive: 1,
      });

      messageRepo.create(createTestMessage({ id: "msg-1", session_id: "test-session" }));
      messageRepo.create(createTestMessage({ id: "msg-2", session_id: "other-session" }));

      const count = messageRepo.countBySessionId("test-session");
      expect(count).toBe(1);
    });
  });

  describe("deleteBySessionId", () => {
    it("should delete all messages for a session", () => {
      messageRepo.create(createTestMessage({ id: "msg-1" }));
      messageRepo.create(createTestMessage({ id: "msg-2" }));

      messageRepo.deleteBySessionId("test-session");

      const messages = messageRepo.findBySessionId("test-session");
      expect(messages).toEqual([]);
    });

    it("should not delete messages from other sessions", () => {
      sessionRepo.create({
        id: "other-session",
        work_dir: "/other",
        created_at: Date.now(),
        updated_at: Date.now(),
        status: "active",
        process_alive: 1,
      });

      messageRepo.create(createTestMessage({ id: "msg-1", session_id: "test-session" }));
      messageRepo.create(createTestMessage({ id: "msg-2", session_id: "other-session" }));

      messageRepo.deleteBySessionId("test-session");

      const testMessages = messageRepo.findBySessionId("test-session");
      const otherMessages = messageRepo.findBySessionId("other-session");
      expect(testMessages).toEqual([]);
      expect(otherMessages).toHaveLength(1);
    });
  });

  describe("cascade delete", () => {
    it("should delete messages when session is deleted", () => {
      messageRepo.create(createTestMessage({ id: "msg-1" }));
      messageRepo.create(createTestMessage({ id: "msg-2" }));

      sessionRepo.delete("test-session");

      const messages = messageRepo.findBySessionId("test-session");
      expect(messages).toEqual([]);
    });
  });
});
