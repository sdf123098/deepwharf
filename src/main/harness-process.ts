import {
  spawn,
  spawnSync,
  type ChildProcessWithoutNullStreams,
} from "node:child_process";
import { createWriteStream, mkdirSync, type WriteStream } from "node:fs";
import { dirname } from "node:path";
import { EventEmitter } from "node:events";
import { rotateLogFile } from "./log";

export interface HarnessOptions {
  nodeExecutable: string;
  harnessEntry: string;
  port: number;
  dshHome: string;
  harnessLog: string;
}

export interface HarnessExitInfo {
  code: number | null;
  signal: NodeJS.Signals | null;
  /** True when stop() requested the shutdown — must not be treated as a crash. */
  expected: boolean;
}

/**
 * Stable marker served by the Harness WebUI root document. The readiness probe
 * only accepts a response that actually looks like the Harness (instead of
 * "any HTTP server that happens to be on the port").
 */
const HARNESS_HTML_MARKER = "DeepSeek Harness";

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Owns the DeepSeek Harness child process:
 * spawn -> ready probe -> clean shutdown with Windows process-tree kill.
 */
export class HarnessProcessManager extends EventEmitter {
  private child: ChildProcessWithoutNullStreams | null = null;
  private spawnError: string | null = null;
  private lastPid: number | null = null;
  private stopping = false;
  private _port = 0;
  private logStream: WriteStream | null = null;

  get port(): number {
    return this._port;
  }

  get running(): boolean {
    return this.child !== null;
  }

  start(opts: HarnessOptions): void {
    this._port = opts.port;
    this.spawnError = null;
    this.stopping = false;
    mkdirSync(dirname(opts.harnessLog), { recursive: true });

    // Stream the harness output to disk asynchronously (rotation at start so
    // a long-lived agent session never blocks the main process on sync I/O).
    rotateLogFile(opts.harnessLog);
    this.logStream = createWriteStream(opts.harnessLog, { flags: "a" });
    this.logStream.on("error", () => {});

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

    if (this.logStream) {
      child.stdout.pipe(this.logStream, { end: false });
      child.stderr.pipe(this.logStream, { end: false });
    }
    child.on("error", (err) => {
      this.spawnError = err.message;
      this.emit("log", `spawn error: ${err.message}\n`);
    });
    child.on("exit", (code, signal) => {
      const expected = this.stopping;
      this.child = null;
      this.lastPid = null;
      this.stopping = false;
      this.closeLog();
      this.emit("exit", { code, signal, expected } satisfies HarnessExitInfo);
    });
  }

  /** Poll the Harness WebUI until it serves its real page (or the process dies). */
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
        if (res.ok) {
          const body = await res.text();
          if (body.includes(HARNESS_HTML_MARKER)) return;
        }
      } catch {
        // connection refused / timeout / wrong content -> not ready yet
      }
      await delay(500);
    }
    throw new Error(`harness did not become ready within ${timeoutMs}ms`);
  }

  /**
   * Graceful shutdown: ask the child to exit, then force-kill the whole
   * process tree on Windows so no node.exe / pwsh / agent processes linger.
   * The subsequent exit event is marked `expected` and must not be treated as
   * a crash by the caller.
   */
  async stop(): Promise<void> {
    const child = this.child;
    const pid = this.lastPid;
    if (!child && pid === null) return;

    this.stopping = true;
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
    this.lastPid = null;
    this.closeLog();
  }

  /** Synchronous tree kill — safe to call from process 'exit'. */
  killNow(): void {
    if (this.lastPid !== null) {
      this.killTree(this.lastPid);
    }
  }

  private closeLog(): void {
    if (this.logStream) {
      this.logStream.end();
      this.logStream = null;
    }
  }

  private killTree(pid: number): void {
    if (!Number.isInteger(pid) || pid <= 0) return;
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
