# 開発ロードマップ

Claude Code Mobile Client の開発計画。

---

## Phase 1: コア機能完成

最優先で実装すべき機能。PWA としての基本的な操作性を確保する。

### 実装済み

| タスク | 詳細 | 関連ファイル |
|--------|------|-------------|
| ✅ 応答中断機能 | 停止ボタンまたは Esc キーで Claude の応答を中断 | `pwa/app/components/InputArea.tsx`, `server/src/services/session.ts` |
| ✅ 日本語入力対応 | IME 変換確定時に送信されない問題を修正 | `pwa/app/components/InputArea.tsx` |

### 未実装

| タスク | 詳細 | 関連ファイル |
|--------|------|-------------|
| 応答待ちローディング UI | スピナー + 「考え中...」テキストで Claude の応答待ちを表示 | `pwa/app/components/MessageStream.tsx` |
| 権限リクエスト UI | approve/reject ボタンで権限リクエストに応答 | `pwa/app/components/PermissionRequest.tsx`（新規） |
| ツール使用の詳細表示 | ツール名、入力パラメータ、実行結果を見やすく表示 | `pwa/app/components/MessageBubble.tsx` |
| エラーメッセージの改善 | 日本語でわかりやすいエラーメッセージを表示 | `pwa/app/hooks/useWebSocket.ts` |

---

## Phase 2: 安定性向上

接続の安定性とコード品質を向上させる。

| タスク | 詳細 | 関連ファイル |
|--------|------|-------------|
| WebSocket 自動再接続 | Exponential backoff で自動再接続を試みる | `pwa/app/hooks/useWebSocket.ts` |
| セッション状態の永続化 | localStorage にセッション情報を保存・復元 | `pwa/app/store/sessionStore.ts` |
| Bridge Server ユニットテスト | session.ts, ws.ts, stream.ts のテストを追加 | `server/src/**/*.test.ts`（新規） |
| グレースフルシャットダウン | SIGTERM 受信時にセッションを適切にクリーンアップ | `server/src/index.ts` |

---

## Phase 3: PWA 強化

PWA としての機能を強化し、モバイル体験を向上させる。

| タスク | 詳細 | 関連ファイル |
|--------|------|-------------|
| Service Worker 実装 | オフライン時に UI を表示（接続エラー画面） | `pwa/public/sw.js`（新規） |
| プッシュ通知 | 長時間タスク完了時に通知 | `pwa/app/lib/notifications.ts`（新規） |
| アプリアイコン最適化 | 各サイズのアイコンを用意 | `pwa/public/icons/` |
| キャッシュ戦略 | メッセージ履歴のローカルキャッシュ | `pwa/app/store/sessionStore.ts` |

---

## Phase 4: 運用改善

運用を楽にするための機能を追加する。

| タスク | 詳細 | 関連ファイル |
|--------|------|-------------|
| セッションタイムアウト | 一定時間アイドル状態のセッションを自動終了 | `server/src/services/session.ts` |
| ログ出力 | ファイルへのログ出力（JSON 形式） | `server/src/utils/logger.ts`（新規） |
| 環境設定の外部化 | `.env` ファイルによる設定管理 | `server/.env.example`（新規） |

---

## 進捗管理

各 Phase の完了基準:

| Phase | 完了基準 |
|-------|---------|
| Phase 1 | 権限リクエストの承認/拒否がモバイルから可能 |
| Phase 2 | 接続が切れても自動復旧、テストカバレッジ > 70% |
| Phase 3 | オフライン時もアプリが開ける、通知が届く |
| Phase 4 | 24 時間以上の連続稼働が可能 |

---

## 優先度の判断基準

1. **ユーザー影響度**: ユーザー体験に直接影響するものを優先
2. **依存関係**: 他のタスクの前提となるものを優先
3. **技術的リスク**: リスクの高いものは早めに着手
4. **実装コスト**: 同じ効果なら低コストのものを優先
