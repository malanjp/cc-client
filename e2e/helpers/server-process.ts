import { spawn, type ChildProcess } from "child_process";
import waitOn from "wait-on";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, "../..");

export class ServerProcess {
  private process: ChildProcess | null = null;

  async start(port = 8080): Promise<void> {
    const serverDir = join(PROJECT_ROOT, "server");

    this.process = spawn("bun", ["run", "src/index.ts"], {
      cwd: serverDir,
      env: { ...process.env, PORT: String(port) },
      stdio: "pipe",
    });

    this.process.stdout?.on("data", (data: Buffer) => {
      console.log(`[Bridge Server] ${data.toString().trim()}`);
    });

    this.process.stderr?.on("data", (data: Buffer) => {
      console.error(`[Bridge Server Error] ${data.toString().trim()}`);
    });

    await waitOn({
      resources: [`http://localhost:${port}/health`],
      timeout: 30000,
    });

    console.log(`[Bridge Server] Started on port ${port}`);
  }

  async stop(): Promise<void> {
    if (this.process) {
      this.process.kill("SIGTERM");
      this.process = null;
      console.log("[Bridge Server] Stopped");
    }
  }
}

export class PWAServer {
  private process: ChildProcess | null = null;

  async start(port = 5173): Promise<void> {
    const pwaDir = join(PROJECT_ROOT, "pwa");

    this.process = spawn("npm", ["run", "dev", "--", "--port", String(port)], {
      cwd: pwaDir,
      env: process.env,
      stdio: "pipe",
    });

    this.process.stdout?.on("data", (data: Buffer) => {
      console.log(`[PWA Server] ${data.toString().trim()}`);
    });

    this.process.stderr?.on("data", (data: Buffer) => {
      console.error(`[PWA Server Error] ${data.toString().trim()}`);
    });

    await waitOn({
      resources: [`http://localhost:${port}`],
      timeout: 60000,
    });

    console.log(`[PWA Server] Started on port ${port}`);
  }

  async stop(): Promise<void> {
    if (this.process) {
      this.process.kill("SIGTERM");
      this.process = null;
      console.log("[PWA Server] Stopped");
    }
  }
}
