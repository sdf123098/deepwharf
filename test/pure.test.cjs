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
  isShellThemeId,
  parseWebuiSnapshot,
  paletteFromWebui,
  sanitizeWebuiPalette,
  formatUsageSummary,
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

// --- web UI theme bridge ------------------------------------------------------

test("isShellThemeId: base ids and webui: ids", () => {
  for (const id of ["auto", "light", "dark", "midnight", "forest", "warm", "contrast"]) {
    assert.ok(isShellThemeId(id), id);
  }
  assert.ok(isShellThemeId("webui:solarized"));
  assert.ok(!isShellThemeId("webui:"));
  assert.ok(!isShellThemeId("webui:-bad"));
  assert.ok(!isShellThemeId("banana"));
  assert.ok(!isShellThemeId(""));
});

test("sanitizeSettingsPatch: accepts webui theme ids and pet fields", () => {
  const out = sanitizeSettingsPatch({
    theme: "webui:solarized",
    petEnabled: true,
    petSignEnabled: false,
    petPos: { x: 100.4, y: -50.6 },
    webuiLinked: true,
  });
  assert.deepEqual(out, {
    theme: "webui:solarized",
    petEnabled: true,
    petSignEnabled: false,
    petPos: { x: 100, y: -51 },
    webuiLinked: true,
  });
  assert.deepEqual(sanitizeSettingsPatch({ petPos: { x: "a", y: 1 }, petEnabled: "yes" }), {});
});

test("parseWebuiSnapshot: accepts a well-formed snapshot", () => {
  const snap = parseWebuiSnapshot({
    preference: "webui:solarized",
    activeId: "solarized",
    colorScheme: "dark",
    themes: [
      { id: "light", label: "Light", colorScheme: "light", builtin: true },
      { id: "dark", label: "Dark", colorScheme: "dark", builtin: true },
      { id: "midnight", label: "Midnight", colorScheme: "dark" },
      { id: "solarized", colorScheme: "dark" },
      { id: "solarized", colorScheme: "dark" }, // duplicate dropped
      { id: "system", colorScheme: "dark" }, // preference, not a theme
    ],
    tokens: {
      bgBase: "#0d1117",
      bgLayer1: " rgb(22, 27, 34) ",
      borderL2: "#21262d",
      labelPrimary: "#e6edf3",
      labelSecondary: "#8b949e",
      brandPrimary: "#4f8cff",
      evil: "javascript:alert(1)", // unknown key dropped
    },
  });
  assert.ok(snap);
  assert.strictEqual(snap.preference, "webui:solarized");
  assert.strictEqual(snap.activeId, "solarized");
  assert.strictEqual(snap.themes.length, 4);
  assert.strictEqual(snap.themes[1].builtin, true);
  assert.strictEqual(snap.themes[3].label, "solarized"); // label falls back to id
  assert.strictEqual(snap.tokens.bgLayer1, "rgb(22, 27, 34)"); // trimmed
  assert.strictEqual(snap.tokens.evil, undefined);
});

test("parseWebuiSnapshot: rejects malformed payloads", () => {
  assert.strictEqual(parseWebuiSnapshot(null), null);
  assert.strictEqual(parseWebuiSnapshot("x"), null);
  assert.strictEqual(parseWebuiSnapshot({ preference: "", activeId: "dark" }), null);
  assert.strictEqual(parseWebuiSnapshot({ preference: "dark", activeId: "dark", themes: [] }), null);
  assert.strictEqual(parseWebuiSnapshot({ preference: "dark", activeId: "dark", themes: "nope" }), null);
  // oversized garbage in every field still yields a safe snapshot or null
  const noisy = parseWebuiSnapshot({
    preference: "x".repeat(500),
    activeId: "dark",
    themes: [{ id: "dark", colorScheme: "dark" }],
    tokens: { bgBase: "#".repeat(500) },
  });
  assert.ok(noisy === null || (noisy.tokens.bgBase === undefined && noisy.preference.length <= 64));
});

test("paletteFromWebui: derives the shell palette from tokens", () => {
  const palette = paletteFromWebui({
    bgBase: "#0d1117",
    bgLayer1: "#161b22",
    borderL2: "#21262d",
    labelPrimary: "#e6edf3",
    labelSecondary: "#8b949e",
    brandPrimary: "#4f8cff",
  });
  assert.deepEqual(palette, {
    bg: "#0d1117",
    panel: "#161b22",
    border: "#21262d",
    text: "#e6edf3",
    muted: "#8b949e",
    accent: "#4f8cff",
  });
  assert.strictEqual(paletteFromWebui({ bgBase: "#000" }), undefined); // missing keys
});

test("sanitizeWebuiPalette: round-trips good palettes, drops bad ones", () => {
  const p = { bg: "#fff", panel: "#eee", border: "#ddd", text: "#111", muted: "#666", accent: "#00f" };
  assert.deepEqual(sanitizeWebuiPalette(p), p);
  assert.strictEqual(sanitizeWebuiPalette({ ...p, accent: "javascript:x" }), undefined);
  assert.strictEqual(sanitizeWebuiPalette(null), undefined);
});

// --- usage summary (pet sign) --------------------------------------------------

test("formatUsageSummary: compact zh/en lines with all metrics", () => {
  const usage = { uncachedInputTokens: 2_300, outputTokens: 45_000, cacheReadTokens: 77_000, cacheWriteTokens: 700 };
  const pressure = { projectedTokens: 84_000, contextWindow: 200_000 };
  assert.strictEqual(
    formatUsageSummary(usage, pressure, "zh-CN"),
    "输入 80.0K · 输出 45.0K · 缓存 96.3% · 上下文 42.0%",
  );
  assert.strictEqual(
    formatUsageSummary(usage, pressure, "en-US"),
    "in 80.0K · out 45.0K · cache 96.3% · ctx 42.0%",
  );
});

test("formatUsageSummary: partial data and empty states", () => {
  const usage = { uncachedInputTokens: 900, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 };
  assert.strictEqual(formatUsageSummary(usage, null, "zh-CN"), "输入 900 · 输出 0 · 缓存 0.0%");
  assert.strictEqual(formatUsageSummary(null, null, "zh-CN"), "还没有用量");
  assert.strictEqual(formatUsageSummary(null, null, "en-US"), "no usage yet");
});
