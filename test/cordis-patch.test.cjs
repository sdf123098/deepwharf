// Unit tests for the cordis.patch.yml managed-block helpers and dump parser.
"use strict";

const test = require("node:test");
const assert = require("node:assert");
const {
  splitManaged,
  withManaged,
  removeGroup,
  appendGroup,
  yamlScalar,
  renderMcpInsert,
  parseDumpConfig,
  MANAGED_BEGIN,
  MANAGED_END,
} = require("../dist/main/cordis-patch.js");

const USER_CONTENT = "# my own patch\n- id: ui-skin-miku\n  disabled: true\n";

test("splitManaged / withManaged round-trip preserves user content", () => {
  const empty = splitManaged(USER_CONTENT);
  assert.strictEqual(empty.body, "");

  const withBlock = withManaged(USER_CONTENT, "- id: a\n  disabled: true", "");
  assert.ok(withBlock.includes(USER_CONTENT.trim()));
  assert.ok(withBlock.includes(MANAGED_BEGIN) && withBlock.includes(MANAGED_END));

  const again = splitManaged(withBlock);
  assert.strictEqual(again.body, "- id: a\n  disabled: true");
  assert.ok(again.before.includes("ui-skin-miku"));

  // empty body drops the block entirely
  const dropped = withManaged(USER_CONTENT, "", "");
  assert.ok(!dropped.includes(MANAGED_BEGIN));
  assert.ok(dropped.includes("ui-skin-miku"));
});

test("removeGroup / appendGroup swap one labeled group at a time", () => {
  let body = appendGroup("", "plugin:foo", "- id: x\n  disabled: true");
  body = appendGroup(body, "mcp:bar", "- insert:\n  - id: mcp-bar");
  assert.ok(body.includes("# group: plugin:foo"));
  assert.ok(body.includes("# group: mcp:bar"));

  body = removeGroup(body, "plugin:foo");
  assert.ok(!body.includes("# group: plugin:foo"));
  assert.ok(body.includes("# group: mcp:bar"));

  // re-append replaces cleanly (append removes first in real usage; verify idempotence helper path)
  body = appendGroup(removeGroup(body, "mcp:bar"), "mcp:bar", "- insert:\n  - id: mcp-bar");
  assert.strictEqual(body.match(/# group: mcp:bar/g).length, 1);
});

test("yamlScalar quotes only what needs quoting", () => {
  assert.strictEqual(yamlScalar("C:\\tools\\mcp.cmd"), "C:\\tools\\mcp.cmd");
  assert.strictEqual(yamlScalar("serve"), "serve");
  assert.strictEqual(yamlScalar("it's: #fun"), "'it''s: #fun'");
  assert.strictEqual(yamlScalar(""), "''");
});

test("renderMcpInsert: stdio with env and http variants", () => {
  const stdio = renderMcpInsert({
    serverName: "demo", transport: "stdio", command: "C:\\mcp.cmd", args: ["serve", "--mcp"],
    env: { HTTP_PROXY: "http://127.0.0.1:7897" },
  });
  assert.ok(stdio.includes("- insert:"));
  assert.ok(stdio.includes("id: mcp-demo"));
  assert.ok(stdio.includes("name: '@deepseek-ai/dsh-mcp-client'"));
  assert.ok(stdio.includes("transport: stdio"));
  assert.ok(stdio.includes("command: C:\\mcp.cmd"));
  assert.ok(stdio.includes("      - serve"));
  assert.ok(stdio.includes("HTTP_PROXY: http://127.0.0.1:7897"));

  const http = renderMcpInsert({ serverName: "web", transport: "streamable-http", url: "https://x/mcp" });
  assert.ok(http.includes("url: https://x/mcp"));
  assert.ok(!http.includes("command:"));
});

test("parseDumpConfig: sections, entries, mcp fields, disabled", () => {
  const dump = [
    "# == @deepseek-ai/dsh-base",
    "- id: hmr",
    "  name: '@deepseek-ai/cordis-plugin-hmr'",
    "  config:",
    "    root:",
    "      - .",
    "  disabled: true",
    "# == @linxin666/dsh-web-ui-all, patched by @deepseek-ai/dsh-base",
    "- id: mcp-demo",
    "  name: '@deepseek-ai/dsh-mcp-client'",
    "  config:",
    "    transport: stdio",
    "    serverName: demo",
    "    command: C:\\mcp.cmd",
    "    args:",
    "      - serve",
    "      - '--mcp'",
    "- id: ui-skin-miku",
    "  name: '@linxin666/dsh-web-ui-skin'",
  ].join("\n");

  const { entries, bundleIds } = parseDumpConfig(dump);
  const hmr = entries.find((e) => e.id === "hmr");
  assert.strictEqual(hmr.disabled, true);
  assert.strictEqual(hmr.name, "@deepseek-ai/cordis-plugin-hmr");
  const mcp = entries.find((e) => e.id === "mcp-demo");
  assert.strictEqual(mcp.serverName, "demo");
  assert.strictEqual(mcp.transport, "stdio");
  assert.strictEqual(mcp.command, "C:\\mcp.cmd");
  assert.strictEqual(mcp.argsCount, 2);
  assert.deepStrictEqual(bundleIds.get("@deepseek-ai/dsh-base"), ["hmr"]);
  assert.deepStrictEqual(bundleIds.get("@linxin666/dsh-web-ui-all"), ["mcp-demo", "ui-skin-miku"]);
});
