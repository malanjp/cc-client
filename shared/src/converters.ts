import type { ContentBlock, MessageContent, TextBlock } from "./content-blocks";
import type { CliMessage } from "./cli-messages";
import type { UiMessage } from "./ui-messages";

/**
 * UUID を生成（crypto.randomUUID が利用可能な場合はそれを使用）
 */
function generateId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

/**
 * タイムスタンプ文字列を数値に変換
 */
function parseTimestamp(timestamp?: string): number {
  if (!timestamp) return Date.now();
  const parsed = new Date(timestamp).getTime();
  return Number.isNaN(parsed) ? Date.now() : parsed;
}

/**
 * MessageContent からテキストを抽出
 */
export function extractTextContent(content: MessageContent): string {
  if (typeof content === "string") {
    return content;
  }
  return content
    .filter((block): block is TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("\n");
}

/**
 * MessageContent から tool_use ブロックを抽出
 */
export function extractToolUseBlocks(
  content: MessageContent
): Array<ContentBlock & { type: "tool_use" }> {
  if (typeof content === "string") {
    return [];
  }
  return content.filter(
    (block): block is ContentBlock & { type: "tool_use" } =>
      block.type === "tool_use"
  );
}

/**
 * MessageContent から tool_result ブロックを抽出
 */
export function extractToolResultBlocks(
  content: MessageContent
): Array<ContentBlock & { type: "tool_result" }> {
  if (typeof content === "string") {
    return [];
  }
  return content.filter(
    (block): block is ContentBlock & { type: "tool_result" } =>
      block.type === "tool_result"
  );
}

/**
 * CLI メッセージを UI メッセージに変換
 * 変換できない場合は null を返す
 */
export function cliToUiMessage(cli: CliMessage): UiMessage | null {
  // raw_text は uuid/timestamp を持たない
  if (cli.type === "raw_text") {
    return null;
  }

  const id = cli.uuid || generateId();
  const timestamp = parseTimestamp(cli.timestamp);

  switch (cli.type) {
    case "assistant":
      return {
        id,
        type: "assistant",
        content: extractTextContent(cli.message.content),
        timestamp,
      };

    case "user":
      return {
        id,
        type: "user",
        content: extractTextContent(cli.message.content),
        timestamp,
      };

    case "system":
      // subtype: "init" は UI に表示しない
      if (cli.subtype === "init") {
        return null;
      }
      return {
        id,
        type: "system",
        content: cli.message?.content || "",
        timestamp,
      };

    case "thinking":
      return {
        id,
        type: "thinking",
        content: cli.thinking,
        timestamp,
      };

    case "tool_use":
      return {
        id,
        type: "tool_use",
        content: `Tool: ${cli.tool_use.name}`,
        timestamp,
        toolName: cli.tool_use.name,
        toolInput: cli.tool_use.input,
      };

    case "permission_request":
      return {
        id,
        type: "permission_request",
        content:
          cli.permission_request.description ||
          `${cli.permission_request.tool} の実行許可を求めています`,
        timestamp,
        permissionRequest: {
          id: cli.permission_request.id,
          tool: cli.permission_request.tool,
          description: cli.permission_request.description,
        },
      };

    case "result":
      // UI に表示しない
      return null;
  }
}

/**
 * CLI メッセージ配列を UI メッセージ配列に変換
 * 変換できないメッセージはスキップ
 */
export function cliToUiMessages(cliMessages: CliMessage[]): UiMessage[] {
  return cliMessages
    .map(cliToUiMessage)
    .filter((msg): msg is UiMessage => msg !== null);
}

/**
 * assistant メッセージの content から tool_use メッセージを抽出
 */
export function extractToolUseMessagesFromAssistant(
  cli: CliMessage & { type: "assistant" }
): UiMessage[] {
  const toolUseBlocks = extractToolUseBlocks(cli.message.content);
  const timestamp = parseTimestamp(cli.timestamp);

  return toolUseBlocks.map((block) => ({
    id: block.id,
    type: "tool_use" as const,
    content: `Tool: ${block.name}`,
    timestamp,
    toolName: block.name,
    toolInput: block.input,
  }));
}

/**
 * user メッセージの content から tool_result メッセージを抽出
 * ID は tool_use_id から決定的に生成（冪等性を保証）
 */
export function extractToolResultMessagesFromUser(
  cli: CliMessage & { type: "user" }
): UiMessage[] {
  const toolResultBlocks = extractToolResultBlocks(cli.message.content);
  const timestamp = parseTimestamp(cli.timestamp);

  return toolResultBlocks.map((block) => ({
    // 決定的な ID を生成（tool_use_id から派生）
    id: `tool_result:${block.tool_use_id}`,
    type: "tool_result" as const,
    content: block.content || "",
    timestamp,
    toolResult: {
      toolUseId: block.tool_use_id,
      isError: block.is_error,
    },
  }));
}
