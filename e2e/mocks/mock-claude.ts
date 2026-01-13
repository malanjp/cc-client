#!/usr/bin/env bun
/**
 * Mock Claude CLI for E2E testing
 *
 * stdin から stream-json 形式でメッセージを受信し、
 * シナリオに基づいて stdout に応答を出力する。
 *
 * 環境変数:
 * - MOCK_SCENARIO: シナリオ名（デフォルト: basic-chat）
 * - MOCK_RESPONSE_DELAY: 応答遅延ミリ秒（デフォルト: 100）
 */

import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// シナリオ型定義
interface MockResponse {
  type: string;
  delay?: number;
  data: Record<string, unknown>;
}

interface ScenarioMessage {
  inputPattern: string;
  responses: MockResponse[];
}

interface ApprovalHandler {
  onApprove: MockResponse[];
  onReject: MockResponse[];
}

interface Scenario {
  name: string;
  messages: ScenarioMessage[];
  approvalHandler?: ApprovalHandler;
  defaultResponses?: MockResponse[];
}

// シナリオ読み込み
function loadScenario(name: string): Scenario {
  const scenarioPath = join(__dirname, "scenarios", `${name}.json`);

  if (!existsSync(scenarioPath)) {
    console.error(`[MockClaude] Scenario not found: ${scenarioPath}`);
    return {
      name: "fallback",
      messages: [],
      defaultResponses: [
        {
          type: "assistant",
          delay: 100,
          data: {
            type: "assistant",
            message: {
              role: "assistant",
              content: "Hello! I'm a mock Claude CLI.",
            },
          },
        },
        {
          type: "result",
          delay: 50,
          data: {
            type: "result",
            result: { success: true },
          },
        },
      ],
    };
  }

  try {
    const content = readFileSync(scenarioPath, "utf-8");
    return JSON.parse(content) as Scenario;
  } catch (error) {
    console.error(`[MockClaude] Failed to load scenario: ${error}`);
    process.exit(1);
  }
}

// 応答を出力
async function sendResponse(response: MockResponse): Promise<void> {
  const delay = response.delay ?? Number(process.env.MOCK_RESPONSE_DELAY) ?? 100;
  await new Promise((resolve) => setTimeout(resolve, delay));
  console.log(JSON.stringify(response.data));
}

// 応答シーケンスを送信
async function sendResponses(responses: MockResponse[]): Promise<void> {
  for (const response of responses) {
    await sendResponse(response);
  }
}

// メッセージにマッチする応答を検索
function findMatchingResponses(
  scenario: Scenario,
  message: string
): MockResponse[] | null {
  for (const scenarioMsg of scenario.messages) {
    const pattern = new RegExp(scenarioMsg.inputPattern, "i");
    if (pattern.test(message)) {
      return scenarioMsg.responses;
    }
  }
  return scenario.defaultResponses ?? null;
}

// メイン処理
async function main(): Promise<void> {
  const scenarioName = process.env.MOCK_SCENARIO ?? "basic-chat";
  const scenario = loadScenario(scenarioName);

  console.error(`[MockClaude] Loaded scenario: ${scenario.name}`);

  // 権限リクエストを待機中かどうか
  let waitingForApproval = false;
  let pendingApprovalHandler: ApprovalHandler | null = null;

  // stdin を行ごとに読み込む
  const decoder = new TextDecoder();
  const stdin = Bun.stdin.stream();
  const reader = stdin.getReader();

  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      let newlineIndex: number;
      while ((newlineIndex = buffer.indexOf("\n")) !== -1) {
        const line = buffer.substring(0, newlineIndex).trim();
        buffer = buffer.substring(newlineIndex + 1);

        if (!line) continue;

        try {
          const input = JSON.parse(line) as Record<string, unknown>;
          console.error(`[MockClaude] Received: ${JSON.stringify(input)}`);

          // 入力タイプに応じて処理
          if (input.type === "user") {
            const message = input.message as { role: string; content: string };
            const content = message?.content ?? "";

            const responses = findMatchingResponses(scenario, content);
            if (responses) {
              // 権限リクエストがあるか確認
              const permissionResponse = responses.find(
                (r) => r.type === "permission_request"
              );
              if (permissionResponse && scenario.approvalHandler) {
                waitingForApproval = true;
                pendingApprovalHandler = scenario.approvalHandler;
              }
              await sendResponses(responses);
            } else {
              // デフォルト応答
              await sendResponses([
                {
                  type: "assistant",
                  data: {
                    type: "assistant",
                    message: {
                      role: "assistant",
                      content: `I received: "${content}"`,
                    },
                  },
                },
                {
                  type: "result",
                  data: {
                    type: "result",
                    result: { success: true },
                  },
                },
              ]);
            }
          } else if (input.type === "approval") {
            if (waitingForApproval && pendingApprovalHandler) {
              const approved = input.approved as boolean;
              const responses = approved
                ? pendingApprovalHandler.onApprove
                : pendingApprovalHandler.onReject;
              await sendResponses(responses);
              waitingForApproval = false;
              pendingApprovalHandler = null;
            }
          } else if (input.type === "abort") {
            console.error("[MockClaude] Abort received");
            // 現在の応答を中断
            await sendResponses([
              {
                type: "result",
                data: {
                  type: "result",
                  result: { success: false, error: "Aborted by user" },
                },
              },
            ]);
          }
        } catch (error) {
          console.error(`[MockClaude] Parse error: ${error}`);
        }
      }
    }
  } catch (error) {
    console.error(`[MockClaude] Error: ${error}`);
  }

  console.error("[MockClaude] Exiting");
}

main().catch(console.error);
