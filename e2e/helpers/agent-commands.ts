import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

export interface SnapshotElement {
  ref: string;
  role: string;
  name?: string;
  text?: string;
}

// agent-browser の実際の出力形式
interface AgentBrowserResponse {
  success: boolean;
  data: {
    refs?: Record<string, { name?: string; role: string }>;
    snapshot: string;
  };
  error: string | null;
}

export interface Snapshot {
  tree: string;
  refs: SnapshotElement[];
}

export class AgentBrowser {
  private sessionId?: string;

  constructor(sessionId?: string) {
    this.sessionId = sessionId;
  }

  private async run(command: string): Promise<string> {
    // セッション ID がある場合は環境変数として渡す、ない場合はデフォルトセッションを使用
    const envPrefix = this.sessionId
      ? `AGENT_BROWSER_SESSION=${this.sessionId} `
      : "";
    const { stdout } = await execAsync(`${envPrefix}agent-browser ${command}`);
    return stdout.trim();
  }

  async launch(initialUrl?: string): Promise<void> {
    // 初期URLを指定するか、ブランクページを開かない
    if (initialUrl) {
      await this.run(`open "${initialUrl}"`);
    }
    // initialUrlがない場合は何もしない（最初のgotoで開く）
  }

  async goto(url: string): Promise<void> {
    await this.run(`open "${url}"`);
  }

  async snapshot(interactive = false): Promise<Snapshot> {
    // デフォルトは -i なし（すべての要素を取得）
    const flag = interactive ? "-i" : "";
    const output = await this.run(`snapshot ${flag} --json`);

    let response: AgentBrowserResponse;
    try {
      response = JSON.parse(output);
    } catch {
      console.error("[AgentBrowser] Failed to parse snapshot output:", output);
      throw new Error(`Failed to parse snapshot: ${output}`);
    }

    if (!response.success) {
      throw new Error(response.error || "Snapshot failed");
    }

    // refs が存在しない場合は空配列を返す
    const refsData = response.data?.refs || {};

    // refs を Record から配列に変換
    const refs: SnapshotElement[] = Object.entries(refsData).map(
      ([ref, data]) => ({
        ref: `@${ref}`,
        role: data.role,
        name: data.name,
      })
    );

    return {
      tree: response.data?.snapshot || "",
      refs,
    };
  }

  // セマンティックロケーターを使用してクリック
  async clickByRole(role: string, name?: string): Promise<void> {
    const nameArg = name ? ` --name "${name}"` : "";
    await this.run(`find role ${role} click${nameArg}`);
  }

  // セマンティックロケーターを使用してテキスト入力
  async fillByRole(role: string, text: string, name?: string): Promise<void> {
    const nameArg = name ? ` --name "${name}"` : "";
    await this.run(`find role ${role} fill "${text}"${nameArg}`);
  }

  // テキストで要素を見つけてクリック
  async clickByText(text: string): Promise<void> {
    await this.run(`find text "${text}" click`);
  }

  async click(ref: string): Promise<void> {
    await this.run(`click ${ref}`);
  }

  async fill(ref: string, text: string): Promise<void> {
    await this.run(`fill ${ref} "${text}"`);
  }

  async type(ref: string, text: string): Promise<void> {
    await this.run(`type ${ref} "${text}"`);
  }

  async press(key: string): Promise<void> {
    await this.run(`press ${key}`);
  }

  async screenshot(path?: string): Promise<void> {
    const pathArg = path ? ` "${path}"` : "";
    await this.run(`screenshot${pathArg}`);
  }

  async waitFor(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }

  async close(): Promise<void> {
    await this.run("close");
  }

  // スナップショットのテキスト出力に特定のテキストが含まれているか確認
  hasText(snapshot: Snapshot, text: string): boolean {
    return snapshot.tree.includes(text);
  }

  // スナップショットのテキスト出力に特定のロールが含まれているか確認
  hasRole(snapshot: Snapshot, role: string): boolean {
    return snapshot.tree.includes(`${role} "`);
  }

  findByRole(snapshot: Snapshot, role: string): SnapshotElement | undefined {
    return snapshot.refs.find((el) => el.role === role);
  }

  findByText(snapshot: Snapshot, text: string): SnapshotElement | undefined {
    return snapshot.refs.find(
      (el) => el.text?.includes(text) || el.name?.includes(text)
    );
  }

  findByRoleAndText(
    snapshot: Snapshot,
    role: string,
    text: string
  ): SnapshotElement | undefined {
    return snapshot.refs.find(
      (el) =>
        el.role === role && (el.text?.includes(text) || el.name?.includes(text))
    );
  }

  findAllByRole(snapshot: Snapshot, role: string): SnapshotElement[] {
    return snapshot.refs.filter((el) => el.role === role);
  }
}
