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

    // 接続パネルが表示されている
    expect(browser.hasText(snapshot, "Connect to Bridge Server")).toBe(true);

    // URL入力欄がある
    expect(browser.hasRole(snapshot, "textbox")).toBe(true);

    // Connect ボタンがある
    expect(browser.hasText(snapshot, "Connect")).toBe(true);
  });

  it("should connect to bridge server successfully", async () => {
    // URL入力欄に入力
    await browser.fillByRole("textbox", "http://localhost:8080");

    // Connect ボタンをクリック
    await browser.clickByRole("button", "Connect");

    // 接続成功を待機
    await browser.waitFor(2000);

    const snapshot = await browser.snapshot();

    // "Connected to server" が表示される
    expect(browser.hasText(snapshot, "Connected to server")).toBe(true);

    // "Start Session" ボタンが表示される
    expect(browser.hasText(snapshot, "Start Session")).toBe(true);
  });

  it("should show error message for invalid server URL", async () => {
    // 無効なURLを入力
    await browser.fillByRole("textbox", "http://localhost:9999");

    // Connect ボタンをクリック
    await browser.clickByRole("button", "Connect");

    // エラーメッセージ待機
    await browser.waitFor(5000);

    const snapshot = await browser.snapshot();

    // 接続パネルがまだ表示されている（接続失敗）
    expect(browser.hasText(snapshot, "Connect to Bridge Server")).toBe(true);
  });
});
