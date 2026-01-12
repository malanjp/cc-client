# Claude Code Mobile Client

MacにTailscale SSH経由で接続し、Claude Code CLIを操作するためのPWA（Progressive Web App）。

## アーキテクチャ

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Android Device                                │
│  ┌────────────────┐      ┌──────────────────────────────────────┐   │
│  │ Tailscale VPN  │      │       PWA (React Router v7)          │   │
│  │   100.x.x.x    │      │  ┌─────────────────────────────────┐ │   │
│  └───────┬────────┘      │  │    Claude Code Optimized UI     │ │   │
│          │               │  └───────────────┬─────────────────┘ │   │
│          │               │                  │ WebSocket + REST   │   │
└──────────┼──────────────────────────────────┼────────────────────────┘
           │ WireGuard Tunnel                 │
┌──────────┴──────────────────────────────────┼────────────────────────┐
│                   Mac (Tailscale)            │                        │
│                   100.x.x.y                  │                        │
│  ┌───────────────────────────────────────────┴────────────────────┐  │
│  │            Claude Code Bridge Server (Bun + Hono)              │  │
│  │  claude --output-format stream-json --input-format stream-json │  │
│  └────────────────────────────────────────────────────────────────┘  │
└───────────────────────────────────────────────────────────────────────┘
```

## セットアップ

### 前提条件

- Mac に [Bun](https://bun.sh) がインストールされていること
- Mac に [Claude Code CLI](https://claude.ai/code) がインストールされていること
- Android と Mac が同じ [Tailscale](https://tailscale.com) ネットワークに参加していること

### Bridge Server（Mac側）

```bash
cd server
bun install
bun run dev
```

サーバーは `http://localhost:8080` で起動します。

### PWA（開発時）

```bash
cd pwa
npm install
npm run dev
```

PWAは `http://localhost:5173` で起動します。

## 使い方

1. Mac で Bridge Server を起動
2. Android で Tailscale VPN を有効化
3. ブラウザで PWA にアクセス
4. Mac の Tailscale IP（例: `http://100.x.x.x:8080`）を入力して接続
5. "Start Session" をタップしてClaude Codeセッションを開始
6. メッセージを送信して Claude Code と対話

## 技術スタック

### Bridge Server

- **Runtime**: Bun
- **Framework**: Hono
- **WebSocket**: Bun native WebSocket

### PWA

- **Framework**: React Router v7
- **Build**: Vite
- **UI**: Tailwind CSS
- **State**: Zustand

## ディレクトリ構成

```
cc-client/
├── server/                    # Bridge Server
│   └── src/
│       ├── index.ts          # エントリポイント
│       ├── routes/
│       │   ├── api.ts        # REST API
│       │   └── ws.ts         # WebSocket
│       ├── services/
│       │   └── session.ts    # セッション管理
│       └── utils/
│           └── stream.ts     # stream-jsonパーサー
│
└── pwa/                       # PWA フロントエンド
    └── app/
        ├── routes/
        │   └── home.tsx      # メイン画面
        ├── components/
        │   ├── ConnectionPanel.tsx
        │   ├── MessageStream.tsx
        │   ├── MessageBubble.tsx
        │   └── InputArea.tsx
        ├── hooks/
        │   └── useWebSocket.ts
        └── store/
            └── sessionStore.ts
```

## 今後の機能

- [ ] PWA インストール対応（vite-plugin-pwa）
- [ ] 権限リクエストダイアログ
- [ ] ツール使用の可視化
- [ ] 差分ビューア
- [ ] ファイルブラウザ
- [ ] 複数セッション管理
- [ ] オフライン対応（履歴キャッシュ）
