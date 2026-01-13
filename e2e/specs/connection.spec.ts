import { describe, it, expect, beforeEach } from "vitest";
import { browser } from "../setup/global.js";

const PWA_URL = "http://localhost:5173";

describe("Connection Flow", () => {
  beforeEach(async () => {
    await browser.goto(PWA_URL);
    await browser.waitFor(1000);
  });

  it("should display connection panel on initial load", async () => {
    const snapshot = await browser.snapshot();

    // ヘッダーが表示されている
    expect(browser.hasText(snapshot, "Claude Code")).toBe(true);

    // 接続パネルが表示されている（日本語UI）
    expect(browser.hasText(snapshot, "Bridge Server に接続")).toBe(true);

    // URL入力欄がある
    expect(browser.hasRole(snapshot, "textbox")).toBe(true);

    // 接続ボタンがある
    expect(browser.hasText(snapshot, "接続")).toBe(true);
  });

  it("should connect to bridge server successfully", async () => {
    // URL入力欄に入力（デフォルト値がすでに入っている場合もある）
    await browser.fillByRole("textbox", "http://localhost:8080");

    // 接続ボタンをクリック（ボタンを明示的に指定）
    await browser.clickByRole("button", "接続");

    // 接続成功を待機
    await browser.waitFor(3000);

    const snapshot = await browser.snapshot();

    // 接続中の状態が表示される（セッションIDが表示されている）
    expect(browser.hasText(snapshot, "接続中")).toBe(true);

    // セッション情報が表示される
    expect(browser.hasText(snapshot, "セッション:")).toBe(true);
  });

  it("should show error or stay on connection panel for invalid server URL", async () => {
    // 無効なURLを入力
    await browser.fillByRole("textbox", "http://localhost:9999");

    // 接続ボタンをクリック（ボタンを明示的に指定）
    await browser.clickByRole("button", "接続");

    // エラーメッセージ待機（再接続を試みる場合もある）
    await browser.waitFor(5000);

    const snapshot = await browser.snapshot();

    // 再接続中または接続パネルがまだ表示されている
    const isReconnecting = browser.hasText(snapshot, "再接続中");
    const isConnectionPanel = browser.hasText(snapshot, "Bridge Server に接続");

    expect(isReconnecting || isConnectionPanel).toBe(true);
  });
});
