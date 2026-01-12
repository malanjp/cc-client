import { spawn, type ChildProcess, execSync } from "child_process";
import waitOn from "wait-on";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, "../..");

const BRIDGE_PORT = 8080;
const PWA_PORT = 5173;

let bridgeProcess: ChildProcess | null = null;
let pwaProcess: ChildProcess | null = null;

export async function setup() {
  console.log("[GlobalSetup] Starting E2E test environment...");

  // 既存のプロセスをクリーンアップ
  try {
    execSync(`lsof -ti :${BRIDGE_PORT} | xargs kill -9 2>/dev/null || true`, {
      stdio: "ignore",
    });
    execSync(`lsof -ti :${PWA_PORT} | xargs kill -9 2>/dev/null || true`, {
      stdio: "ignore",
    });
  } catch {
    // 無視
  }

  // agent-browser デーモンを停止してリセット
  try {
    execSync("agent-browser close 2>/dev/null || true", { stdio: "ignore" });
    // デーモンを完全に停止
    execSync("pkill -f 'agent-browser' 2>/dev/null || true", { stdio: "ignore" });
  } catch {
    // 無視
  }

  // Bridge Server 起動
  const serverDir = join(PROJECT_ROOT, "server");
  bridgeProcess = spawn("bun", ["run", "src/index.ts"], {
    cwd: serverDir,
    env: { ...process.env, PORT: String(BRIDGE_PORT) },
    stdio: "pipe",
  });

  bridgeProcess.stdout?.on("data", (data: Buffer) => {
    console.log(`[Bridge Server] ${data.toString().trim()}`);
  });

  bridgeProcess.stderr?.on("data", (data: Buffer) => {
    console.error(`[Bridge Server Error] ${data.toString().trim()}`);
  });

  await waitOn({
    resources: [`http://localhost:${BRIDGE_PORT}/health`],
    timeout: 30000,
  });
  console.log(`[GlobalSetup] Bridge Server started on port ${BRIDGE_PORT}`);

  // PWA Server 起動
  const pwaDir = join(PROJECT_ROOT, "pwa");
  pwaProcess = spawn("npm", ["run", "dev", "--", "--port", String(PWA_PORT)], {
    cwd: pwaDir,
    env: process.env,
    stdio: "pipe",
  });

  pwaProcess.stdout?.on("data", (data: Buffer) => {
    console.log(`[PWA Server] ${data.toString().trim()}`);
  });

  pwaProcess.stderr?.on("data", (data: Buffer) => {
    console.error(`[PWA Server Error] ${data.toString().trim()}`);
  });

  await waitOn({
    resources: [`http://localhost:${PWA_PORT}`],
    timeout: 60000,
  });
  console.log(`[GlobalSetup] PWA Server started on port ${PWA_PORT}`);

  // ブラウザを開いてデーモンを初期化
  console.log("[GlobalSetup] Initializing browser...");
  execSync(`agent-browser open "http://localhost:${PWA_PORT}"`, {
    stdio: "inherit",
  });
  // ページがロードされるのを待つ
  execSync("sleep 2", { stdio: "ignore" });
  console.log("[GlobalSetup] Browser initialized");

  console.log("[GlobalSetup] E2E test environment ready");
}

export async function teardown() {
  console.log("[GlobalTeardown] Cleaning up...");

  // ブラウザを閉じる
  try {
    execSync("agent-browser close 2>/dev/null || true", { stdio: "ignore" });
  } catch {
    // 無視
  }

  // サーバーを停止
  if (pwaProcess) {
    pwaProcess.kill("SIGTERM");
    console.log("[GlobalTeardown] PWA Server stopped");
  }

  if (bridgeProcess) {
    bridgeProcess.kill("SIGTERM");
    console.log("[GlobalTeardown] Bridge Server stopped");
  }

  console.log("[GlobalTeardown] All resources cleaned up");
}
