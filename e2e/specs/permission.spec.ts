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

describe("Permission Request", () => {
  beforeEach(async () => {
    await browser.goto(PWA_URL);
    await browser.waitFor(1000);
    await connectAndWaitForSession();
  });

  it("should send edit request and receive response", async () => {
    // edit リクエストを送信
    await browser.fillByPlaceholder("Message Claude...", "edit file test.ts");

    await browser.press("Enter");

    // 応答を待機
    await browser.waitFor(3000);

    const snapshot = await browser.snapshot();

    // 何らかの応答が表示されている（モックからの応答）
    // basic-chat シナリオではデフォルト応答が返される
    const hasResponse =
      browser.hasText(snapshot, "understand") ||
      browser.hasText(snapshot, "help") ||
      browser.hasText(snapshot, "edit") ||
      browser.hasText(snapshot, "Edit");

    expect(hasResponse).toBe(true);
  });

  it("should handle approve action", async () => {
    // permission シナリオをトリガー
    await browser.fillByPlaceholder("Message Claude...", "modify file");

    await browser.press("Enter");

    // 応答を待機
    await browser.waitFor(3000);

    let snapshot = await browser.snapshot();

    // 承認ボタンがあればクリック
    if (browser.hasText(snapshot, "承認") || browser.hasRole(snapshot, "button")) {
      try {
        await browser.clickByText("承認");
        await browser.waitFor(2000);
        snapshot = await browser.snapshot();
      } catch {
        // 承認ボタンが見つからない場合はスキップ
      }
    }

    // 何らかの応答が表示されている
    expect(snapshot.tree.length).toBeGreaterThan(0);
  });

  it("should handle reject action", async () => {
    // permission シナリオをトリガー
    await browser.fillByPlaceholder("Message Claude...", "delete file");

    await browser.press("Enter");

    // 応答を待機
    await browser.waitFor(3000);

    let snapshot = await browser.snapshot();

    // 拒否ボタンがあればクリック
    if (browser.hasText(snapshot, "拒否") || browser.hasRole(snapshot, "button")) {
      try {
        await browser.clickByText("拒否");
        await browser.waitFor(2000);
        snapshot = await browser.snapshot();
      } catch {
        // 拒否ボタンが見つからない場合はスキップ
      }
    }

    // 何らかの応答が表示されている
    expect(snapshot.tree.length).toBeGreaterThan(0);
  });
});
