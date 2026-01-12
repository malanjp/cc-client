# アーキテクチャ設計

Claude Code Mobile Client のシステムアーキテクチャを説明するドキュメント。

## システム構成図

```
┌─────────────────────────────────────────────────────────────────┐
│                        Tailscale VPN                             │
└─────────────────────────────────────────────────────────────────┘
         │                                              │
         ▼                                              ▼
┌─────────────────┐                          ┌─────────────────┐
│   Android PWA   │◄──── WebSocket ─────────►│  Bridge Server  │
│                 │                          │   (Bun + Hono)  │
│  ┌───────────┐  │                          │  ┌───────────┐  │
│  │  Zustand  │  │                          │  │  Session  │  │
│  │   Store   │  │                          │  │  Manager  │  │
│  └───────────┘  │                          │  └───────────┘  │
│  ┌───────────┐  │                          │       │         │
│  │useWebSocket│  │                          │       ▼         │
│  └───────────┘  │                          │  ┌───────────┐  │
│  ┌───────────┐  │                          │  │  Claude   │  │
│  │   React   │  │                          │  │  Session  │  │
│  │Components │  │                          │  └───────────┘  │
│  └───────────┘  │                          │       │         │
└─────────────────┘                          └───────│─────────┘
                                                     │
                                                     ▼ stream-json
                                            ┌─────────────────┐
                                            │    Claude CLI   │
                                            └─────────────────┘
```

---

## コンポーネント詳細

### PWA（フロントエンド）

| コンポーネント | 役割 | ファイル |
|---------------|------|----------|
| Zustand Store | グローバル状態管理（接続、セッション、メッセージ） | `pwa/app/store/sessionStore.ts` |
| useWebSocket | WebSocket 接続管理（シングルトン） | `pwa/app/hooks/useWebSocket.ts` |
| ConnectionPanel | サーバー接続 UI | `pwa/app/components/ConnectionPanel.tsx` |
| MessageStream | メッセージ一覧表示 | `pwa/app/components/MessageStream.tsx` |
| MessageBubble | 個別メッセージ表示 | `pwa/app/components/MessageBubble.tsx` |
| InputArea | テキスト入力フォーム | `pwa/app/components/InputArea.tsx` |

**技術スタック:**
- React Router v7（SSR 対応）
- Vite 7
- Tailwind CSS v4
- Zustand 5

### Bridge Server（バックエンド）

| コンポーネント | 役割 | ファイル |
|---------------|------|----------|
| SessionManager | 複数セッションのライフサイクル管理 | `server/src/services/session.ts` |
| ClaudeSession | Claude CLI プロセスの spawn/通信 | `server/src/services/session.ts` |
| WebSocket Handler | WebSocket メッセージ処理 | `server/src/routes/ws.ts` |
| REST API | セッション管理 REST エンドポイント | `server/src/routes/api.ts` |
| Stream Parser | stream-json パーサー（Zod スキーマ） | `server/src/utils/stream.ts` |

**技術スタック:**
- Bun（ランタイム）
- Hono（Web フレームワーク）
- Zod（バリデーション）

### Claude CLI

Claude Code CLI を `--output-format stream-json --input-format stream-json --verbose` オプションで起動し、stdin/stdout で双方向通信を行う。

---

## データフロー

### メッセージ送信フロー

```
1. ユーザー入力
   PWA InputArea → sendMessage()

2. WebSocket 送信
   useWebSocket → { type: "send_message", message: "..." }

3. Bridge Server 処理
   ws.ts → ClaudeSession.sendInput()

4. Claude CLI への入力
   stdin → { type: "user", message: { role: "user", content: "..." } }

5. Claude CLI からの出力
   stdout → { type: "assistant", message: { role: "assistant", content: "..." } }

6. Bridge Server から PWA へ
   ws.send() → { type: "claude_message", message_type: "assistant", ... }

7. PWA での表示
   sessionStore.addMessage() → MessageStream → MessageBubble
```

### 権限リクエストフロー

```
1. Claude CLI が権限を要求
   stdout → { type: "permission_request", permission_request: { id, tool, description } }

2. Bridge Server から PWA へ
   ws.send() → { type: "claude_message", message_type: "permission_request", ... }

3. ユーザーが承認/拒否
   PWA → { type: "approve" } または { type: "reject" }

4. Bridge Server から Claude CLI へ
   stdin → { type: "approval", approved: true/false }
```

---

## ディレクトリ構成

```
cc-client/
├── server/                          # Bridge Server
│   ├── src/
│   │   ├── index.ts                 # エントリポイント
│   │   ├── routes/
│   │   │   ├── api.ts               # REST API
│   │   │   └── ws.ts                # WebSocket ハンドラ
│   │   ├── services/
│   │   │   └── session.ts           # セッション管理
│   │   └── utils/
│   │       └── stream.ts            # stream-json パーサー
│   └── package.json
│
├── pwa/                             # PWA フロントエンド
│   ├── app/
│   │   ├── root.tsx                 # ルートコンポーネント
│   │   ├── routes/
│   │   │   └── home.tsx             # ホームページ
│   │   ├── components/              # UI コンポーネント
│   │   ├── hooks/                   # カスタムフック
│   │   ├── store/                   # Zustand ストア
│   │   └── lib/                     # ユーティリティ
│   └── package.json
│
├── e2e/                             # E2E テスト
│   ├── specs/                       # テストスペック
│   └── package.json
│
├── docs/                            # ドキュメント
│   ├── requirements.md
│   ├── architecture.md
│   ├── api-specification.md
│   └── roadmap.md
│
├── README.md                        # プロジェクト概要
└── CLAUDE.md                        # 開発ガイド
```

---

## セキュリティ設計

### アクセス制御

1. **Tailscale VPN**: ネットワークレベルでアクセスを制限
2. **パストラバーサル対策**: `isValidWorkDir()` で許可ディレクトリをチェック
3. **許可ディレクトリ**: ホームディレクトリと `/tmp` のみ

### 許可ディレクトリの検証ロジック

```typescript
const ALLOWED_BASE_PATHS = [os.homedir(), '/tmp'];

function isValidWorkDir(workDir: string): boolean {
  const resolved = path.resolve(workDir);
  return ALLOWED_BASE_PATHS.some(base => resolved.startsWith(base));
}
```
