import type { AgentBrowser, Snapshot } from "./agent-commands.js";

const PWA_URL = "http://localhost:5173";
const BRIDGE_URL = "http://localhost:8080";

/**
 * ブラウザを接続してセッションを作成する
 * すでに接続されている場合はスキップ
 */
export async function connectAndCreateSession(browser: AgentBrowser): Promise<void> {
  const snapshot = await browser.snapshot();

  // すでに接続されている場合はスキップ
  if (browser.hasText(snapshot, "接続中")) {
    return;
  }

  // 接続パネルが表示されている場合のみ接続
  if (browser.hasText(snapshot, "Bridge Server に接続")) {
    await browser.fillByRole("textbox", BRIDGE_URL);
    await browser.clickByRole("button", "接続");
    await browser.waitFor(4000);
  }
}

/**
 * Claude の応答を待機する
 */
export async function waitForClaudeResponse(
  browser: AgentBrowser,
  timeout = 5000
): Promise<Snapshot> {
  await browser.waitFor(timeout);
  return browser.snapshot();
}

/**
 * メッセージを送信して応答を待機する
 */
export async function sendMessageAndWait(
  browser: AgentBrowser,
  message: string,
  timeout = 3000
): Promise<Snapshot> {
  await browser.fillByPlaceholder("Message Claude...", message);
  await browser.press("Enter");
  return waitForClaudeResponse(browser, timeout);
}

/**
 * 指定されたテキストが表示されるまで待機する
 */
export async function waitForText(
  browser: AgentBrowser,
  text: string,
  maxAttempts = 10,
  interval = 500
): Promise<boolean> {
  for (let i = 0; i < maxAttempts; i++) {
    const snapshot = await browser.snapshot();
    if (browser.hasText(snapshot, text)) {
      return true;
    }
    await browser.waitFor(interval);
  }
  return false;
}

/**
 * ページを初期状態にリセットする
 */
export async function resetPage(browser: AgentBrowser): Promise<void> {
  await browser.goto(PWA_URL);
  await browser.waitFor(1000);
}

/**
 * メッセージ入力欄が有効になるまで待機
 */
export async function waitForInputReady(
  browser: AgentBrowser,
  maxAttempts = 10
): Promise<boolean> {
  for (let i = 0; i < maxAttempts; i++) {
    const snapshot = await browser.snapshot();
    if (browser.hasText(snapshot, "Message Claude...")) {
      return true;
    }
    await browser.waitFor(500);
  }
  return false;
}
