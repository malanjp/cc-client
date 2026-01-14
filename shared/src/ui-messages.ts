import { z } from "zod";

/**
 * UI 表示用メッセージタイプ
 * CLI メッセージタイプに加えて、PWA 専用のタイプを含む
 */
export const UiMessageTypeSchema = z.enum([
  "assistant",
  "user",
  "system",
  "tool_use",
  "tool_result",
  "thinking",
  "error",
  "permission_request",
  "tool_use_prompt",
]);
export type UiMessageType = z.infer<typeof UiMessageTypeSchema>;

/**
 * ツール使用プロンプトの選択肢
 */
export const ToolUsePromptOptionSchema = z.object({
  label: z.string(),
  value: z.string(),
  description: z.string().optional(),
});
export type ToolUsePromptOption = z.infer<typeof ToolUsePromptOptionSchema>;

/**
 * ツール使用プロンプト（AskUserQuestion, ExitPlanMode など）
 */
export const ToolUsePromptSchema = z.object({
  toolUseId: z.string(),
  toolName: z.string(),
  question: z.string(),
  options: z.array(ToolUsePromptOptionSchema),
});
export type ToolUsePrompt = z.infer<typeof ToolUsePromptSchema>;

/**
 * 共通フィールド
 */
const BaseUiMessageSchema = z.object({
  id: z.string(),
  content: z.string(),
  timestamp: z.number(),
});

/**
 * assistant メッセージ
 */
export const UiAssistantMessageSchema = BaseUiMessageSchema.extend({
  type: z.literal("assistant"),
});
export type UiAssistantMessage = z.infer<typeof UiAssistantMessageSchema>;

/**
 * user メッセージ
 */
export const UiUserMessageSchema = BaseUiMessageSchema.extend({
  type: z.literal("user"),
});
export type UiUserMessage = z.infer<typeof UiUserMessageSchema>;

/**
 * system メッセージ
 */
export const UiSystemMessageSchema = BaseUiMessageSchema.extend({
  type: z.literal("system"),
});
export type UiSystemMessage = z.infer<typeof UiSystemMessageSchema>;

/**
 * thinking メッセージ
 */
export const UiThinkingMessageSchema = BaseUiMessageSchema.extend({
  type: z.literal("thinking"),
});
export type UiThinkingMessage = z.infer<typeof UiThinkingMessageSchema>;

/**
 * error メッセージ
 */
export const UiErrorMessageSchema = BaseUiMessageSchema.extend({
  type: z.literal("error"),
});
export type UiErrorMessage = z.infer<typeof UiErrorMessageSchema>;

/**
 * tool_use メッセージ
 */
export const UiToolUseMessageSchema = BaseUiMessageSchema.extend({
  type: z.literal("tool_use"),
  toolName: z.string(),
  toolInput: z.record(z.unknown()),
});
export type UiToolUseMessage = z.infer<typeof UiToolUseMessageSchema>;

/**
 * tool_result メッセージ
 */
export const UiToolResultMessageSchema = BaseUiMessageSchema.extend({
  type: z.literal("tool_result"),
  toolResult: z.object({
    toolUseId: z.string(),
    isError: z.boolean().optional(),
  }),
});
export type UiToolResultMessage = z.infer<typeof UiToolResultMessageSchema>;

/**
 * permission_request メッセージ
 */
export const UiPermissionRequestMessageSchema = BaseUiMessageSchema.extend({
  type: z.literal("permission_request"),
  permissionRequest: z.object({
    id: z.string(),
    tool: z.string(),
    description: z.string().optional(),
  }),
});
export type UiPermissionRequestMessage = z.infer<
  typeof UiPermissionRequestMessageSchema
>;

/**
 * tool_use_prompt メッセージ（AskUserQuestion, ExitPlanMode など）
 */
export const UiToolUsePromptMessageSchema = BaseUiMessageSchema.extend({
  type: z.literal("tool_use_prompt"),
  toolUsePrompt: ToolUsePromptSchema,
});
export type UiToolUsePromptMessage = z.infer<
  typeof UiToolUsePromptMessageSchema
>;

/**
 * UI 表示用メッセージ（discriminatedUnion で型安全）
 */
export const UiMessageSchema = z.discriminatedUnion("type", [
  UiAssistantMessageSchema,
  UiUserMessageSchema,
  UiSystemMessageSchema,
  UiThinkingMessageSchema,
  UiErrorMessageSchema,
  UiToolUseMessageSchema,
  UiToolResultMessageSchema,
  UiPermissionRequestMessageSchema,
  UiToolUsePromptMessageSchema,
]);
export type UiMessage = z.infer<typeof UiMessageSchema>;

/**
 * PWA で管理するメッセージの型エイリアス
 * sessionStore.ts の ClaudeMessage を置き換える
 */
export type ClaudeMessage = UiMessage;
