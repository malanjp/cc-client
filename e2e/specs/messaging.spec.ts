import { describe, it, expect, beforeEach } from "vitest";
import { browser } from "../setup/global.js";

const PWA_URL = "http://localhost:5173";

async function connectAndCreateSession() {
  // サーバーに接続
  await browser.fillByRole("textbox", "http://localhost:8080");
  await browser.clickByRole("button", "Connect");
  await browser.waitFor(2000);

  // セッション作成
  await browser.clickByRole("button", "Start Session");
  await browser.waitFor(3000);
}

describe("Messaging", () => {
  beforeEach(async () => {
    await browser.goto(PWA_URL);
    await browser.waitFor(1000);
    await connectAndCreateSession();
  });

  it("should display input area after session creation", async () => {
    const snapshot = await browser.snapshot();

    // メッセージ入力欄が表示されている
    expect(browser.hasRole(snapshot, "textbox")).toBe(true);
  });

  it("should send a message and display it", async () => {
    // メッセージ入力
    await browser.fillByRole("textbox", "Hello, Claude!");

    // 送信（Enter キーを押す）
    await browser.press("Enter");

    // メッセージ表示待機
    await browser.waitFor(2000);

    const snapshot = await browser.snapshot();

    // 送信したメッセージが表示されている
    expect(browser.hasText(snapshot, "Hello, Claude!")).toBe(true);
  });
});
