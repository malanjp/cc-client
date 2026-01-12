/**
 * セッション情報の永続化を担当する Repository
 */
import type { Database } from "bun:sqlite";
import type { SessionRecord, SessionStatus } from "../schema";

export class SessionRepository {
  constructor(private db: Database) {}

  /**
   * セッションを作成
   */
  create(session: SessionRecord): void {
    const stmt = this.db.prepare(`
      INSERT INTO sessions (id, work_dir, created_at, updated_at, status, process_alive)
      VALUES ($id, $work_dir, $created_at, $updated_at, $status, $process_alive)
    `);
    stmt.run({
      $id: session.id,
      $work_dir: session.work_dir,
      $created_at: session.created_at,
      $updated_at: session.updated_at,
      $status: session.status,
      $process_alive: session.process_alive,
    });
  }

  /**
   * ID でセッションを取得
   */
  findById(id: string): SessionRecord | null {
    const stmt = this.db.prepare("SELECT * FROM sessions WHERE id = $id");
    return stmt.get({ $id: id }) as SessionRecord | null;
  }

  /**
   * 全セッションを取得
   */
  findAll(includeEnded: boolean = false): SessionRecord[] {
    if (includeEnded) {
      return this.db.query("SELECT * FROM sessions ORDER BY created_at DESC").all() as SessionRecord[];
    }
    return this.db
      .query("SELECT * FROM sessions WHERE status = 'active' ORDER BY created_at DESC")
      .all() as SessionRecord[];
  }

  /**
   * セッションのステータスを更新
   */
  updateStatus(id: string, status: SessionStatus): void {
    const stmt = this.db.prepare(`
      UPDATE sessions SET status = $status, updated_at = $updated_at WHERE id = $id
    `);
    stmt.run({
      $id: id,
      $status: status,
      $updated_at: Date.now(),
    });
  }

  /**
   * プロセス生存フラグを更新
   */
  updateProcessAlive(id: string, alive: boolean): void {
    const stmt = this.db.prepare(`
      UPDATE sessions SET process_alive = $process_alive, updated_at = $updated_at WHERE id = $id
    `);
    stmt.run({
      $id: id,
      $process_alive: alive ? 1 : 0,
      $updated_at: Date.now(),
    });
  }

  /**
   * 全セッションのプロセス生存フラグをリセット（サーバー起動時用）
   */
  resetAllProcessAlive(): void {
    const stmt = this.db.prepare(
      "UPDATE sessions SET process_alive = 0, updated_at = $updated_at"
    );
    stmt.run({ $updated_at: Date.now() });
  }

  /**
   * 全アクティブセッションのステータスを ended にリセット（サーバー起動時用）
   */
  resetAllActiveStatus(): void {
    const stmt = this.db.prepare(
      "UPDATE sessions SET status = 'ended', updated_at = $updated_at WHERE status = 'active'"
    );
    stmt.run({ $updated_at: Date.now() });
  }

  /**
   * セッションを削除
   */
  delete(id: string): void {
    const stmt = this.db.prepare("DELETE FROM sessions WHERE id = $id");
    stmt.run({ $id: id });
  }
}
