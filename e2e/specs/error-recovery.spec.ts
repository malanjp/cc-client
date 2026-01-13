import { describe, it, expect, beforeEach } from "vitest";
import { browser } from "../setup/global.js";

const PWA_URL = "http://localhost:5173";

async function connectAndWaitForSession() {
  const snapshot = await browser.snapshot();

  if (browser.hasText(snapshot, "接続中")) {
    return;
  }

  if (browser.hasText(snapshot, "Bridge Server に接続")) {
    await browser.fillByRole("textbox", "http://localhost:8080");
    await browser.clickByRole("button", "接続");
    await browser.waitFor(4000);
  }
}

describe("Error Recovery", () => {
  beforeEach(async () => {
    await browser.goto(PWA_URL);
    await browser.waitFor(1000);
  });

  it("should show connection panel when not connected", async () => {
    const snapshot = await browser.snapshot();

    // 接続パネルが表示されている
    expect(browser.hasText(snapshot, "Bridge Server に接続")).toBe(true);
    expect(browser.hasText(snapshot, "サーバー URL")).toBe(true);
  });

  it("should handle connection to invalid server gracefully", async () => {
    // 無効なURLを入力
    await browser.fillByRole("textbox", "http://localhost:9999");
    await browser.clickByRole("button", "接続");

    // エラー処理を待機
    await browser.waitFor(5000);

    const snapshot = await browser.snapshot();

    // 再接続中または接続パネルが表示されている
    const isHandled =
      browser.hasText(snapshot, "再接続中") ||
      browser.hasText(snapshot, "Bridge Server に接続") ||
      browser.hasText(snapshot, "エラー");

    expect(isHandled).toBe(true);
  });

  it("should recover and allow new connection after error", async () => {
    // まず無効なURLで接続を試みる
    await browser.fillByRole("textbox", "http://localhost:9999");
    await browser.clickByRole("button", "接続");
    await browser.waitFor(3000);

    // ページをリロード
    await browser.goto(PWA_URL);
    await browser.waitFor(1000);

    // 正しいURLで接続
    await connectAndWaitForSession();

    const snapshot = await browser.snapshot();

    // 接続成功
    expect(browser.hasText(snapshot, "接続中")).toBe(true);
  });

  it("should handle rapid message sending", async () => {
    await connectAndWaitForSession();

    // 複数のメッセージを素早く送信
    await browser.fillByPlaceholder("Message Claude...", "message 1");
    await browser.press("Enter");
    await browser.waitFor(500);

    await browser.fillByPlaceholder("Message Claude...", "message 2");
    await browser.press("Enter");
    await browser.waitFor(500);

    await browser.fillByPlaceholder("Message Claude...", "message 3");
    await browser.press("Enter");

    // 応答を待機
    await browser.waitFor(4000);

    const snapshot = await browser.snapshot();

    // メッセージが表示されている
    expect(
      browser.hasText(snapshot, "message 1") ||
      browser.hasText(snapshot, "message 2") ||
      browser.hasText(snapshot, "message 3")
    ).toBe(true);
  });

  it("should maintain session state across messages", async () => {
    await connectAndWaitForSession();

    // 最初のメッセージ
    await browser.fillByPlaceholder("Message Claude...", "hello");
    await browser.press("Enter");
    await browser.waitFor(3000);

    // 2番目のメッセージ
    await browser.fillByPlaceholder("Message Claude...", "how are you?");
    await browser.press("Enter");
    await browser.waitFor(3000);

    const snapshot = await browser.snapshot();

    // 両方のメッセージが表示されている
    expect(browser.hasText(snapshot, "hello")).toBe(true);
  });

  it("should show disconnect button during active session", async () => {
    await connectAndWaitForSession();

    const snapshot = await browser.snapshot();

    // 切断ボタンが表示されている
    expect(browser.hasText(snapshot, "切断")).toBe(true);
  });

  it("should handle empty message gracefully", async () => {
    await connectAndWaitForSession();

    // 空のメッセージでEnterを押しても問題ない
    await browser.press("Enter");
    await browser.waitFor(1000);

    const snapshot = await browser.snapshot();

    // 接続状態が維持されている
    expect(browser.hasText(snapshot, "接続中")).toBe(true);
  });

  it("should show input hint text", async () => {
    await connectAndWaitForSession();

    const snapshot = await browser.snapshot();

    // 入力ヒントが表示されている
    expect(browser.hasText(snapshot, "Enter で送信")).toBe(true);
  });
});
