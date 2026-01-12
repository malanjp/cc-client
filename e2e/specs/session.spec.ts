import { describe, it, expect, beforeEach } from "vitest";
import { browser } from "../setup/global.js";

const PWA_URL = "http://localhost:5173";

async function connectToServer() {
  // URL入力欄に入力
  await browser.fillByRole("textbox", "http://localhost:8080");

  // Connect ボタンをクリック
  await browser.clickByRole("button", "Connect");

  // 接続待機
  await browser.waitFor(2000);
}

describe("Session Management", () => {
  beforeEach(async () => {
    await browser.goto(PWA_URL);
    await browser.waitFor(1000);
    await connectToServer();
  });

  it("should create a new session and show message input", async () => {
    // Start Session ボタンをクリック
    await browser.clickByRole("button", "Start Session");

    // セッション作成待機
    await browser.waitFor(5000);

    const snapshot = await browser.snapshot();

    // セッション作成後はメッセージ入力画面が表示される
    // "Send a message to start a conversation" が表示される
    expect(browser.hasText(snapshot, "Send a message")).toBe(true);

    // メッセージ入力欄がある
    expect(browser.hasRole(snapshot, "textbox")).toBe(true);

    // ヘッダーの "Claude Code" が表示されている
    expect(browser.hasText(snapshot, "Claude Code")).toBe(true);
  });
});
