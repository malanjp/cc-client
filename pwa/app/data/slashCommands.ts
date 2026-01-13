export interface SlashCommand {
  name: string;
  description: string;
  category: "session" | "context" | "diagnostic" | "config" | "other";
  /** local: PWA側で処理, cli: CLIに転送, unsupported: 未対応 */
  handler: "local" | "cli" | "unsupported";
}

export const BUILTIN_SLASH_COMMANDS: SlashCommand[] = [
  // セッション管理
  { name: "/clear", description: "会話履歴をクリア", category: "session", handler: "local" },
  { name: "/resume", description: "セッションを再開", category: "session", handler: "unsupported" },
  { name: "/rename", description: "セッション名を変更", category: "session", handler: "unsupported" },
  { name: "/rewind", description: "過去のメッセージに戻る", category: "session", handler: "unsupported" },

  // コンテキスト管理
  { name: "/compact", description: "コンテキストを圧縮", category: "context", handler: "unsupported" },
  { name: "/context", description: "コンテキスト使用量を表示", category: "context", handler: "unsupported" },
  { name: "/memory", description: "CLAUDE.mdを編集", category: "context", handler: "unsupported" },

  // 診断
  { name: "/status", description: "ステータスを表示", category: "diagnostic", handler: "local" },
  { name: "/doctor", description: "システム診断を実行", category: "diagnostic", handler: "unsupported" },
  { name: "/cost", description: "トークンコストを表示", category: "diagnostic", handler: "unsupported" },

  // 設定
  { name: "/model", description: "モデルを切り替え", category: "config", handler: "unsupported" },
  { name: "/config", description: "設定を開く", category: "config", handler: "unsupported" },
  { name: "/permissions", description: "権限を管理", category: "config", handler: "unsupported" },

  // その他
  { name: "/help", description: "コマンド一覧を表示", category: "other", handler: "local" },
  { name: "/review", description: "コードレビューを開始", category: "other", handler: "cli" },
];
