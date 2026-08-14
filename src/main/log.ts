import { appendFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

export class Logger {
  private file: string;

  constructor(file: string) {
    this.file = file;
    mkdirSync(dirname(file), { recursive: true });
  }

  log(...args: unknown[]): void {
    const line = `[${new Date().toISOString()}] ${args.map(String).join(" ")}`;
    try {
      appendFileSync(this.file, line + "\n");
    } catch {
      // logging must never crash the app
    }
    console.log(line);
  }
}

export function defaultLogDir(userData: string): string {
  return join(userData, "logs");
}
