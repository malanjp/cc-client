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

環境変数の設定（オプション）：

```bash
cp .env.example .env
# 必要に応じて .env を編集
```

### PWA（開発時）

```bash
cd pwa
npm install
npm run dev
```

PWAは `http://localhost:5173` で起動します。

環境変数の設定（オプション）：

```bash
cp .env.example .env
# VITE_SERVER_URL でデフォルトのサーバーURLを設定
```

### Tailscale経由でのアクセス

外部デバイス（Android等）からTailscale経由でアクセスするには、以下の設定が必要です：

1. **TailscaleのIPアドレスを確認**
   ```bash
   tailscale ip -4
   # 例: 100.125.53.98
   ```

2. **Bridge Serverの設定**（`server/.env`）
   ```bash
   # CORSにTailscale IPを追加
   CORS_ORIGINS=http://localhost:5173,http://100.x.x.x:5173
   ```

3. **PWAの設定**（`pwa/.env`）
   ```bash
   # デフォルトサーバーURLをTailscale IPに設定
   VITE_SERVER_URL=http://100.x.x.x:8080
   ```

4. **アクセス**
   - PWA: `http://<Tailscale IP>:5173`
   - Bridge Server: `http://<Tailscale IP>:8080`

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
