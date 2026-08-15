// Unit tests for the Harness advanced-settings pure helpers (no Electron).
// Run with: node --test test/
"use strict";

const test = require("node:test");
const assert = require("node:assert");
const {
  classifyRetry,
  retryMatchesPreset,
  RETRY_PRESETS,
  DEFAULT_RETRYABLE_CODES,
  schemaHasField,
  describeToView,
  retryOps,
  timeoutOps,
  buildMutateOps,
} = require("../dist/main/harness-settings-core.js");

// --- fixtures ----------------------------------------------------------------

// Schemastery toJSON shape: { uid, refs: { [uid]: shape } }, nested schemas
// referenced by uid. `leaf` registers a bare scalar node so every dict value
// resolves (mirrors the real harness schema serialization).
function makeSchema(rootUid, build) {
  const refs = {};
  const leaf = (id) => {
    refs[id] = { type: "number", meta: {} };
    return id;
  };
  build(refs, leaf);
  return { uid: rootUid, refs };
}

const DEEPSEEK_SCHEMA = makeSchema("ds", (refs, leaf) => {
  refs.ds = {
    type: "object",
    meta: { default: {} },
    dict: {
      apiKeyEnv: leaf("ds-key"),
      baseURL: leaf("ds-base"),
      maxTokens: leaf("ds-max"),
      models: "ds-models",
      streamIdleTimeoutMs: "ds-sidle",
      retryPolicy: "ds-rp",
    },
  };
  refs["ds-models"] = { type: "array", inner: leaf("ds-model") };
  refs["ds-sidle"] = { type: "number", meta: { default: 300000 } };
  refs["ds-rp"] = { type: "union", list: ["ds-rp-normal", "ds-rp-always"] };
  refs["ds-rp-normal"] = {
    type: "object",
    dict: { mode: leaf("m1"), maxRetries: leaf("m2"), retryableCodes: "m3", backoff: "m4" },
  };
  refs["m3"] = { type: "array", inner: leaf("m3a") };
  refs["m4"] = {
    type: "object",
    dict: { initialDelayMs: leaf("b1"), maxDelayMs: leaf("b2"), jitterRatio: leaf("b3") },
  };
  refs["ds-rp-always"] = { type: "object", dict: { mode: leaf("a1"), backoff: "m4" } };
});

const PI_SCHEMA = makeSchema("pi", (refs, leaf) => {
  refs.pi = { type: "object", meta: { default: {} }, dict: { providers: "pi-prov" } };
  refs["pi-prov"] = { type: "dict", inner: "pi-profile" };
  refs["pi-profile"] = {
    type: "object",
    dict: {
      displayName: leaf("dn"),
      apiKeyEnv: leaf("ak"),
      timeoutMs: "pi-t",
      streamIdleTimeoutMs: "pi-sidle",
      websocketConnectTimeoutMs: "pi-ws",
      retryPolicy: "pi-rp",
    },
  };
  refs["pi-t"] = { type: "number", meta: {} };
  refs["pi-sidle"] = { type: "number", meta: { default: 300000 } };
  refs["pi-ws"] = { type: "number", meta: {} };
  refs["pi-rp"] = { type: "union", list: ["ds-rp-normal", "ds-rp-always"] };
});

const RECOMMENDED_RESOLVED = {
  mode: "normal",
  maxRetries: 6,
  retryableCodes: [...DEFAULT_RETRYABLE_CODES],
  backoff: { initialDelayMs: 1000, maxDelayMs: 15000, jitterRatio: 0.1 },
};

const ALWAYS_RESOLVED = {
  mode: "always",
  backoff: { initialDelayMs: 1000, maxDelayMs: 30000, jitterRatio: 0.1 },
};

function describeFixture(overrides = {}) {
  const base = {
    writable: true,
    hasDocument: true,
    namespaces: [
      {
        ns: "llm-deepseek",
        schema: DEEPSEEK_SCHEMA,
        value: { apiKeyEnv: "DEEPSEEK_API_KEY", maxTokens: 256000, streamIdleTimeoutMs: 300000 },
        applies: "live",
        revision: 3,
      },
      {
        ns: "llm-pi-ai",
        schema: PI_SCHEMA,
        value: {
          providers: {
            OpenRouter: {
              displayName: "OpenRouter",
              streamIdleTimeoutMs: 120000,
            },
            TokenRhythm: {},
          },
        },
        applies: "live",
        revision: 7,
      },
    ],
  };
  return { ...base, ...overrides };
}

// --- classifyRetry -----------------------------------------------------------

test("classifyRetry: no override -> harness-default", () => {
  assert.strictEqual(classifyRetry(undefined, false), "harness-default");
  assert.strictEqual(classifyRetry(RECOMMENDED_RESOLVED, false), "harness-default");
});

test("classifyRetry: exact preset match (resolved, defaulted retryableCodes)", () => {
  assert.strictEqual(classifyRetry(RECOMMENDED_RESOLVED, true), "recommended");
  assert.strictEqual(classifyRetry(ALWAYS_RESOLVED, true), "always");
  assert.strictEqual(
    classifyRetry(
      { mode: "normal", maxRetries: 8, retryableCodes: [...DEFAULT_RETRYABLE_CODES], backoff: { initialDelayMs: 1500, maxDelayMs: 30000, jitterRatio: 0.15 } },
      true,
    ),
    "unstable",
  );
});

test("classifyRetry: custom when anything deviates", () => {
  assert.strictEqual(classifyRetry({ mode: "normal", maxRetries: 12, backoff: RECOMMENDED_RESOLVED.backoff }, true), "custom");
  // custom retryableCodes disqualifies the preset even when the rest matches
  assert.strictEqual(
    classifyRetry({ ...RECOMMENDED_RESOLVED, retryableCodes: ["SERVER", "TIMEOUT"] }, true),
    "custom",
  );
  assert.strictEqual(classifyRetry("garbage", true), "custom");
});

test("retryMatchesPreset: always-mode policies omit maxRetries", () => {
  const always = RETRY_PRESETS.find((p) => p.id === "always");
  assert.ok(retryMatchesPreset(ALWAYS_RESOLVED, always));
  assert.ok(!retryMatchesPreset({ ...ALWAYS_RESOLVED, maxRetries: 5 }, always));
});

// --- schemaHasField ------------------------------------------------------------

test("schemaHasField: object + dict + union paths", () => {
  assert.ok(schemaHasField(DEEPSEEK_SCHEMA, ["streamIdleTimeoutMs"]));
  assert.ok(schemaHasField(DEEPSEEK_SCHEMA, ["retryPolicy"]));
  assert.ok(!schemaHasField(DEEPSEEK_SCHEMA, ["timeoutMs"]));
  assert.ok(!schemaHasField(DEEPSEEK_SCHEMA, ["websocketConnectTimeoutMs"]));
  assert.ok(schemaHasField(PI_SCHEMA, ["providers", "*", "timeoutMs"]));
  assert.ok(schemaHasField(PI_SCHEMA, ["providers", "*", "websocketConnectTimeoutMs"]));
  assert.ok(schemaHasField(PI_SCHEMA, ["providers", "*", "retryPolicy"]));
  assert.ok(!schemaHasField(PI_SCHEMA, ["providers", "*", "nope"]));
  assert.ok(!schemaHasField(PI_SCHEMA, ["providers", "*", "*", "timeoutMs"]));
});

test("schemaHasField: refuses malformed schemas", () => {
  assert.strictEqual(schemaHasField(undefined, ["a"]), false);
  assert.strictEqual(schemaHasField(null, ["a"]), false);
  assert.strictEqual(schemaHasField({ uid: 1, refs: {} }, ["a"]), false);
  assert.strictEqual(schemaHasField({ uid: "x", refs: { x: { type: "object", dict: {} } } }, ["a"]), false);
});

// --- describeToView -------------------------------------------------------------

test("describeToView: builds provider views with schema-driven capabilities", () => {
  const view = describeToView(describeFixture());
  assert.strictEqual(view.writable, true);
  assert.strictEqual(view.hasDocument, true);
  assert.strictEqual(view.providers.length, 3);

  const ds = view.providers.find((p) => p.kind === "deepseek");
  assert.deepStrictEqual(
    { id: ds.id, displayName: ds.displayName, ns: ds.ns, revision: ds.revision, applies: ds.applies },
    { id: "deepseek", displayName: "DeepSeek", ns: "llm-deepseek", revision: 3, applies: "live" },
  );
  // official DeepSeek: no timeoutMs / websocketConnectTimeoutMs in its schema
  assert.deepStrictEqual(ds.capabilities, {
    retryPolicy: true,
    timeoutMs: false,
    streamIdleTimeoutMs: true,
    websocketConnectTimeoutMs: false,
  });
  assert.strictEqual(ds.retryChoice, "harness-default");
  assert.strictEqual(ds.streamIdleTimeoutMs, 300000);
  assert.strictEqual(ds.timeoutMs, undefined);
  assert.strictEqual(ds.retryPolicy, undefined);

  const openRouter = view.providers.find((p) => p.id === "OpenRouter");
  assert.strictEqual(openRouter.kind, "pi-ai");
  assert.strictEqual(openRouter.displayName, "OpenRouter");
  assert.deepStrictEqual(openRouter.capabilities, {
    retryPolicy: true,
    timeoutMs: true,
    streamIdleTimeoutMs: true,
    websocketConnectTimeoutMs: true,
  });
  assert.strictEqual(openRouter.streamIdleTimeoutMs, 120000);
  assert.strictEqual(openRouter.timeoutMs, undefined);
  assert.strictEqual(openRouter.revision, 7);

  const tokenRhythm = view.providers.find((p) => p.id === "TokenRhythm");
  assert.strictEqual(tokenRhythm.displayName, "TokenRhythm"); // fallback to id
});

test("describeToView: user overrides drive the retry choice", () => {
  const fixture = describeFixture();
  fixture.namespaces[1].value.providers.OpenRouter.retryPolicy = RECOMMENDED_RESOLVED;
  fixture.namespaces[1].user = {
    providers: { OpenRouter: { retryPolicy: RECOMMENDED_RESOLVED } },
  };
  const view = describeToView(fixture);
  const openRouter = view.providers.find((p) => p.id === "OpenRouter");
  assert.strictEqual(openRouter.retryChoice, "recommended");

  fixture.namespaces[1].value.providers.OpenRouter.retryPolicy = { mode: "normal", maxRetries: 12 };
  fixture.namespaces[1].user = {
    providers: { OpenRouter: { retryPolicy: { mode: "normal", maxRetries: 12 } } },
  };
  const view2 = describeToView(fixture);
  assert.strictEqual(view2.providers.find((p) => p.id === "OpenRouter").retryChoice, "custom");
});

test("describeToView: deepseek user override and missing namespaces", () => {
  const fixture = describeFixture();
  fixture.namespaces[0].user = { retryPolicy: ALWAYS_RESOLVED };
  fixture.namespaces[0].value.retryPolicy = ALWAYS_RESOLVED;
  const view = describeToView(fixture);
  assert.strictEqual(view.providers.find((p) => p.kind === "deepseek").retryChoice, "always");

  const empty = describeToView({ writable: false, hasDocument: false, namespaces: [] });
  assert.strictEqual(empty.writable, false);
  assert.deepStrictEqual(empty.providers, []);
  assert.deepStrictEqual(describeToView(undefined).providers, []);
});

// --- mutate ops ---------------------------------------------------------------

test("retryOps: harness-default unsets, presets set, custom leaves untouched", () => {
  assert.deepStrictEqual(retryOps([], "harness-default"), [{ op: "unset", path: ["retryPolicy"] }]);
  assert.deepStrictEqual(retryOps(["providers", "OpenRouter"], "harness-default"), [
    { op: "unset", path: ["providers", "OpenRouter", "retryPolicy"] },
  ]);
  const [op] = retryOps([], "recommended");
  assert.strictEqual(op.op, "set");
  assert.deepStrictEqual(op.path, ["retryPolicy"]);
  assert.deepStrictEqual(op.value, RETRY_PRESETS.find((p) => p.id === "recommended").policy);
  assert.deepStrictEqual(retryOps([], "custom"), []);
});

test("timeoutOps: seconds to ms, null unsets", () => {
  assert.deepStrictEqual(timeoutOps([], "timeoutMs", 300), [
    { op: "set", path: ["timeoutMs"], value: 300000 },
  ]);
  assert.deepStrictEqual(timeoutOps([], "streamIdleTimeoutMs", 0.5), [
    { op: "set", path: ["streamIdleTimeoutMs"], value: 500 },
  ]);
  assert.deepStrictEqual(timeoutOps(["providers", "X"], "websocketConnectTimeoutMs", null), [
    { op: "unset", path: ["providers", "X", "websocketConnectTimeoutMs"] },
  ]);
});

test("buildMutateOps: combines edits, pi-ai paths prefixed, absent fields untouched", () => {
  const ops = buildMutateOps(
    { kind: "pi-ai", id: "OpenRouter" },
    { retry: "unstable", timeoutMsSec: null, streamIdleTimeoutMsSec: 120 },
  );
  assert.deepStrictEqual(ops, [
    { op: "set", path: ["providers", "OpenRouter", "retryPolicy"], value: RETRY_PRESETS.find((p) => p.id === "unstable").policy },
    { op: "unset", path: ["providers", "OpenRouter", "timeoutMs"] },
    { op: "set", path: ["providers", "OpenRouter", "streamIdleTimeoutMs"], value: 120000 },
  ]);
  assert.deepStrictEqual(
    buildMutateOps({ kind: "deepseek", id: "deepseek" }, { retry: "harness-default" }),
    [{ op: "unset", path: ["retryPolicy"] }],
  );
  assert.deepStrictEqual(buildMutateOps({ kind: "deepseek", id: "deepseek" }, { retry: "custom" }), []);
});
