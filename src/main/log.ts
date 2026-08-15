import { createWriteStream, renameSync, rmSync, statSync, mkdirSync, type WriteStream } from "node:fs";
import { dirname, join } from "node:path";

const MAX_LOG_BYTES = 20 * 1024 * 1024; // 20 MB
const KEEP_LOG_FILES = 3;
const ROTATE_CHECK_INTERVAL_MS = 60_000;

/**
 * Shift `file -> file.1 -> file.2 -> ...` once `file` exceeds maxBytes.
 * Only call this while the file is NOT open for writing.
 */
export function rotateLogFile(file: string, maxBytes = MAX_LOG_BYTES, keep = KEEP_LOG_FILES): void {
  let size: number;
  try {
    size = statSync(file).size;
  } catch {
    return;
  }
  if (size < maxBytes) return;
  for (let i = keep - 1; i >= 1; i--) {
    const from = i === 1 ? file : `${file}.${i - 1}`;
    const to = `${file}.${i}`;
    try {
      renameSync(from, to);
    } catch {
      // previous rotation file missing — fine
    }
  }
  try {
    rmSync(file, { force: true });
  } catch {
    // best effort
  }
}

/**
 * Async, size-rotated file logger for the desktop shell. Writes go through a
 * stream so logging never blocks the main process event loop.
 */
export class Logger {
  private file: string;
  private stream: WriteStream;
  private lastRotateCheck = 0;

  constructor(file: string) {
    this.file = file;
    mkdirSync(dirname(file), { recursive: true });
    rotateLogFile(file);
    this.stream = createWriteStream(file, { flags: "a" });
    this.stream.on("error", () => {
      // logging must never crash the app
    });
  }

  log(...args: unknown[]): void {
    const line = `[${new Date().toISOString()}] ${args.map(String).join(" ")}`;
    this.stream.write(line + "\n");
    console.log(line);
    this.maybeRotate();
  }

  close(): void {
    this.stream.end();
  }

  /** Rotate in place (close, shift, reopen) when the file outgrows the limit. */
  private maybeRotate(): void {
    if (Date.now() - this.lastRotateCheck < ROTATE_CHECK_INTERVAL_MS) return;
    this.lastRotateCheck = Date.now();
    try {
      if (statSync(this.file).size >= MAX_LOG_BYTES) {
        this.stream.end();
        rotateLogFile(this.file);
        this.stream = createWriteStream(this.file, { flags: "a" });
        this.stream.on("error", () => {});
      }
    } catch {
      // best effort
    }
  }
}

export function defaultLogDir(userData: string): string {
  return join(userData, "logs");
}
