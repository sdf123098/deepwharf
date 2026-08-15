// Unit tests for the pure helpers (no Electron dependency).
// Run with: node --test test/
"use strict";

const test = require("node:test");
const assert = require("node:assert");
const {
  semverGt,
  sanitizeSettingsPatch,
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
  assert.ok(semverGt("0.10.0", "0.9"));
  assert.ok(!semverGt("abc", "0.1.0"));
  assert.ok(semverGt("0.1.0", "nope"));
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
