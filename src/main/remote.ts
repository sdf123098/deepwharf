/**
 * Remote control: a token-gated HTTP + SSE server in the main process.
 *
 * Lets a phone or another computer drive the Harness agent over the LAN:
 * list/create sessions, send prompts, interrupt runs, switch models, read
 * history, approve/deny tool calls, answer questions, and stream live events.
 * The harness itself stays bound to loopback — this server translates every
 * call into the official harness RPC (`/api/<method>`) and the event watcher's
 * frames it already consumes. Everything is opt-in (Settings → 远程控制).
 */
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { readSettings } from "./settings";
import { harnessRpc, HarnessSettingsError } from "./harness-settings";
import { normalizeSessions } from "./sessions-browser";
import { formatUsageSummary, parseTokenUsage } from "./pure";

// --- state -------------------------------------------------------------------

let server: Server | null = null;
let listening = false;
let boundPort = 0;
let getPort: () => number = () => 0;
let onLog: (m: string) => void = () => {};
const sseClients = new Set<ServerResponse>();

// --- pending approvals / questions (fed by the event watcher) ----------------

export interface PendingApproval {
  approvalId: string;
  sessionId: string;
  toolName: string;
  callId?: string;
  reason?: string;
  at: number;
}
export interface PendingQuestion {
  key: string;
  sessionId: string;
  questions: Array<{ id: string; prompt?: string; options?: string[] }>;
  at: number;
}
const approvals = new Map<string, PendingApproval>();
const questions = new Map<string, PendingQuestion>();

export function addApproval(a: PendingApproval): void {
  approvals.set(a.approvalId, a);
  broadcast({ type: "approval", ...a });
}
export function resolveApproval(approvalId: string, outcome: string): void {
  if (approvals.delete(approvalId)) broadcast({ type: "approval-resolved", approvalId, outcome });
}
export function addQuestion(q: PendingQuestion): void {
  questions.set(q.key, q);
  broadcast({ type: "question", ...q });
}
export function resolveQuestion(key: string): void {
  if (questions.delete(key)) broadcast({ type: "question-resolved", key });
}

/** Live frame from the harness watcher (session status / projections). */
export function notifyRemote(type: string, payload: Record<string, unknown>): void {
  broadcast({ type, ...payload });
}

function broadcast(ev: Record<string, unknown>): void {
  const line = `data: ${JSON.stringify(ev)}\n\n`;
  for (const res of [...sseClients]) {
    try {
      res.write(line);
    } catch {
      sseClients.delete(res);
    }
  }
}

// --- auth --------------------------------------------------------------------

function tokenOk(req: IncomingMessage): boolean {
  const want = readSettings().remoteToken;
  if (!want) return false;
  const auth = req.headers.authorization ?? "";
  if (auth === `Bearer ${want}`) return true;
  const u = new URL(req.url ?? "/", "http://x");
  return u.searchParams.get("token") === want;
}

function json(res: ServerResponse, status: number, body: unknown): void {
  const data = JSON.stringify(body);
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  res.end(data);
}

// --- harness helpers ----------------------------------------------------------

async function rpc(method: string, payload: unknown): Promise<unknown> {
  return harnessRpc(getPort(), method, payload);
}

async function handleApi(method: string, url: URL, req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await new Promise<string>((resolve) => {
    let data = "";
    req.on("data", (c: Buffer) => (data += c.toString()));
    req.on("end", () => resolve(data));
  });
  let parsed: unknown = {};
  if (body !== "") {
    try {
      parsed = JSON.parse(body);
    } catch {
      json(res, 400, { error: "bad json" });
      return;
    }
  }
  const p = (parsed ?? {}) as Record<string, unknown>;

  const ok = (value: unknown) => json(res, 200, { ok: true, value });
  const fail = (err: unknown) =>
    json(res, 200, { ok: false, error: err instanceof HarnessSettingsError ? err.message : String(err) });

  try {
    switch (method) {
      case "GET /api/status":
        ok({ version: readSettings().remoteEnabled ? "ok" : "disabled" });
        return;
      case "GET /api/sessions":
        ok(normalizeSessions(await rpc("session.list", {})));
        return;
      case "POST /api/sessions":
        ok(await rpc("session.create", typeof p.cwd === "string" ? { cwd: p.cwd } : {}));
        return;
      case "POST /api/sessions/:id/prompt": {
        const text = typeof p.text === "string" ? p.text.slice(0, 100_000) : "";
        if (!text) return json(res, 400, { error: "text required" });
        ok(await rpc("session.prompt", { sessionId: url.pathname.split("/")[3], mode: "queue", content: [{ type: "text", text }] }));
        return;
      }
      case "POST /api/sessions/:id/cancel":
        ok(await rpc("session.cancel", { sessionId: url.pathname.split("/")[3] }));
        return;
      case "GET /api/sessions/:id/history": {
        const max = typeof p.max === "number" ? p.max : 50;
        ok(await rpc("session.history", { sessionId: url.pathname.split("/")[3], maxMessages: Math.min(200, Math.max(1, max)) }));
        return;
      }
      case "GET /api/sessions/:id/models":
        ok(await rpc("session.models", { sessionId: url.pathname.split("/")[3] }));
        return;
      case "POST /api/sessions/:id/model":
        if (typeof p.provider !== "string" || typeof p.model !== "string") return json(res, 400, { error: "provider+model required" });
        ok(await rpc("session.selectModel", { sessionId: url.pathname.split("/")[3], provider: p.provider, model: p.model }));
        return;
      case "GET /api/approvals":
        ok([...approvals.values()]);
        return;
      case "POST /api/approvals/:id": {
        const approval = approvals.get(url.pathname.split("/")[3]);
        if (!approval) return json(res, 404, { error: "no such approval (already resolved?)" });
        const outcome = p.outcome === "rejected" ? "rejected" : "allowed-once";
        await respondEnvelope({ sessionId: approval.sessionId, approvalId: approval.approvalId, outcome });
        resolveApproval(approval.approvalId, outcome);
        ok({ resolved: approval.approvalId, outcome });
        return;
      }
      case "GET /api/questions":
        ok([...questions.values()]);
        return;
      case "POST /api/questions/:key": {
        const q = questions.get(url.pathname.split("/")[3]);
        if (!q) return json(res, 404, { error: "no such question (already answered?)" });
        const text = typeof p.text === "string" ? p.text.slice(0, 20_000) : "";
        if (text === "__reject__") {
          await respondError({ sessionId: q.sessionId, code: "cancelled", message: "the user closed this request remotely" });
        } else {
          const answers = q.questions.map((qq) => ({ id: qq.id, selected: [], ...(text ? { custom: text } : {}) }));
          await respondEnvelope({ sessionId: q.sessionId, answer: { answers } });
        }
        resolveQuestion(q.key);
        ok({ resolved: q.key });
        return;
      }
      case "GET /api/usage": {
        const rows = normalizeSessions(await rpc("session.list", {}));
        const withUsage = rows.filter((r) => r.usage);
        const latest = [...withUsage].sort((a, b) => b.updatedAt - a.updatedAt)[0] ?? null;
        ok({
          sessions: rows.map((r) => ({
            sessionId: r.sessionId,
            title: r.title,
            running: r.running,
            usage: r.usage,
            pressure: r.pressure,
          })),
          summary: latest ? formatUsageSummary(latest.usage ?? null, null, "en-US") : null,
        });
        return;
      }
      case "GET /api/events": {
        res.writeHead(200, {
          "content-type": "text/event-stream",
          "cache-control": "no-cache",
          connection: "keep-alive",
        });
        res.write("retry: 3000\n\n");
        sseClients.add(res);
        req.on("close", () => sseClients.delete(res));
        return; // stream stays open
      }
      default:
        json(res, 404, { error: "not found" });
    }
  } catch (err) {
    fail(err);
  }
}

/** POST /api/respond with a client-response envelope (approval / question). */
async function respondEnvelope(value: unknown): Promise<void> {
  await postRespond({ ok: true, value });
}

/** POST /api/respond with an error result (question cancelled remotely). */
async function respondError(value: { sessionId: string; code: string; message: string }): Promise<void> {
  await postRespond({ ok: false, error: { code: value.code, message: value.message, details: {} } });
}

async function postRespond(result: unknown): Promise<void> {
  const res = await fetch(`http://127.0.0.1:${getPort()}/api/respond`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ type: "client-response", rpcId: randomUUID(), result }),
    signal: AbortSignal.timeout(10000),
  });
  const parsed = (await res.json()) as { accepted?: boolean; reason?: string };
  if (parsed.accepted !== true) throw new Error(`respond rejected: ${parsed.reason ?? "?"}`);
}

// --- lifecycle ----------------------------------------------------------------

export function remoteRunning(): { running: boolean; port: number } {
  return { running: listening, port: boundPort };
}

/** Start (or restart) the server if enabled in settings. */
export function startRemote(getPortFn: () => number, log: (m: string) => void): void {
  getPort = getPortFn;
  onLog = log;
  stopRemote();
  const settings = readSettings();
  if (!settings.remoteEnabled) return;
  const want = settings.remotePort || 0;
  const host = "0.0.0.0";
  server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://x");
    const path = url.pathname;

    // Static console page (no auth — it is the login surface).
    if (req.method === "GET" && path === "/") {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(readFileSync(join(__dirname, "../../resources/remote.html")));
      return;
    }
    if (req.method === "GET" && path === "/remote.js") {
      res.writeHead(200, { "content-type": "text/javascript; charset=utf-8" });
      res.end(readFileSync(join(__dirname, "../../resources/remote.js")));
      return;
    }
    if (req.method === "GET" && path === "/remote.css") {
      res.writeHead(200, { "content-type": "text/css; charset=utf-8" });
      res.end(readFileSync(join(__dirname, "../../resources/remote.css")));
      return;
    }
    if (path.startsWith("/api/events")) {
      if (!tokenOk(req)) return json(res, 401, { error: "unauthorized" });
      void handleApi("GET /api/events", url, req, res);
      return;
    }
    if (!path.startsWith("/api/")) {
      json(res, 404, { error: "not found" });
      return;
    }
    if (!tokenOk(req)) return json(res, 401, { error: "unauthorized" });

    const method = `${req.method} ${path}`;
    const dynamic = ["/api/sessions/:id/prompt", "/api/sessions/:id/cancel", "/api/sessions/:id/history", "/api/sessions/:id/models", "/api/sessions/:id/model", "/api/approvals/:id", "/api/questions/:key"];
    if (method === "GET /api/status" || method === "GET /api/sessions" || method === "POST /api/sessions" ||
        method === "GET /api/approvals" || method === "GET /api/questions" || method === "GET /api/usage") {
      void handleApi(method, url, req, res);
      return;
    }
    for (const d of dynamic) {
      const dSeg = d.split(" ")[1].split("/");
      const pSeg = path.split("/");
      if (d.split(" ")[0] !== req.method || dSeg.length !== pSeg.length) continue;
      let match = true;
      for (let i = 0; i < dSeg.length; i++) {
        if (dSeg[i].startsWith(":")) continue;
        if (dSeg[i] !== pSeg[i]) {
          match = false;
          break;
        }
      }
      if (match) {
        void handleApi(d, url, req, res);
        return;
      }
    }
    json(res, 404, { error: "not found" });
  });
  server.on("error", (err: Error) => {
    onLog(`remote server error: ${String(err)}`);
    listening = false;
    server = null;
  });
  server.listen(want, host, () => {
    const addr = server?.address();
    boundPort = typeof addr === "object" && addr ? addr.port : want;
    listening = true;
    onLog(`remote control listening on :${boundPort}`);
  });
}

export function stopRemote(): void {
  for (const res of [...sseClients]) {
    try {
      res.end();
    } catch {
      // already closed
    }
  }
  sseClients.clear();
  if (server) {
    server.close();
    server = null;
  }
  listening = false;
}
