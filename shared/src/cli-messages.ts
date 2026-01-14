import { z } from "zod";
import { MessageContentSchema } from "./content-blocks";

/**
 * Claude CLI stream-json メッセージタイプの網羅的定義
 */
export const CliMessageTypeSchema = z.enum([
  "assistant",
  "user",
  "system",
  "result",
  "thinking",
  "tool_use",
  "permission_request",
  "raw_text",
]);
export type CliMessageType = z.infer<typeof CliMessageTypeSchema>;

/**
 * 共通フィールド（すべてのメッセージに含まれる可能性がある）
 */
const BaseMessageSchema = z.object({
  timestamp: z.string().optional(),
  uuid: z.string().optional(),
});

// ============================================
// 1. Assistant Message
// ============================================
export const AssistantMessageSchema = BaseMessageSchema.extend({
  type: z.literal("assistant"),
  message: z.object({
    role: z.literal("assistant"),
    content: MessageContentSchema,
  }),
});
export type AssistantMessage = z.infer<typeof AssistantMessageSchema>;

// ============================================
// 2. User Message
// ============================================
export const UserMessageSchema = BaseMessageSchema.extend({
  type: z.literal("user"),
  message: z.object({
    role: z.literal("user"),
    content: MessageContentSchema,
  }),
});
export type UserMessage = z.infer<typeof UserMessageSchema>;

// ============================================
// 3. System Message
// ============================================
/**
 * system メッセージのサブタイプ
 * - init: セッション初期化時（session_id を含む）
 * - error: エラー通知
 * - info: 情報通知
 */
export const SystemSubtypeSchema = z.enum(["init", "error", "info"]);
export type SystemSubtype = z.infer<typeof SystemSubtypeSchema>;

export const SystemMessageSchema = BaseMessageSchema.extend({
  type: z.literal("system"),
  subtype: SystemSubtypeSchema.optional(),
  session_id: z.string().optional(),
  cwd: z.string().optional(),
  model: z.string().optional(),
  message: z
    .object({
      content: z.string().optional(),
    })
    .optional(),
});
export type SystemMessage = z.infer<typeof SystemMessageSchema>;

// ============================================
// 4. Result Message
// ============================================
/**
 * result フィールドの構造
 * - 文字列: 単純な結果
 * - オブジェクト: 成功/失敗フラグとエラーメッセージ
 */
export const ResultValueSchema = z.union([
  z.string(),
  z.object({
    success: z.boolean().optional(),
    error: z.string().optional(),
    duration_ms: z.number().optional(),
    duration_api_ms: z.number().optional(),
    num_turns: z.number().optional(),
  }),
]);
export type ResultValue = z.infer<typeof ResultValueSchema>;

export const ResultMessageSchema = BaseMessageSchema.extend({
  type: z.literal("result"),
  result: ResultValueSchema.optional(),
  subtype: z.string().optional(),
});
export type ResultMessage = z.infer<typeof ResultMessageSchema>;

// ============================================
// 5. Thinking Message
// ============================================
export const ThinkingMessageSchema = BaseMessageSchema.extend({
  type: z.literal("thinking"),
  thinking: z.string(),
});
export type ThinkingMessage = z.infer<typeof ThinkingMessageSchema>;

// ============================================
// 6. Tool Use Message
// ============================================
/**
 * ツール使用情報
 */
export const ToolUseInfoSchema = z.object({
  id: z.string(),
  name: z.string(),
  input: z.record(z.unknown()),
});
export type ToolUseInfo = z.infer<typeof ToolUseInfoSchema>;

export const ToolUseMessageSchema = BaseMessageSchema.extend({
  type: z.literal("tool_use"),
  tool_use: ToolUseInfoSchema,
});
export type ToolUseMessage = z.infer<typeof ToolUseMessageSchema>;

// ============================================
// 7. Permission Request Message
// ============================================
/**
 * 権限リクエスト情報
 */
export const PermissionRequestInfoSchema = z.object({
  id: z.string(),
  tool: z.string(),
  description: z.string().optional(),
  command: z.string().optional(),
  arguments: z.array(z.string()).optional(),
});
export type PermissionRequestInfo = z.infer<typeof PermissionRequestInfoSchema>;

export const PermissionRequestMessageSchema = BaseMessageSchema.extend({
  type: z.literal("permission_request"),
  permission_request: PermissionRequestInfoSchema,
});
export type PermissionRequestMessage = z.infer<
  typeof PermissionRequestMessageSchema
>;

// ============================================
// 8. Raw Text Message (内部生成)
// ============================================
/**
 * 非 JSON 出力用（CLI が JSON 以外のテキストを出力した場合）
 */
export const RawTextMessageSchema = z.object({
  type: z.literal("raw_text"),
  text: z.string(),
});
export type RawTextMessage = z.infer<typeof RawTextMessageSchema>;

// ============================================
// CLI Message Union
// ============================================
/**
 * Claude CLI から出力されるすべてのメッセージタイプの Union
 */
export const CliMessageSchema = z.discriminatedUnion("type", [
  AssistantMessageSchema,
  UserMessageSchema,
  SystemMessageSchema,
  ResultMessageSchema,
  ThinkingMessageSchema,
  ToolUseMessageSchema,
  PermissionRequestMessageSchema,
  RawTextMessageSchema,
]);
export type CliMessage = z.infer<typeof CliMessageSchema>;

// ============================================
// Helper Types
// ============================================

/**
 * パース結果の型
 */
export type ParseResult =
  | { success: true; data: CliMessage }
  | { success: false; error: string };

/**
 * メッセージタイプごとの型マップ
 */
export type CliMessageMap = {
  assistant: AssistantMessage;
  user: UserMessage;
  system: SystemMessage;
  result: ResultMessage;
  thinking: ThinkingMessage;
  tool_use: ToolUseMessage;
  permission_request: PermissionRequestMessage;
  raw_text: RawTextMessage;
};
