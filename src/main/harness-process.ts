import {
  spawn,
  spawnSync,
  type ChildProcessWithoutNullStreams,
} from "node:child_process";
import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { EventEmitter } from "node:events";

export interface HarnessOptions {
  nodeExecutable: string;
  harnessEntry: string;
  port: number;
  dshHome: string;
  harnessLog: string;
}

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Owns the DeepSeek Harness child process:
 * spawn -> ready probe -> clean shutdown with Windows process-tree kill.
 */
export class HarnessProcessManager extends EventEmitter {
  private child: ChildProcessWithoutNullStreams | null = null;
  private spawnError: string | null = null;
  private lastPid: number | null = null;
  private _port = 0;

  get port(): number {
    return this._port;
  }

  get running(): boolean {
    return this.child !== null;
  }

  start(opts: HarnessOptions): void {
    this._port = opts.port;
    this.spawnError = null;
    mkdirSync(dirname(opts.harnessLog), { recursive: true });

    const child = spawn(
      opts.nodeExecutable,
      [opts.harnessEntry, "web", "--port", String(opts.port)],
      {
        env: { ...process.env, DSH_HOME: opts.dshHome },
        windowsHide: true,
      },
    );
    this.child = child;
    this.lastPid = child.pid ?? null;

    const write = (chunk: Buffer | string) => {
      try {
        appendFileSync(opts.harnessLog, chunk);
      } catch {
        // log failure is not fatal
      }
    };
    child.stdout.on("data", write);
    child.stderr.on("data", write);
    child.on("error", (err) => {
      this.spawnError = err.message;
      this.emit("log", `spawn error: ${err.message}\n`);
    });
    child.on("exit", (code, signal) => {
      this.child = null;
      this.emit("exit", code, signal);
    });
  }

  /** Poll the HTTP endpoint until the server responds (or the process dies). */
  async waitForReady(timeoutMs = 120_000): Promise<void> {
    const started = Date.now();
    const port = this._port;
    while (Date.now() - started < timeoutMs) {
      if (this.spawnError) {
        throw new Error(`failed to spawn harness: ${this.spawnError}`);
      }
      if (!this.running) {
        throw new Error("harness process exited before becoming ready");
      }
      try {
        const res = await fetch(`http://127.0.0.1:${port}/`, {
          signal: AbortSignal.timeout(1500),
        });
        if (res.status < 500) return; // any HTTP response means the server is up
      } catch {
        // connection refused / timeout -> not ready yet
      }
      await delay(500);
    }
    throw new Error(`harness did not become ready within ${timeoutMs}ms`);
  }

  /**
   * Graceful shutdown: ask the child to exit, then force-kill the whole
   * process tree on Windows so no node.exe / pwsh / agent processes linger.
   */
  async stop(): Promise<void> {
    const child = this.child;
    const pid = this.lastPid;
    if (!child && pid === null) return;

    if (child && pid) {
      child.kill(); // SIGTERM on Windows = TerminateProcess, but try it first
      await Promise.race([
        new Promise<void>((r) => child.once("exit", () => r())),
        delay(2000),
      ]);
    }
    if (this.child || pid !== null) {
      this.killTree(pid as number);
    }
    this.child = null;
  }

  /** Synchronous tree kill — safe to call from process 'exit'. */
  killNow(): void {
    if (this.lastPid !== null) {
      this.killTree(this.lastPid);
    }
  }

  private killTree(pid: number): void {
    try {
      spawnSync("taskkill", ["/pid", String(pid), "/t", "/f"], {
        windowsHide: true,
        stdio: "ignore",
      });
    } catch {
      // process already gone
    }
  }
}
