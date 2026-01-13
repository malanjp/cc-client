import { z } from "zod";

// Claude Code stream-json message types
export const MessageTypeSchema = z.enum([
  "assistant",
  "user",
  "system",
  "result",
]);

export const ToolUseSchema = z.object({
  id: z.string(),
  name: z.string(),
  input: z.record(z.unknown()),
});

export const ContentBlockSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("text"),
    text: z.string(),
  }),
  z.object({
    type: z.literal("tool_use"),
    id: z.string(),
    name: z.string(),
    input: z.record(z.unknown()),
  }),
  z.object({
    type: z.literal("tool_result"),
    tool_use_id: z.string(),
    content: z.string().optional(),
    is_error: z.boolean().optional(),
  }),
]);

export const ClaudeMessageSchema = z.object({
  type: z.string(),
  timestamp: z.string().optional(),
  message: z.object({
    role: MessageTypeSchema.optional(),
    content: z.union([z.string(), z.array(ContentBlockSchema)]).optional(),
  }).optional(),
  tool_use: ToolUseSchema.optional(),
  result: z.union([
    z.string(),
    z.object({
      success: z.boolean().optional(),
      error: z.string().optional(),
    }),
  ]).optional(),
  permission_request: z.object({
    id: z.string(),
    tool: z.string(),
    description: z.string().optional(),
  }).optional(),
  thinking: z.string().optional(),
});

export type ClaudeMessage = z.infer<typeof ClaudeMessageSchema>;
export type ContentBlock = z.infer<typeof ContentBlockSchema>;
export type ToolUse = z.infer<typeof ToolUseSchema>;

export type ParseResult =
  | { success: true; data: ClaudeMessage }
  | { success: false; error: string };

/**
 * content 配列内の tool_use から許可されたフィールドのみを抽出
 */
function sanitizeContent(content: unknown): unknown {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return content;

  return content.map((block) => {
    if (typeof block !== "object" || block === null) return block;
    const b = block as Record<string, unknown>;

    if (b.type === "tool_use") {
      return {
        type: "tool_use",
        id: b.id,
        name: b.name,
        input: b.input,
      };
    }
    if (b.type === "tool_result") {
      return {
        type: "tool_result",
        tool_use_id: b.tool_use_id,
        content: b.content,
        is_error: b.is_error,
      };
    }
    return block;
  });
}

/**
 * パース済みオブジェクトから許可されたフィールドのみを抽出
 * Claude API が拒否する余分なフィールド（caller など）を除去
 */
function extractAllowedFields(
  parsed: Record<string, unknown>
): ClaudeMessage {
  const result: Record<string, unknown> = {
    type: parsed.type,
  };

  if (parsed.timestamp) result.timestamp = parsed.timestamp;
  if (parsed.thinking) result.thinking = parsed.thinking;
  if (parsed.result) result.result = parsed.result;

  if (parsed.message && typeof parsed.message === "object") {
    const msg = parsed.message as Record<string, unknown>;
    const sanitizedMsg: Record<string, unknown> = {};
    if (msg.role) sanitizedMsg.role = msg.role;
    if (msg.content !== undefined) {
      sanitizedMsg.content = sanitizeContent(msg.content);
    }
    result.message = sanitizedMsg;
  }

  if (parsed.tool_use && typeof parsed.tool_use === "object") {
    const toolUse = parsed.tool_use as Record<string, unknown>;
    result.tool_use = {
      id: toolUse.id,
      name: toolUse.name,
      input: toolUse.input,
    };
  }

  if (
    parsed.permission_request &&
    typeof parsed.permission_request === "object"
  ) {
    const pr = parsed.permission_request as Record<string, unknown>;
    result.permission_request = {
      id: pr.id,
      tool: pr.tool,
      description: pr.description,
    };
  }

  return result as ClaudeMessage;
}

export function parseStreamJson(line: string): ClaudeMessage | null {
  // 非JSON行をスキップ（スラッシュコマンドのプレーンテキスト応答など）
  if (!line.startsWith("{")) {
    return null;
  }

  try {
    const parsed = JSON.parse(line);
    const result = ClaudeMessageSchema.safeParse(parsed);

    if (result.success) {
      return result.data;
    }

    // Log validation warning but still return a usable message
    // This allows handling of messages with extra/missing fields
    console.warn("[Parser] Validation warning:", result.error.message);

    // Only return if we have at least a type field
    if (typeof parsed.type === "string") {
      return extractAllowedFields(parsed);
    }

    // Reject completely invalid messages
    console.error("[Parser] Invalid message structure:", line.substring(0, 100));
    return null;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[Parser] JSON parse error:", message);
    return null;
  }
}

export function formatMessage(message: ClaudeMessage): string {
  if (message.type === "assistant" && message.message?.content) {
    const content = message.message.content;
    if (typeof content === "string") {
      return content;
    }
    return content
      .filter((block): block is ContentBlock & { type: "text" } => block.type === "text")
      .map((block) => block.text)
      .join("\n");
  }

  if (message.type === "thinking" && message.thinking) {
    return `[Thinking] ${message.thinking}`;
  }

  if (message.type === "tool_use" && message.tool_use) {
    return `[Tool: ${message.tool_use.name}]`;
  }

  return JSON.stringify(message);
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
  addChunk(chunk: string): ClaudeMessage[] {
    this.buffer += chunk;
    const messages: ClaudeMessage[] = [];

    let newlineIndex: number;
    while ((newlineIndex = this.buffer.indexOf('\n')) !== -1) {
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
