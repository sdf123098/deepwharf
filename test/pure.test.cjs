// Unit tests for the pure helpers (no Electron dependency).
// Run with: node --test test/
"use strict";

const test = require("node:test");
const assert = require("node:assert");
const {
  semverGt,
  sanitizeSettingsPatch,
  sanitizeWindowBounds,
  resolveTargetModules,
  parseDeepLink,
  parseTokenUsage,
  cacheHitRate,
  contextPercent,
  formatTokens,
} = require("../dist/main/pure.js");

// --- semverGt ---------------------------------------------------------------

test("semverGt: core version ordering", () => {
  assert.ok(semverGt("0.2.0", "0.1.0"));
  assert.ok(semverGt("1.0.0", "0.9.9"));
  assert.ok(!semverGt("0.1.0", "0.2.0"));
  assert.ok(!semverGt("1.0.0", "1.0.0"));
});

test("semverGt: prerelease vs release", () => {
  assert.ok(semverGt("0.1.0", "0.1.0-rc.1"));
  assert.ok(semverGt("0.1.0-rc.2", "0.1.0-rc.1"));
  assert.ok(!semverGt("0.1.0-rc.1", "0.1.0-rc.2"));
  assert.ok(!semverGt("0.1.0-rc.1", "0.1.0"));
});

test("semverGt: partial versions and garbage", () => {
  assert.ok(semverGt("0.10.0", "0.9.9"));
  assert.ok(!semverGt("abc", "0.1.0"));
  assert.ok(!semverGt("0.1.0", "nope"));
  assert.ok(semverGt("1.0.0-alpha.2", "1.0.0-alpha.1"));
  assert.ok(semverGt("1.0.0-beta.1", "1.0.0-alpha.9"));
  assert.ok(!semverGt("1.0.0-rc.1", "1.0.0"));
});

// --- sanitizeSettingsPatch --------------------------------------------------

test("sanitizeSettingsPatch: passes valid fields through", () => {
  const out = sanitizeSettingsPatch({
    theme: "dark",
    language: "zh-CN",
    autoCheckUpdates: true,
    autoCheckShell: false,
    devtoolsOnStart: true,
    lastUpdateCheck: 123,
    closeToTray: false,
    globalShortcutEnabled: true,
    autoLaunch: true,
    notificationsEnabled: false,
  });
  assert.deepEqual(out, {
    theme: "dark",
    language: "zh-CN",
    autoCheckUpdates: true,
    autoCheckShell: false,
    devtoolsOnStart: true,
    lastUpdateCheck: 123,
    closeToTray: false,
    globalShortcutEnabled: true,
    autoLaunch: true,
    notificationsEnabled: false,
  });
});

test("sanitizeSettingsPatch: drops non-boolean desktop-integration toggles", () => {
  assert.deepEqual(
    sanitizeSettingsPatch({ closeToTray: "yes", globalShortcutEnabled: 1, autoLaunch: null, notificationsEnabled: "on" }),
    {},
  );
});

test("sanitizeSettingsPatch: drops unknown fields, bad enums and bad types", () => {
  const out = sanitizeSettingsPatch({
    theme: "banana",
    language: {},
    autoCheckUpdates: "yes",
    unknownField: 123,
    lastShellCheck: "now",
  });
  assert.deepEqual(out, {});
});

test("sanitizeSettingsPatch: rejects non-objects", () => {
  assert.deepEqual(sanitizeSettingsPatch(null), {});
  assert.deepEqual(sanitizeSettingsPatch("x"), {});
  assert.deepEqual(sanitizeSettingsPatch(42), {});
  assert.deepEqual(sanitizeSettingsPatch(undefined), {});
});

// --- sanitizeWindowBounds -----------------------------------------------------

test("sanitizeWindowBounds: passes valid geometry through", () => {
  assert.deepStrictEqual(sanitizeWindowBounds({ x: 120, y: 80, width: 1400, height: 900 }), {
    x: 120,
    y: 80,
    width: 1400,
    height: 900,
  });
  assert.deepStrictEqual(sanitizeWindowBounds({ width: 1100, height: 760 }), {
    width: 1100,
    height: 760,
  });
});

test("sanitizeWindowBounds: rejects bad shapes and sub-floor sizes", () => {
  assert.strictEqual(sanitizeWindowBounds(undefined), undefined);
  assert.strictEqual(sanitizeWindowBounds(null), undefined);
  assert.strictEqual(sanitizeWindowBounds("120x80"), undefined);
  assert.strictEqual(sanitizeWindowBounds({ width: 200, height: 300 }), undefined); // below floor
  assert.strictEqual(sanitizeWindowBounds({ width: "1400", height: 900 }), undefined);
  assert.strictEqual(sanitizeWindowBounds({ width: 1400 }), undefined); // height missing
  assert.deepStrictEqual(sanitizeWindowBounds({ width: 1400, height: 900, x: "a", y: null }), {
    width: 1400,
    height: 900,
  });
  assert.strictEqual(sanitizeWindowBounds({ width: NaN, height: 900 }), undefined);
});

test("sanitizeSettingsPatch: filters a windowBounds record", () => {
  const out = sanitizeSettingsPatch({
    windowBounds: {
      main: { x: 10, y: 20, width: 1400, height: 900 },
      store: { width: 1100, height: 760 },
      broken: { width: 50, height: 50 },
      junk: "nope",
    },
  });
  assert.deepStrictEqual(out.windowBounds, {
    main: { x: 10, y: 20, width: 1400, height: 900 },
    store: { width: 1100, height: 760 },
  });
});

test("sanitizeSettingsPatch: theme accepts known ids only", () => {
  const ok = sanitizeSettingsPatch({ theme: "midnight" });
  assert.equal(ok.theme, "midnight");
  assert.deepEqual(sanitizeSettingsPatch({ theme: "neon-pink" }), {});
});

// --- token usage helpers --------------------------------------------------------

test("parseTokenUsage + cacheHitRate + contextPercent", () => {
  const u = parseTokenUsage({ uncachedInputTokens: 100, outputTokens: 50, cacheReadTokens: 300, cacheWriteTokens: 100 });
  assert.deepStrictEqual(u, { uncachedInputTokens: 100, outputTokens: 50, cacheReadTokens: 300, cacheWriteTokens: 100 });
  assert.strictEqual(cacheHitRate(u), 300 / 500);
  assert.strictEqual(cacheHitRate({ uncachedInputTokens: 0, outputTokens: 5, cacheReadTokens: 0, cacheWriteTokens: 0 }), null);
  assert.strictEqual(parseTokenUsage({ uncachedInputTokens: -1 }), null);
  assert.strictEqual(parseTokenUsage("nope"), null);
  assert.strictEqual(contextPercent({ projectedTokens: 64000, contextWindow: 128000 }), 0.5);
  assert.strictEqual(contextPercent({ pressureTokens: 256000, contextWindow: 128000 }), 1);
  assert.strictEqual(contextPercent({ projectedTokens: 10 }), null);
});

test("formatTokens: compact human units", () => {
  assert.strictEqual(formatTokens(0), "0");
  assert.strictEqual(formatTokens(999), "999");
  assert.strictEqual(formatTokens(1234), "1.2K");
  assert.strictEqual(formatTokens(999999), "1000K");
  assert.strictEqual(formatTokens(1234567), "1.2M");
  assert.strictEqual(formatTokens(234000000), "234M");
});

// --- parseDeepLink -------------------------------------------------------------

test("parseDeepLink: new with prompt and cwd, open/bare forms", () => {
  assert.deepStrictEqual(
    parseDeepLink("deepwharf://new?prompt=hello%20world&cwd=D%3A%5Cproj"),
    { prompt: "hello world", cwd: "D:\\proj" },
  );
  assert.deepStrictEqual(parseDeepLink("deepwharf://open"), {});
  assert.deepStrictEqual(parseDeepLink("deepwharf://"), {});
  assert.deepStrictEqual(parseDeepLink("deepwharf://new"), {});
});

test("parseDeepLink: rejects foreign schemes, unknown hosts, garbage", () => {
  assert.strictEqual(parseDeepLink("https://example.com"), null);
  assert.strictEqual(parseDeepLink("deepwharf://evil?prompt=x"), null);
  assert.strictEqual(parseDeepLink("not a url"), null);
  assert.strictEqual(parseDeepLink(""), null);
});

test("parseDeepLink: caps prompt length and refuses relative cwd", () => {
  const long = parseDeepLink(`deepwharf://new?prompt=${"a".repeat(3000)}`);
  assert.strictEqual(long.prompt.length, 2000);
  assert.deepStrictEqual(parseDeepLink("deepwharf://new?prompt=hi&cwd=relative\\path"), { prompt: "hi" });
  // empty prompt is treated as a bare link, not a prompt of ""
  assert.deepStrictEqual(parseDeepLink("deepwharf://new?prompt="), {});
});

// --- resolveTargetModules ---------------------------------------------------

test("resolveTargetModules: derives resources/harness/node_modules", () => {
  const p = resolveTargetModules(
    "C:/x/resources/harness/node_modules/@deepseek-ai/dsh/lib/bin.js",
  );
  assert.strictEqual(p, "C:/x/resources/harness/node_modules");
});

test("resolveTargetModules: throws on an unexpected layout", () => {
  assert.throws(() => resolveTargetModules("C:/x/some/other/bin.js"));
});
