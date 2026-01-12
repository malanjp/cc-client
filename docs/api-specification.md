# API 仕様

Bridge Server が提供する REST API および WebSocket プロトコルの仕様。

## 基本情報

| 項目 | 値 |
|------|-----|
| ベース URL | `http://<host>:8080` |
| プロトコル | HTTP/1.1, WebSocket |
| コンテンツタイプ | `application/json` |

---

## REST API

### GET /

サーバー情報を取得する。

**レスポンス:**
```json
{
  "name": "Claude Code Bridge Server",
  "version": "0.1.0"
}
```

---

### GET /health

ヘルスチェック用エンドポイント。

**レスポンス:**
```json
{
  "status": "ok"
}
```

---

### GET /api/sessions

セッションの一覧を取得する。

**クエリパラメータ:**
| パラメータ | 型 | 必須 | 説明 |
|-----------|-----|------|------|
| include_ended | boolean | No | `true` の場合、終了済みセッションも含める |

**レスポンス:**
```json
{
  "sessions": [
    {
      "id": "uuid",
      "workDir": "/path/to/project",
      "createdAt": 1736640000000,
      "updatedAt": 1736640000000,
      "status": "active",
      "processAlive": true
    }
  ]
}
```

**フィールド説明:**
| フィールド | 型 | 説明 |
|-----------|-----|------|
| id | string | セッション UUID |
| workDir | string | 作業ディレクトリ |
| createdAt | number | 作成時刻（Unix タイムスタンプ） |
| updatedAt | number | 更新時刻（Unix タイムスタンプ） |
| status | string | `"active"` または `"ended"` |
| processAlive | boolean | CLI プロセスが生きているか |

---

### POST /api/sessions

新規セッションを作成する。

**リクエストボディ:**
```json
{
  "workDir": "/path/to/project"
}
```

**レスポンス（成功）:**
```json
{
  "sessionId": "uuid",
  "workDir": "/path/to/project"
}
```

**レスポンス（エラー）:**
```json
{
  "error": "Invalid work directory"
}
```

---

### GET /api/sessions/:id

セッションの詳細を取得する。

**パスパラメータ:**
- `id`: セッション ID

**レスポンス:**
```json
{
  "id": "uuid",
  "workDir": "/path/to/project",
  "createdAt": "2025-01-12T00:00:00.000Z",
  "status": "active"
}
```

---

### DELETE /api/sessions/:id

セッションを終了する。

**パスパラメータ:**
- `id`: セッション ID

**レスポンス:**
```json
{
  "success": true
}
```

---

### GET /api/sessions/:id/messages

セッションのメッセージ履歴を取得する。

**パスパラメータ:**
- `id`: セッション ID

**クエリパラメータ:**
| パラメータ | 型 | デフォルト | 説明 |
|-----------|-----|----------|------|
| limit | number | 100 | 取得するメッセージ数 |
| offset | number | 0 | オフセット |
| order | string | "asc" | `"asc"` または `"desc"` |

**レスポンス:**
```json
{
  "sessionId": "uuid",
  "messages": [
    {
      "id": "msg-uuid",
      "type": "user",
      "content": "Hello, Claude!",
      "timestamp": 1736640000000,
      "toolName": null,
      "toolInput": null,
      "permissionRequest": null
    },
    {
      "id": "msg-uuid-2",
      "type": "assistant",
      "content": "Hello! How can I help you?",
      "timestamp": 1736640001000,
      "toolName": null,
      "toolInput": null,
      "permissionRequest": null
    }
  ],
  "total": 42,
  "hasMore": true
}
```

**メッセージ type の種類:**
| type | 説明 |
|------|------|
| `user` | ユーザーメッセージ |
| `assistant` | Claude の応答 |
| `system` | システムメッセージ |
| `tool_use` | ツール使用 |
| `permission_request` | 権限リクエスト |
| `result` | 処理結果 |

---

### GET /api/projects

利用可能なプロジェクトディレクトリの一覧を取得する。

**レスポンス:**
```json
{
  "projects": [
    {
      "name": "my-project",
      "path": "/Users/user/repos/my-project"
    }
  ]
}
```

---

## WebSocket プロトコル

### 接続

```
ws://<host>:8080/ws
```

### メッセージ形式

すべてのメッセージは JSON 形式で送受信される。

```typescript
interface WebSocketMessage {
  type: string;
  [key: string]: unknown;
}
```

---

### クライアント → サーバー

#### create_session

セッションを作成する。

```json
{
  "type": "create_session",
  "workDir": "/path/to/project"
}
```

| フィールド | 型 | 必須 | 説明 |
|-----------|-----|------|------|
| type | string | Yes | `"create_session"` |
| workDir | string | No | 作業ディレクトリ（省略時はホームディレクトリ） |

---

#### send_message

メッセージを送信する。

```json
{
  "type": "send_message",
  "message": "Hello, Claude!"
}
```

| フィールド | 型 | 必須 | 説明 |
|-----------|-----|------|------|
| type | string | Yes | `"send_message"` |
| message | string | Yes | ユーザーメッセージ |

---

#### approve

権限リクエストを承認する。

```json
{
  "type": "approve"
}
```

---

#### reject

権限リクエストを拒否する。

```json
{
  "type": "reject"
}
```

---

#### abort

応答を中断する。Claude CLI に SIGINT シグナルを送信する。

```json
{
  "type": "abort"
}
```

---

#### end_session

セッションを終了する。

```json
{
  "type": "end_session"
}
```

---

#### restore_session

過去のセッション履歴を取得する（プロセスが終了している場合）。

```json
{
  "type": "restore_session",
  "sessionId": "uuid"
}
```

| フィールド | 型 | 必須 | 説明 |
|-----------|-----|------|------|
| type | string | Yes | `"restore_session"` |
| sessionId | string | Yes | 復元するセッションの ID |

---

#### attach_session

既存のアクティブなセッションに再接続する（プロセスが生きている場合）。

```json
{
  "type": "attach_session",
  "sessionId": "uuid"
}
```

| フィールド | 型 | 必須 | 説明 |
|-----------|-----|------|------|
| type | string | Yes | `"attach_session"` |
| sessionId | string | Yes | 再接続するセッションの ID |

---

### サーバー → クライアント

#### connected

接続が確立されたことを通知する。

```json
{
  "type": "connected"
}
```

---

#### session_created

セッションが作成されたことを通知する。

```json
{
  "type": "session_created",
  "sessionId": "uuid",
  "workDir": "/path/to/project"
}
```

---

#### claude_message

Claude からのメッセージを通知する。

```json
{
  "type": "claude_message",
  "message_type": "assistant",
  "message": {
    "role": "assistant",
    "content": "Hello! How can I help you?"
  }
}
```

**message_type の種類:**

| message_type | 説明 |
|-------------|------|
| `assistant` | Claude の応答 |
| `user` | ユーザーメッセージ（エコーバック） |
| `system` | システムメッセージ |
| `tool_use` | ツール使用 |
| `permission_request` | 権限リクエスト |
| `result` | 処理結果 |

---

##### tool_use メッセージ

```json
{
  "type": "claude_message",
  "message_type": "tool_use",
  "tool_use": {
    "id": "tool_123",
    "name": "Read",
    "input": {
      "file_path": "/path/to/file"
    }
  }
}
```

---

##### permission_request メッセージ

```json
{
  "type": "claude_message",
  "message_type": "permission_request",
  "permission_request": {
    "id": "perm_123",
    "tool": "Bash",
    "description": "Run command: npm install"
  }
}
```

---

#### error

エラーを通知する。

```json
{
  "type": "error",
  "error": "No active session"
}
```

---

#### session_ended

セッションが終了したことを通知する。

```json
{
  "type": "session_ended"
}
```

---

#### session_history

セッションのメッセージ履歴を返す。`restore_session` または `attach_session` への応答。

```json
{
  "type": "session_history",
  "sessionId": "uuid",
  "messages": [
    {
      "id": "msg-uuid",
      "type": "user",
      "content": "Hello, Claude!",
      "timestamp": 1736640000000
    }
  ],
  "processAlive": false
}
```

| フィールド | 型 | 説明 |
|-----------|-----|------|
| sessionId | string | セッション ID |
| messages | array | メッセージ履歴 |
| processAlive | boolean | CLI プロセスが生きているか |

---

#### session_attached

セッションへの再接続が成功したことを通知する。

```json
{
  "type": "session_attached",
  "sessionId": "uuid"
}
```

---

## Claude CLI stream-json 形式

Bridge Server と Claude CLI 間で使用される stream-json 形式。

### 入力形式（stdin）

#### ユーザーメッセージ

```json
{
  "type": "user",
  "message": {
    "role": "user",
    "content": "Hello, Claude!"
  }
}
```

#### 承認/拒否

```json
{
  "type": "approval",
  "approved": true
}
```

### 出力形式（stdout）

#### アシスタント応答

```json
{
  "type": "assistant",
  "message": {
    "role": "assistant",
    "content": "Hello! How can I help you?"
  }
}
```

#### ツール使用

```json
{
  "type": "tool_use",
  "tool_use": {
    "id": "tool_123",
    "name": "Read",
    "input": {
      "file_path": "/path/to/file"
    }
  }
}
```

#### 権限リクエスト

```json
{
  "type": "permission_request",
  "permission_request": {
    "id": "perm_123",
    "tool": "Bash",
    "description": "Run command: npm install"
  }
}
```

#### 結果

```json
{
  "type": "result",
  "result": {
    "success": true
  }
}
```

---

## エラーコード

| エラーメッセージ | 説明 |
|-----------------|------|
| `No active session` | アクティブなセッションがない |
| `Invalid work directory` | 許可されていないディレクトリが指定された |
| `Session not found` | 指定されたセッションが見つからない |
| `Failed to create session` | セッションの作成に失敗した |
| `Session process is not alive` | セッションのプロセスが終了しており再接続不可 |
| `Session is not active` | セッションが終了済みで操作不可 |
