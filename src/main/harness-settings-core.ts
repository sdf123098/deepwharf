/**
 * Pure helpers for the Harness advanced-settings window. No Electron (or any
 * other runtime-only dependency) — unit-tested in plain Node, see
 * test/harness-settings-core.test.cjs. Shapes mirror the wire contract of
 * `settings.describe` / `settings.mutate` (dsh-host-apiproxy) and the
 * llm-deepseek / llm-pi-ai namespaces.
 */

/** The harness fills these in when a retryPolicy omits retryableCodes. */
export const DEFAULT_RETRYABLE_CODES = [
  "EMPTY_RESPONSE",
  "RATE_LIMIT",
  "SERVER",
  "TIMEOUT",
  "TRANSPORT",
];

export interface RetryBackoff {
  initialDelayMs: number;
  maxDelayMs: number;
  jitterRatio: number;
}

export interface RetryPolicy {
  mode: "normal" | "always";
  maxRetries?: number;
  retryableCodes?: string[];
  backoff?: RetryBackoff;
}

export type RetryPresetId = "recommended" | "unstable" | "always";

/** What the retry selector shows: a preset, the harness default, or an unmapped custom policy. */
export type RetryChoice = RetryPresetId | "harness-default" | "custom";

export interface RetryPreset {
  id: RetryPresetId;
  /** The value written to settings; retryableCodes is omitted and harness-defaulted. */
  policy: RetryPolicy;
}

export const RETRY_PRESETS: RetryPreset[] = [
  {
    id: "recommended",
    policy: {
      mode: "normal",
      maxRetries: 6,
      backoff: { initialDelayMs: 1000, maxDelayMs: 15000, jitterRatio: 0.1 },
    },
  },
  {
    id: "unstable",
    policy: {
      mode: "normal",
      maxRetries: 8,
      backoff: { initialDelayMs: 1500, maxDelayMs: 30000, jitterRatio: 0.15 },
    },
  },
  {
    id: "always",
    policy: {
      mode: "always",
      backoff: { initialDelayMs: 1000, maxDelayMs: 30000, jitterRatio: 0.1 },
    },
  },
];

export interface PathOp {
  op: "set" | "unset";
  path: string[];
  value?: unknown;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function sameStringArray(a: unknown, b: readonly string[]): boolean {
  return (
    Array.isArray(a) && a.length === b.length && b.every((s, i) => a[i] === s)
  );
}

function sameBackoff(a: unknown, b: RetryBackoff): boolean {
  const x = isRecord(a) ? a : undefined;
  return (
    x !== undefined &&
    x.initialDelayMs === b.initialDelayMs &&
    x.maxDelayMs === b.maxDelayMs &&
    x.jitterRatio === b.jitterRatio
  );
}

/** Whether one resolved retryPolicy is exactly a preset (retryableCodes must still be the default). */
export function retryMatchesPreset(resolved: unknown, preset: RetryPreset): boolean {
  const p = isRecord(resolved) ? resolved : undefined;
  if (!p || p.mode !== preset.policy.mode) return false;
  if (preset.policy.mode === "normal") {
    if (p.maxRetries !== preset.policy.maxRetries) return false;
    if (!sameStringArray(p.retryableCodes, DEFAULT_RETRYABLE_CODES)) return false;
  } else if (p.maxRetries !== undefined) {
    // "always" mode must omit maxRetries (the harness schema rejects it).
    return false;
  }
  return sameBackoff(p.backoff, preset.policy.backoff!);
}

/**
 * Classify a provider's retry policy for the selector. `hasOverride` comes from
 * the raw user layer (presence in settings.yaml), `resolved` from the resolved
 * value (defaults applied). Without an override we must not write anything:
 * "harness-default" unsets the key instead of freezing the harness's own
 * current defaults.
 */
export function classifyRetry(resolved: unknown, hasOverride: boolean): RetryChoice {
  if (!hasOverride) return "harness-default";
  for (const preset of RETRY_PRESETS) {
    if (retryMatchesPreset(resolved, preset)) return preset.id;
  }
  return "custom";
}

// --- schema capability walker -------------------------------------------------
// `settings.describe` returns each namespace's schema as schemastery's
// toJSON(): { uid, refs: { [uid]: shape } }. Shapes are
// { type, dict?, inner?, list?, meta? } with nested schemas referenced by uid
// (numeric or string). We only need to answer "does this path exist", so the
// walker stays deliberately small and refuses unknown structures.

export interface SchemaJson {
  uid: string | number;
  refs: Record<string, unknown>;
}

function resolveNode(schema: SchemaJson, ref: unknown): Record<string, unknown> | undefined {
  if (isRecord(ref) && typeof ref.type === "string") return ref;
  if ((typeof ref === "string" || typeof ref === "number") && isRecord(schema.refs[String(ref)])) {
    return schema.refs[String(ref)] as Record<string, unknown>;
  }
  return undefined;
}

function hasPath(schema: SchemaJson, ref: unknown, path: readonly string[]): boolean {
  const node = resolveNode(schema, ref);
  if (!node) return false;
  if (path.length === 0) return true;
  const [head, ...rest] = path;
  switch (node.type) {
    case "union": {
      const list = Array.isArray(node.list) ? node.list : [];
      return list.some((branch) => hasPath(schema, branch, path));
    }
    case "lazy":
      return hasPath(schema, node.inner, path);
    case "object": {
      const dict = isRecord(node.dict) ? node.dict : undefined;
      if (!dict || !(head in dict)) return false;
      return hasPath(schema, dict[head], rest);
    }
    case "dict":
    case "array":
      // "*" descends into the dict/array value schema without naming a key.
      return head === "*" && hasPath(schema, node.inner, rest);
    default:
      return false;
  }
}

/** Whether a namespace schema declares the field at `path` (see walker above). */
export function schemaHasField(schema: unknown, path: readonly string[]): boolean {
  if (!isRecord(schema)) return false;
  const s = schema as unknown as SchemaJson;
  if (!isRecord(s.refs) || typeof s.uid !== "string" && typeof s.uid !== "number") return false;
  return hasPath(s, s.uid, path);
}

// --- credential-ref discovery --------------------------------------------------
// dsh marks credential-reference fields (the apiKeyEnv family) with
// schemastery's .role("credential-ref"), which lands in the schema node's
// meta and survives settings.describe's toJSON. Walking every namespace for
// that marker gives the shell the exact set of credential names the harness
// will look up — no hardcoded DEEPSEEK_API_KEY.

/** Collect the value paths of every field whose meta.role is "credential-ref". */
export function credentialRefPaths(schema: unknown): string[][] {
  if (!isRecord(schema)) return [];
  const s = schema as unknown as SchemaJson;
  if (!isRecord(s.refs) || (typeof s.uid !== "string" && typeof s.uid !== "number")) return [];
  const out: string[][] = [];
  const visit = (ref: unknown, path: string[], depth: number): void => {
    if (depth > 8) return; // defensive: cycles via lazy refs
    const node = resolveNode(s, ref);
    if (!node) return;
    const meta = isRecord(node.meta) ? node.meta : undefined;
    if (meta?.role === "credential-ref") {
      out.push(path); // the leaf is the ref-name string; nothing deeper matters
      return;
    }
    switch (node.type) {
      case "union": {
        const list = Array.isArray(node.list) ? node.list : [];
        for (const branch of list) visit(branch, path, depth + 1);
        break;
      }
      case "lazy":
        visit(node.inner, path, depth + 1);
        break;
      case "object": {
        const dict = isRecord(node.dict) ? node.dict : {};
        for (const [key, child] of Object.entries(dict)) visit(child, [...path, key], depth + 1);
        break;
      }
      case "dict":
      case "array":
        visit(node.inner, [...path, "*"], depth + 1);
        break;
      default:
        break;
    }
  };
  visit(s.uid, [], 0);
  return out;
}

/** Values present at a schema-shaped path; "*" fans out over a record's keys. */
export function valuesAtPath(value: unknown, path: readonly string[]): unknown[] {
  let current: unknown[] = [value];
  for (const seg of path) {
    const next: unknown[] = [];
    for (const v of current) {
      if (seg === "*") {
        if (isRecord(v)) next.push(...Object.values(v));
      } else if (isRecord(v) && seg in v) {
        next.push(v[seg]);
      }
    }
    current = next;
  }
  return current;
}

const CREDENTIAL_REF_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

/**
 * The concrete credential reference names a settings.describe response
 * declares: every credential-ref field whose resolved value is a ref-shaped
 * string (e.g. "DEEPSEEK_API_KEY"). A provider that never had its apiKeyEnv
 * set has no value to read and stays invisible until configured in settings.
 */
export function discoverCredentialRefs(describe: unknown): string[] {
  const root = isRecord(describe) ? describe : undefined;
  const namespaces = Array.isArray(root?.namespaces) ? root.namespaces : [];
  const refs = new Set<string>();
  for (const n of namespaces) {
    if (!isRecord(n)) continue;
    const value = isRecord(n.value) ? n.value : undefined;
    for (const path of credentialRefPaths(n.schema)) {
      for (const v of valuesAtPath(value, path)) {
        if (typeof v === "string" && CREDENTIAL_REF_RE.test(v)) refs.add(v);
      }
    }
  }
  return [...refs].sort();
}

// --- provider view -------------------------------------------------------------

export type ProviderKind = "deepseek" | "pi-ai";
export type HarnessNamespace = "llm-deepseek" | "llm-pi-ai";

export interface ProviderCapabilities {
  retryPolicy: boolean;
  timeoutMs: boolean;
  streamIdleTimeoutMs: boolean;
  websocketConnectTimeoutMs: boolean;
}

export interface ProviderView {
  /** "deepseek" for the official provider, or the pi-ai provider id. */
  id: string;
  displayName: string;
  kind: ProviderKind;
  ns: HarnessNamespace;
  revision: number;
  applies: "live" | "restart";
  /** Classified selector state; presets are matched against the resolved policy. */
  retryChoice: RetryChoice;
  /** Resolved (redacted, defaults applied) policy, when the schema has one. */
  retryPolicy?: unknown;
  /** Resolved value in milliseconds, when present. */
  timeoutMs?: number;
  streamIdleTimeoutMs?: number;
  websocketConnectTimeoutMs?: number;
  capabilities: ProviderCapabilities;
}

export interface HarnessSettingsView {
  writable: boolean;
  hasDocument: boolean;
  providers: ProviderView[];
}

interface NamespaceDescriptor {
  schema?: unknown;
  value?: unknown;
  user?: unknown;
  applies?: unknown;
  revision?: unknown;
}

function findNamespace(describe: unknown, name: string): NamespaceDescriptor | undefined {
  const root = isRecord(describe) ? describe : undefined;
  const namespaces = Array.isArray(root?.namespaces) ? root.namespaces : [];
  for (const n of namespaces) {
    if (isRecord(n) && n.ns === name) return n as NamespaceDescriptor;
  }
  return undefined;
}

function numberOrUndefined(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

function appliesOrLive(v: unknown): "live" | "restart" {
  return v === "restart" ? "restart" : "live";
}

function deepseekCaps(schema: unknown): ProviderCapabilities {
  return {
    retryPolicy: schemaHasField(schema, ["retryPolicy"]),
    timeoutMs: schemaHasField(schema, ["timeoutMs"]),
    streamIdleTimeoutMs: schemaHasField(schema, ["streamIdleTimeoutMs"]),
    websocketConnectTimeoutMs: schemaHasField(schema, ["websocketConnectTimeoutMs"]),
  };
}

function piAiCaps(schema: unknown): ProviderCapabilities {
  return {
    retryPolicy: schemaHasField(schema, ["providers", "*", "retryPolicy"]),
    timeoutMs: schemaHasField(schema, ["providers", "*", "timeoutMs"]),
    streamIdleTimeoutMs: schemaHasField(schema, ["providers", "*", "streamIdleTimeoutMs"]),
    websocketConnectTimeoutMs: schemaHasField(schema, ["providers", "*", "websocketConnectTimeoutMs"]),
  };
}

function buildProviderView(opts: {
  id: string;
  displayName: string;
  kind: ProviderKind;
  ns: HarnessNamespace;
  revision: number;
  applies: "live" | "restart";
  capabilities: ProviderCapabilities;
  resolved: Record<string, unknown> | undefined;
  user: Record<string, unknown> | undefined;
}): ProviderView {
  const { resolved, user } = opts;
  const override = (field: string): boolean => user?.[field] !== undefined;
  const view: ProviderView = {
    id: opts.id,
    displayName: opts.displayName,
    kind: opts.kind,
    ns: opts.ns,
    revision: opts.revision,
    applies: opts.applies,
    retryChoice: classifyRetry(resolved?.retryPolicy, override("retryPolicy")),
    capabilities: opts.capabilities,
  };
  if (opts.capabilities.retryPolicy) view.retryPolicy = resolved?.retryPolicy;
  if (opts.capabilities.timeoutMs) view.timeoutMs = numberOrUndefined(resolved?.timeoutMs);
  if (opts.capabilities.streamIdleTimeoutMs) {
    view.streamIdleTimeoutMs = numberOrUndefined(resolved?.streamIdleTimeoutMs);
  }
  if (opts.capabilities.websocketConnectTimeoutMs) {
    view.websocketConnectTimeoutMs = numberOrUndefined(resolved?.websocketConnectTimeoutMs);
  }
  return view;
}

/**
 * Normalize a `settings.describe` response into the view the renderer needs.
 * Only the two llm namespaces are extracted; everything else (secrets, schema
 * internals, unrelated namespaces) never crosses into the window.
 */
export function describeToView(describe: unknown): HarnessSettingsView {
  const root = isRecord(describe) ? describe : undefined;
  const providers: ProviderView[] = [];

  const deepseek = findNamespace(describe, "llm-deepseek");
  if (deepseek) {
    providers.push(
      buildProviderView({
        id: "deepseek",
        displayName: "DeepSeek",
        kind: "deepseek",
        ns: "llm-deepseek",
        revision: typeof deepseek.revision === "number" ? deepseek.revision : 0,
        applies: appliesOrLive(deepseek.applies),
        capabilities: deepseekCaps(deepseek.schema),
        resolved: isRecord(deepseek.value) ? deepseek.value : undefined,
        user: isRecord(deepseek.user) ? deepseek.user : undefined,
      }),
    );
  }

  const pi = findNamespace(describe, "llm-pi-ai");
  if (pi) {
    const caps = piAiCaps(pi.schema);
    const value = isRecord(pi.value) ? pi.value : undefined;
    const providerMap = isRecord(value?.providers) ? value.providers : undefined;
    const user = isRecord(pi.user) ? pi.user : undefined;
    const userMap = isRecord(user?.providers) ? user.providers : undefined;
    for (const id of Object.keys(providerMap ?? {})) {
      providers.push(
        buildProviderView({
          id,
          displayName:
            (isRecord(providerMap?.[id]) && typeof providerMap![id].displayName === "string"
              ? providerMap![id].displayName
              : undefined) ?? id,
          kind: "pi-ai",
          ns: "llm-pi-ai",
          revision: typeof pi.revision === "number" ? pi.revision : 0,
          applies: appliesOrLive(pi.applies),
          capabilities: caps,
          resolved: isRecord(providerMap?.[id]) ? (providerMap![id] as Record<string, unknown>) : undefined,
          user: isRecord(userMap?.[id]) ? (userMap![id] as Record<string, unknown>) : undefined,
        }),
      );
    }
  }

  return {
    writable: root?.writable === true,
    hasDocument: root?.hasDocument === true,
    providers,
  };
}

// --- mutate payloads -----------------------------------------------------------

/** Path ops for a retry choice; "custom" never touches the stored policy. */
export function retryOps(basePath: readonly string[], choice: RetryChoice): PathOp[] {
  if (choice === "harness-default") {
    return [{ op: "unset", path: [...basePath, "retryPolicy"] }];
  }
  if (choice === "custom") return [];
  const preset = RETRY_PRESETS.find((p) => p.id === choice);
  if (!preset) return [];
  return [{ op: "set", path: [...basePath, "retryPolicy"], value: preset.policy }];
}

/** Path ops for one millisecond-precision field; `seconds: null` removes the override. */
export function timeoutOps(basePath: readonly string[], field: string, seconds: number | null): PathOp[] {
  if (seconds === null) return [{ op: "unset", path: [...basePath, field] }];
  return [{ op: "set", path: [...basePath, field], value: Math.round(seconds * 1000) }];
}

/** Fields the renderer may edit in one mutate; absent keys are left untouched. */
export interface ProviderEdit {
  retry?: RetryChoice;
  timeoutMsSec?: number | null;
  streamIdleTimeoutMsSec?: number | null;
  websocketConnectTimeoutMsSec?: number | null;
}

/** Combine edits into one ordered op list against the provider's section path. */
export function buildMutateOps(provider: { kind: ProviderKind; id: string }, edit: ProviderEdit): PathOp[] {
  const base: string[] = provider.kind === "pi-ai" ? ["providers", provider.id] : [];
  const ops: PathOp[] = [];
  if (edit.retry !== undefined) ops.push(...retryOps(base, edit.retry));
  if (edit.timeoutMsSec !== undefined) ops.push(...timeoutOps(base, "timeoutMs", edit.timeoutMsSec));
  if (edit.streamIdleTimeoutMsSec !== undefined) {
    ops.push(...timeoutOps(base, "streamIdleTimeoutMs", edit.streamIdleTimeoutMsSec));
  }
  if (edit.websocketConnectTimeoutMsSec !== undefined) {
    ops.push(...timeoutOps(base, "websocketConnectTimeoutMs", edit.websocketConnectTimeoutMsSec));
  }
  return ops;
}
