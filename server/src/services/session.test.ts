import { describe, it, expect, beforeEach } from "bun:test";
import { isValidWorkDir, ClaudeSession } from "./session";

describe("isValidWorkDir", () => {
  const HOME = process.env.HOME || "/";

  it("should allow paths under HOME directory", () => {
    const result = isValidWorkDir(HOME);
    expect(result.valid).toBe(true);
  });

  it("should allow paths under /tmp", () => {
    const result = isValidWorkDir("/tmp");
    expect(result.valid).toBe(true);
  });

  it("should reject paths outside allowed directories", () => {
    const result = isValidWorkDir("/etc/passwd");
    expect(result.valid).toBe(false);
    expect(result.error).toContain("Access denied");
  });

  it("should reject non-existent directories", () => {
    const result = isValidWorkDir(`${HOME}/definitely-does-not-exist-12345`);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("Directory not found");
  });

  it("should normalize paths with traversal attempts", () => {
    // This should resolve to /etc after normalization
    const result = isValidWorkDir(`${HOME}/../../../etc`);
    expect(result.valid).toBe(false);
  });
});

describe("ClaudeSession", () => {
  let session: ClaudeSession;

  beforeEach(() => {
    session = new ClaudeSession("/tmp");
  });

  describe("constructor", () => {
    it("should create session with unique id", () => {
      const session2 = new ClaudeSession("/tmp");
      expect(session.id).not.toBe(session2.id);
    });

    it("should set initial status to active", () => {
      expect(session.status).toBe("active");
    });

    it("should set workDir", () => {
      expect(session.workDir).toBe("/tmp");
    });

    it("should set timestamps", () => {
      const now = Date.now();
      expect(session.createdAt).toBeLessThanOrEqual(now);
      expect(session.updatedAt).toBeLessThanOrEqual(now);
      expect(session.lastActivity).toBeLessThanOrEqual(now);
    });
  });

  describe("touch", () => {
    it("should update lastActivity timestamp", async () => {
      const before = session.lastActivity;
      await new Promise((resolve) => setTimeout(resolve, 10));
      session.touch();
      expect(session.lastActivity).toBeGreaterThan(before);
    });
  });

  describe("isTimedOut", () => {
    it("should return false for new sessions", () => {
      expect(session.isTimedOut()).toBe(false);
    });

    it("should return false after touch", () => {
      session.touch();
      expect(session.isTimedOut()).toBe(false);
    });
  });

  describe("getInfo", () => {
    it("should return session info object", () => {
      const info = session.getInfo();
      expect(info.id).toBe(session.id);
      expect(info.workDir).toBe("/tmp");
      expect(info.status).toBe("active");
    });
  });

  describe("event handlers", () => {
    it("should register message handler", () => {
      const handler = () => {};
      // Should not throw
      session.onMessage(handler);
    });

    it("should register error handler", () => {
      const handler = () => {};
      // Should not throw
      session.onError(handler);
    });

    it("should register end handler", () => {
      const handler = () => {};
      // Should not throw
      session.onEnd(handler);
    });
  });

  describe("end", () => {
    it("should update status to ended", () => {
      session.end();
      expect(session.status).toBe("ended");
    });

    it("should return ended status in getInfo", () => {
      session.end();
      const info = session.getInfo();
      expect(info.status).toBe("ended");
    });
  });
});
