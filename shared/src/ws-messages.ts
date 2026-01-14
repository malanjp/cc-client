import { z } from "zod";
import { CliMessageSchema, CliMessageTypeSchema } from "./cli-messages";

// ============================================
// Client → Server Messages (Requests)
// ============================================

/**
 * セッション作成リクエスト
 */
export const WsCreateSessionSchema = z.object({
  type: z.literal("create_session"),
  workDir: z.string().optional(),
});
export type WsCreateSession = z.infer<typeof WsCreateSessionSchema>;

/**
 * メッセージ送信リクエスト
 */
export const WsSendMessageSchema = z.object({
  type: z.literal("send_message"),
  message: z.string(),
});
export type WsSendMessage = z.infer<typeof WsSendMessageSchema>;

/**
 * 権限承認リクエスト
 */
export const WsApproveSchema = z.object({
  type: z.literal("approve"),
});
export type WsApprove = z.infer<typeof WsApproveSchema>;

/**
 * 権限拒否リクエスト
 */
export const WsRejectSchema = z.object({
  type: z.literal("reject"),
});
export type WsReject = z.infer<typeof WsRejectSchema>;

/**
 * ツール使用応答リクエスト
 */
export const WsRespondToToolUseSchema = z.object({
  type: z.literal("respond_to_tool_use"),
  toolUseId: z.string(),
  content: z.string().optional(),
});
export type WsRespondToToolUse = z.infer<typeof WsRespondToToolUseSchema>;

/**
 * セッション中断リクエスト
 */
export const WsAbortSchema = z.object({
  type: z.literal("abort"),
});
export type WsAbort = z.infer<typeof WsAbortSchema>;

/**
 * セッション終了リクエスト
 */
export const WsEndSessionSchema = z.object({
  type: z.literal("end_session"),
});
export type WsEndSession = z.infer<typeof WsEndSessionSchema>;

/**
 * 既存セッションへの接続リクエスト
 */
export const WsAttachSessionSchema = z.object({
  type: z.literal("attach_session"),
  sessionId: z.string(),
});
export type WsAttachSession = z.infer<typeof WsAttachSessionSchema>;

/**
 * Claude CLI セッション再開リクエスト
 */
export const WsResumeClaudeSessionSchema = z.object({
  type: z.literal("resume_claude_session"),
  sessionId: z.string(),
  workDir: z.string(),
});
export type WsResumeClaudeSession = z.infer<typeof WsResumeClaudeSessionSchema>;

/**
 * Client → Server メッセージの Union
 */
export const WsClientMessageSchema = z.discriminatedUnion("type", [
  WsCreateSessionSchema,
  WsSendMessageSchema,
  WsApproveSchema,
  WsRejectSchema,
  WsRespondToToolUseSchema,
  WsAbortSchema,
  WsEndSessionSchema,
  WsAttachSessionSchema,
  WsResumeClaudeSessionSchema,
]);
export type WsClientMessage = z.infer<typeof WsClientMessageSchema>;

// ============================================
// Server → Client Messages (Responses)
// ============================================

/**
 * 接続完了通知
 */
export const WsConnectedSchema = z.object({
  type: z.literal("connected"),
  message: z.string(),
});
export type WsConnected = z.infer<typeof WsConnectedSchema>;

/**
 * セッション作成完了通知
 */
export const WsSessionCreatedSchema = z.object({
  type: z.literal("session_created"),
  sessionId: z.string(),
  workDir: z.string(),
});
export type WsSessionCreated = z.infer<typeof WsSessionCreatedSchema>;

/**
 * Claude CLI メッセージ通知
 * 元の CLI メッセージに type: "claude_message" と message_type を追加
 */
export const WsClaudeMessageSchema = CliMessageSchema.and(
  z.object({
    type: z.literal("claude_message"),
    message_type: CliMessageTypeSchema,
  })
);
export type WsClaudeMessage = z.infer<typeof WsClaudeMessageSchema>;

/**
 * エラー通知
 */
export const WsErrorSchema = z.object({
  type: z.literal("error"),
  error: z.string(),
});
export type WsError = z.infer<typeof WsErrorSchema>;

/**
 * セッション終了通知
 */
export const WsSessionEndedSchema = z.object({
  type: z.literal("session_ended"),
});
export type WsSessionEnded = z.infer<typeof WsSessionEndedSchema>;

/**
 * abort 後のセッション再開通知
 */
export const WsSessionResumedAfterAbortSchema = z.object({
  type: z.literal("session_resumed_after_abort"),
  sessionId: z.string(),
  claudeSessionId: z.string(),
});
export type WsSessionResumedAfterAbort = z.infer<
  typeof WsSessionResumedAfterAbortSchema
>;

/**
 * セッション接続完了通知
 */
export const WsSessionAttachedSchema = z.object({
  type: z.literal("session_attached"),
  sessionId: z.string(),
});
export type WsSessionAttached = z.infer<typeof WsSessionAttachedSchema>;

/**
 * Claude CLI セッション再開完了通知
 */
export const WsSessionResumedSchema = z.object({
  type: z.literal("session_resumed"),
  sessionId: z.string(),
  claudeSessionId: z.string(),
  workDir: z.string(),
});
export type WsSessionResumed = z.infer<typeof WsSessionResumedSchema>;

/**
 * Server → Client メッセージの Union
 * Note: WsClaudeMessage は and() を使用しているため discriminatedUnion に含められない
 */
export const WsServerMessageBaseSchema = z.discriminatedUnion("type", [
  WsConnectedSchema,
  WsSessionCreatedSchema,
  WsErrorSchema,
  WsSessionEndedSchema,
  WsSessionResumedAfterAbortSchema,
  WsSessionAttachedSchema,
  WsSessionResumedSchema,
]);
export type WsServerMessageBase = z.infer<typeof WsServerMessageBaseSchema>;

/**
 * Server → Client メッセージの完全な Union 型
 */
export type WsServerMessage = WsServerMessageBase | WsClaudeMessage;

// ============================================
// Helper Types
// ============================================

/**
 * Server → Client メッセージタイプの一覧
 */
export type WsServerMessageType =
  | "connected"
  | "session_created"
  | "claude_message"
  | "error"
  | "session_ended"
  | "session_resumed_after_abort"
  | "session_attached"
  | "session_resumed";

/**
 * Client → Server メッセージタイプの一覧
 */
export type WsClientMessageType =
  | "create_session"
  | "send_message"
  | "approve"
  | "reject"
  | "respond_to_tool_use"
  | "abort"
  | "end_session"
  | "attach_session"
  | "resume_claude_session";
