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

アクティブなセッションの一覧を取得する。

**レスポンス:**
```json
{
  "sessions": [
    {
      "id": "uuid",
      "workDir": "/path/to/project",
      "createdAt": "2025-01-12T00:00:00.000Z"
    }
  ]
}
```

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
