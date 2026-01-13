import { describe, it, expect, beforeEach } from "vitest";
import { browser } from "../setup/global.js";

const PWA_URL = "http://localhost:5173";

async function connectAndWaitForSession() {
  // ページの状態を確認
  const snapshot = await browser.snapshot();

  // すでに接続されている場合はスキップ
  if (browser.hasText(snapshot, "接続中")) {
    return;
  }

  // 接続パネルが表示されている場合のみ接続
  if (browser.hasText(snapshot, "Bridge Server に接続")) {
    await browser.fillByRole("textbox", "http://localhost:8080");
    await browser.clickByRole("button", "接続");
    // 接続とセッション作成を待機
    await browser.waitFor(4000);
  }
}

describe("Messaging", () => {
  beforeEach(async () => {
    await browser.goto(PWA_URL);
    await browser.waitFor(1000);
    await connectAndWaitForSession();
  });

  it("should display input area after session creation", async () => {
    const snapshot = await browser.snapshot();

    // 接続中の状態が表示されている
    expect(browser.hasText(snapshot, "接続中")).toBe(true);

    // メッセージ入力欄が表示されている（プレースホルダーで確認）
    expect(browser.hasText(snapshot, "Message Claude...")).toBe(true);
  });

  it("should send a message and display it", async () => {
    // textarea を探してメッセージ入力
    // textareaはtextboxロールを持つ
    await browser.fillByPlaceholder("Message Claude...", "Hello, Claude!");

    // 送信（Enter キーを押す）
    await browser.press("Enter");

    // メッセージ表示待機
    await browser.waitFor(2000);

    const snapshot = await browser.snapshot();

    // 送信したメッセージが表示されている
    expect(browser.hasText(snapshot, "Hello, Claude!")).toBe(true);
  });

  it("should display Claude response from mock", async () => {
    // メッセージ入力
    await browser.fillByPlaceholder("Message Claude...", "hello");

    // 送信
    await browser.press("Enter");

    // Claude応答を待機
    await browser.waitFor(3000);

    const snapshot = await browser.snapshot();

    // モックからの応答が表示されている
    expect(browser.hasText(snapshot, "Hello! How can I help you today?")).toBe(true);
  });
});
