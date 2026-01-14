// Re-export shared types for backward compatibility
export {
  CliMessageSchema as ClaudeMessageSchema,
  CliMessageTypeSchema as MessageTypeSchema,
  ContentBlockSchema,
  ToolUseInfoSchema as ToolUseSchema,
  type CliMessage as ClaudeMessage,
  type ContentBlock,
  type ToolUseInfo as ToolUse,
  type ParseResult,
  extractTextContent,
} from "@cc-client/shared";

import {
  CliMessageSchema,
  CliMessageTypeSchema,
  type CliMessage,
  type CliMessageType,
} from "@cc-client/shared";

/** 既知のメッセージタイプかどうかを判定 */
function isKnownMessageType(type: string): type is CliMessageType {
  return CliMessageTypeSchema.safeParse(type).success;
}

/**
 * stream-json 形式の行をパースする
 * 非JSON行は raw_text タイプとして返す
 */
export function parseStreamJson(line: string): CliMessage | null {
  // 非JSON行は raw_text タイプとして返す
  if (!line.startsWith("{")) {
    return { type: "raw_text", text: line };
  }

  try {
    const parsed: unknown = JSON.parse(line);

    // まず正規のスキーマでパース
    const result = CliMessageSchema.safeParse(parsed);
    if (result.success) {
      return result.data;
    }

    // バリデーション失敗時は安全に処理
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "type" in parsed &&
      typeof parsed.type === "string"
    ) {
      const messageType = parsed.type;

      // 既知のタイプだがスキーマに合わない場合は警告してraw_textとして返す
      if (isKnownMessageType(messageType)) {
        console.warn(
          `[Parser] Known type "${messageType}" failed validation:`,
          result.error.message
        );
        // 既知タイプの不完全なメッセージは raw_text として安全に返す
        return { type: "raw_text", text: line };
      }

      // 未知のタイプは raw_text として返す
      console.warn(`[Parser] Unknown message type: ${messageType}`);
      return { type: "raw_text", text: line };
    }

    // type フィールドがない場合は無効
    console.error(
      "[Parser] Invalid message structure (no type field):",
      line.substring(0, 100)
    );
    return null;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[Parser] JSON parse error:", message);
    return null;
  }
}

/**
 * メッセージをフォーマットして表示用文字列に変換
 */
export function formatMessage(message: CliMessage): string {
  switch (message.type) {
    case "assistant":
      if (typeof message.message.content === "string") {
        return message.message.content;
      }
      return message.message.content
        .filter(
          (block): block is { type: "text"; text: string } =>
            block.type === "text"
        )
        .map((block) => block.text)
        .join("\n");

    case "thinking":
      return `[Thinking] ${message.thinking}`;

    case "tool_use":
      return `[Tool: ${message.tool_use.name}]`;

    case "raw_text":
      return message.text;

    case "permission_request":
      return `[Permission] ${message.permission_request.tool}: ${message.permission_request.description ?? ""}`;

    case "user":
      if (typeof message.message.content === "string") {
        return message.message.content;
      }
      return message.message.content
        .filter(
          (block): block is { type: "text"; text: string } =>
            block.type === "text"
        )
        .map((block) => block.text)
        .join("\n");

    case "system":
      return message.message?.content ?? "[System]";

    case "result":
      if (typeof message.result === "string") {
        return message.result;
      }
      return JSON.stringify(message.result);
  }
}

/**
 * 部分的なJSONチャンクをバッファリングして完全な行に変換するパーサー
 */
export class PartialJsonParser {
  private buffer = "";

  /**
   * チャンクを追加し、完成した行があればパースして返す
   * @param chunk 受信したテキストチャンク
   * @returns パースされたメッセージの配列
   */
  addChunk(chunk: string): CliMessage[] {
    this.buffer += chunk;
    const messages: CliMessage[] = [];

    let newlineIndex: number;
    while ((newlineIndex = this.buffer.indexOf("\n")) !== -1) {
      const line = this.buffer.substring(0, newlineIndex);
      this.buffer = this.buffer.substring(newlineIndex + 1);

      if (line.trim()) {
        const msg = parseStreamJson(line);
        if (msg) {
          messages.push(msg);
        }
      }
    }

    return messages;
  }

  /**
   * バッファをクリア
   */
  clear(): void {
    this.buffer = "";
  }
}
