import { describe, it, expect, beforeEach } from "vitest";
import { browser } from "../setup/global.js";

const PWA_URL = "http://localhost:5173";

async function connectToServer() {
  // URL入力欄に入力
  await browser.fillByRole("textbox", "http://localhost:8080");

  // 接続ボタンをクリック（ボタンを明示的に指定）
  await browser.clickByRole("button", "接続");

  // 接続待機
  await browser.waitFor(3000);
}

describe("Session Management", () => {
  beforeEach(async () => {
    await browser.goto(PWA_URL);
    await browser.waitFor(1000);
    await connectToServer();
  });

  it("should create a new session automatically on connect and show message input", async () => {
    const snapshot = await browser.snapshot();

    // 接続状態が表示される
    expect(browser.hasText(snapshot, "接続中")).toBe(true);

    // セッションIDが表示される
    expect(browser.hasText(snapshot, "セッション:")).toBe(true);

    // メッセージ入力欄がある（プレースホルダーで確認）
    expect(browser.hasText(snapshot, "Message Claude...")).toBe(true);

    // ヘッダーの "Claude Code" が表示されている
    expect(browser.hasText(snapshot, "Claude Code")).toBe(true);
  });

  it("should show disconnect button when connected", async () => {
    const snapshot = await browser.snapshot();

    // 切断ボタンが表示されている
    expect(browser.hasText(snapshot, "切断")).toBe(true);
  });
});
