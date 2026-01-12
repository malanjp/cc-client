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
  result: z.object({
    success: z.boolean().optional(),
    error: z.string().optional(),
  }).optional(),
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

export function parseStreamJson(line: string): ClaudeMessage | null {
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
      return { type: parsed.type, ...parsed } as ClaudeMessage;
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
