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
  });
  assert.deepEqual(out, {
    theme: "dark",
    language: "zh-CN",
    autoCheckUpdates: true,
    autoCheckShell: false,
    devtoolsOnStart: true,
    lastUpdateCheck: 123,
  });
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
