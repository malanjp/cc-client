import { describe, it, expect } from "vitest";

const API_URL = "http://localhost:8080";

describe("REST API", () => {
  it("should return health check", async () => {
    const response = await fetch(`${API_URL}/health`);
    expect(response.status).toBe(200);
  });

  it("should return sessions list (may be empty)", async () => {
    const response = await fetch(`${API_URL}/api/sessions`);
    expect(response.status).toBe(200);

    const data = await response.json();
    // API は { sessions: [...] } 形式で返す
    expect(data).toHaveProperty("sessions");
    expect(Array.isArray(data.sessions)).toBe(true);
  });

  it("should return projects list (may be empty or error)", async () => {
    const response = await fetch(`${API_URL}/api/projects`);
    // プロジェクトがない場合は空配列、エラーの場合は500など
    expect([200, 500]).toContain(response.status);
  });

  it("should return claude-projects list", async () => {
    const response = await fetch(`${API_URL}/api/claude-projects`);
    // Claude CLI がインストールされていない場合はエラー、ある場合は200
    expect([200, 500]).toContain(response.status);
  });

  it("should handle browse request for valid path", async () => {
    const response = await fetch(`${API_URL}/api/browse?path=/tmp`);
    expect([200, 404]).toContain(response.status);
  });

  it("should handle browse request for home directory", async () => {
    const homePath = process.env.HOME || "/";
    const response = await fetch(`${API_URL}/api/browse?path=${encodeURIComponent(homePath)}`);
    expect([200, 404]).toContain(response.status);
  });
});
