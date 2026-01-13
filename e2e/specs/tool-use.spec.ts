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

describe("Tool Use", () => {
  beforeEach(async () => {
    await browser.goto(PWA_URL);
    await browser.waitFor(1000);
    await connectAndWaitForSession();
  });

  it("should display tool_use message when Claude uses a tool", async () => {
    // tool-use シナリオを使用するため、ファイル読み込みを依頼
    await browser.fillByPlaceholder("Message Claude...", "read file test.txt");

    await browser.press("Enter");

    // 応答を待機
    await browser.waitFor(3000);

    const snapshot = await browser.snapshot();

    // ツール使用のメッセージが表示されている
    // モックからの応答に "Read" ツールの使用が含まれる
    expect(browser.hasText(snapshot, "Read") || browser.hasText(snapshot, "file")).toBe(true);
  });

  it("should display thinking message when Claude thinks", async () => {
    // thinking シナリオをトリガー
    await browser.fillByPlaceholder("Message Claude...", "think about this");

    await browser.press("Enter");

    // 応答を待機
    await browser.waitFor(3000);

    const snapshot = await browser.snapshot();

    // モックからの応答が表示される
    expect(browser.hasText(snapshot, "understand") || browser.hasText(snapshot, "help")).toBe(true);
  });
});
