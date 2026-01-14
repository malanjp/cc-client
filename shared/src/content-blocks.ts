import { z } from "zod";

/**
 * テキストコンテンツブロック
 * Claude の応答テキストを含む
 */
export const TextBlockSchema = z.object({
  type: z.literal("text"),
  text: z.string(),
});
export type TextBlock = z.infer<typeof TextBlockSchema>;

/**
 * 思考コンテンツブロック（Extended Thinking 機能）
 * Claude の内部思考プロセスを含む
 * signature: Extended Thinking API で返される署名フィールド
 */
export const ThinkingBlockSchema = z.object({
  type: z.literal("thinking"),
  thinking: z.string(),
  signature: z.string().optional(),
});
export type ThinkingBlock = z.infer<typeof ThinkingBlockSchema>;

/**
 * ツール使用コンテンツブロック
 * Claude がツールを呼び出す際の情報を含む
 */
export const ToolUseBlockSchema = z.object({
  type: z.literal("tool_use"),
  id: z.string(),
  name: z.string(),
  input: z.record(z.unknown()),
});
export type ToolUseBlock = z.infer<typeof ToolUseBlockSchema>;

/**
 * ツール結果コンテンツブロック
 * ツール実行結果を含む（user メッセージの content 内で使用）
 */
export const ToolResultBlockSchema = z.object({
  type: z.literal("tool_result"),
  tool_use_id: z.string(),
  content: z.string().optional(),
  is_error: z.boolean().optional(),
});
export type ToolResultBlock = z.infer<typeof ToolResultBlockSchema>;

/**
 * すべてのコンテンツブロック型の Union
 */
export const ContentBlockSchema = z.discriminatedUnion("type", [
  TextBlockSchema,
  ThinkingBlockSchema,
  ToolUseBlockSchema,
  ToolResultBlockSchema,
]);
export type ContentBlock = z.infer<typeof ContentBlockSchema>;

/**
 * メッセージコンテンツ（文字列または ContentBlock 配列）
 */
export const MessageContentSchema = z.union([
  z.string(),
  z.array(ContentBlockSchema),
]);
export type MessageContent = z.infer<typeof MessageContentSchema>;
