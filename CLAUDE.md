# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## プロジェクト概要

Claude Code Mobile Client - MacにTailscale VPN経由で接続し、Claude Code CLIを操作するためのPWA。

## 開発コマンド

### Bridge Server (Bun + Hono)
```bash
cd server
bun install
bun run dev      # 開発サーバー起動 (--watch 付き)
bun run start    # 本番起動
bun test         # テスト実行
```
サーバーは `http://localhost:8080` で起動。

### PWA (React Router v7 + Vite)
```bash
cd pwa
npm install
npm run dev       # 開発サーバー起動
npm run build     # 本番ビルド
npm run typecheck # 型チェック
```
PWAは `http://localhost:5173` で起動。

## アーキテクチャ

```
Android PWA ←──WebSocket/REST──→ Bridge Server ←──stream-json──→ Claude CLI
```

### Bridge Server (`server/`)
- **Hono** WebフレームワークでREST API + WebSocket提供
- **ClaudeSession**: `claude` CLIプロセスを `--output-format stream-json --input-format stream-json` で起動・管理
- **SessionManager**: 複数セッションのライフサイクル管理

主要ファイル:
- `src/services/session.ts` - CLIプロセス管理、stdout解析
- `src/routes/ws.ts` - WebSocketメッセージハンドラ (create_session, send_message, approve, reject)
- `src/utils/stream.ts` - Zodスキーマによるstream-jsonパーサー

### PWA (`pwa/`)
- **React Router v7** (SSR有効) + **Vite**
- **Zustand** で接続・セッション状態管理
- **Tailwind CSS v4** でスタイリング

主要ファイル:
- `app/hooks/useWebSocket.ts` - シングルトンWebSocket接続管理
- `app/store/sessionStore.ts` - グローバル状態 (接続状態、メッセージ履歴)
- `app/components/` - UI コンポーネント群

### データフロー
1. PWA → WebSocket → Bridge Server: `{ type: "send_message", message: "..." }`
2. Bridge Server → Claude CLI stdin: `{ type: "user_message", message: { role: "user", content: "..." } }`
3. Claude CLI stdout → Bridge Server: stream-json形式のレスポンス
4. Bridge Server → PWA: `{ type: "claude_message", message_type: "assistant", ... }`

## 型定義

### Claude CLI stream-json メッセージ型 (server/src/utils/stream.ts)
- `assistant` - Claude応答
- `user` - ユーザー入力
- `system` - システムメッセージ
- `tool_use` - ツール呼び出し
- `permission_request` - 権限リクエスト (id, tool, description)

### PWA メッセージ型 (pwa/app/store/sessionStore.ts)
- `assistant`, `user`, `system`, `tool_use`, `error`, `thinking`

## パスエイリアス

PWA: `~/*` → `./app/*`
