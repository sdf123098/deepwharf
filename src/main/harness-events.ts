/**
 * Watches the harness's two event streams and surfaces the frames the
 * desktop shell cares about: approvals, questions, per-session running-state
 * changes, and agent errors.
 *
 * Wire contract (dsh-host-webserver): GET /api/events.host and /api/events.mux
 * answer plain HTTP with 426 — they only accept a WebSocket upgrade. Each text
 * frame is a full ServerRequest envelope whose payload slot is the
 * HostFrame / MuxFrame union. The mux stream auto-subscribes to every session
 * (new ones are pushed as they appear).
 */

export interface HarnessEventHandlers {
  onSessionStatus(sessionId: string, running: boolean): void;
  onAgentError(sessionId: string, message: string): void;
  onApproval(sessionId: string, toolName: string): void;
  onQuestion(sessionId: string, count: number): void;
  onSessionAdded(sessionId: string, isSubagent: boolean): void;
  onSessionRemoved(sessionId: string): void;
  /** Live session projection updates (dsh-token-meter, title, …). */
  onProjection(sessionId: string, key: string, value: unknown): void;
}

/** Optional connection lifecycle log so a dead stream can never be silent. */
export type StreamStatusLogger = (message: string) => void;

interface HostFrame {
  type: string;
  sessionId?: unknown;
  running?: unknown;
  message?: unknown;
  origin?: unknown;
}

interface MuxFrame {
  type: string;
  sessionId?: unknown;
  toolName?: unknown;
  questions?: unknown;
  key?: unknown;
  value?: unknown;
  seq?: unknown;
}

/** A parsed frame payload: `type` is the discriminant the envelope check guarantees. */
type AnyFrame = { type: string } & Record<string, unknown>;

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class HarnessEventWatcher {
  private sockets = new Set<WebSocket>();
  private stopped = true;
  private port = 0;
  private log: StreamStatusLogger | null = null;

  get watching(): boolean {
    return !this.stopped;
  }

  /** Start watching a harness port; replaces any previous stream pair. */
  start(port: number, handlers: HarnessEventHandlers, log?: StreamStatusLogger): void {
    this.stop();
    this.stopped = false;
    this.port = port;
    this.log = log ?? null;
    void this.runStream("/api/events.host", (p) => this.dispatchHost(p, handlers));
    void this.runStream("/api/events.mux", (p) => this.dispatchMux(p, handlers));
  }

  stop(): void {
    this.stopped = true;
    for (const s of this.sockets) {
      try {
        s.close();
      } catch {
        // already closing
      }
    }
    this.sockets.clear();
  }

  /**
   * One WebSocket connection with reconnect + capped backoff. A harness
   * restart always lands on a fresh port and a new watcher, so reconnecting
   * here is only about surviving transient drops on the same port.
   */
  private async runStream(path: string, dispatch: (payload: AnyFrame) => void): Promise<void> {
    let backoffMs = 1000;
    while (!this.stopped) {
      let opened = false;
      await new Promise<void>((resolve) => {
        let socket: WebSocket;
        try {
          socket = new WebSocket(`ws://127.0.0.1:${this.port}${path}`);
        } catch (err) {
          this.log?.(`${path} websocket constructor failed: ${String(err)}`);
          resolve();
          return;
        }
        this.sockets.add(socket);
        socket.onopen = () => {
          opened = true;
          backoffMs = 1000; // a working connection resets the backoff
        };
        socket.onmessage = (ev: MessageEvent) => {
          if (typeof ev.data !== "string") return;
          try {
            const envelope = JSON.parse(ev.data) as { payload?: Record<string, unknown> };
            if (envelope.payload && typeof envelope.payload.type === "string") {
              dispatch(envelope.payload as AnyFrame);
            }
          } catch {
            // one corrupt frame must not kill the stream — skip it, like the
            // official client's reader does
          }
        };
        socket.onclose = () => {
          this.sockets.delete(socket);
          resolve();
        };
        // onerror is always followed by onclose; nothing to do here
        socket.onerror = () => {};
      });
      if (this.stopped) return;
      this.log?.(`${path} stream ${opened ? "closed" : "failed to connect"} — reconnecting in ${backoffMs}ms`);
      await delay(backoffMs);
      backoffMs = Math.min(backoffMs * 2, 5000);
    }
  }

  private dispatchHost(payload: HostFrame, h: HarnessEventHandlers): void {
    const sessionId = typeof payload.sessionId === "string" ? payload.sessionId : "";
    switch (payload.type) {
      case "host/session-status":
        if (sessionId) h.onSessionStatus(sessionId, payload.running === true);
        break;
      case "host/agent-error":
        if (sessionId) h.onAgentError(sessionId, typeof payload.message === "string" ? payload.message : "");
        break;
      case "host/session-added":
        if (sessionId) h.onSessionAdded(sessionId, payload.origin === "subagent");
        break;
      case "host/session-removed":
        if (sessionId) h.onSessionRemoved(sessionId);
        break;
      default:
        break; // workspace / archived-sessions / remote-event — not shell-relevant
    }
  }

  private dispatchMux(payload: MuxFrame, h: HarnessEventHandlers): void {
    const sessionId = typeof payload.sessionId === "string" ? payload.sessionId : "";
    switch (payload.type) {
      case "approval/requested":
        if (sessionId) h.onApproval(sessionId, typeof payload.toolName === "string" ? payload.toolName : "");
        break;
      case "question/requested":
        if (sessionId) {
          h.onQuestion(sessionId, Array.isArray(payload.questions) ? payload.questions.length : 1);
        }
        break;
      case "session/projection":
        if (sessionId && typeof payload.key === "string") {
          h.onProjection(sessionId, payload.key, payload.value);
        }
        break;
      default:
        break; // session/event and friends are the web UI's business, not ours
    }
  }
}
