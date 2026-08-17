/**
 * Bundled HarmonyOS Sans SC: registers the `dsw-font://` scheme that serves
 * the font files from resources/fonts (inside the ASAR, read via Electron's
 * asar-aware fs) to both the file:// shell pages and the http:// webview
 * guest. The @font-face rules live in resources/fonts.css and are injected
 * into the guest by the shell (see index.ts / shell-theme.js).
 *
 * Scheme registration must happen before app.ready — the call at module top
 * level below runs during import, before index.ts wires up app lifecycle.
 */
import { app, protocol } from "electron";
import { readFileSync } from "node:fs";
import { join } from "node:path";

protocol.registerSchemesAsPrivileged([
  {
    scheme: "dsw-font",
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
    },
  },
]);

/** Files the scheme may serve; URL pathname -> disk name. */
const FONT_FILES = new Map<string, string>([
  ["/HarmonyOS_Sans_SC_Thin.ttf", "HarmonyOS_Sans_SC_Thin.ttf"],
  ["/HarmonyOS_Sans_SC_Light.ttf", "HarmonyOS_Sans_SC_Light.ttf"],
  ["/HarmonyOS_Sans_SC_Regular.ttf", "HarmonyOS_Sans_SC_Regular.ttf"],
  ["/HarmonyOS_Sans_SC_Medium.ttf", "HarmonyOS_Sans_SC_Medium.ttf"],
  ["/HarmonyOS_Sans_SC_Bold.ttf", "HarmonyOS_Sans_SC_Bold.ttf"],
  ["/HarmonyOS_Sans_SC_Black.ttf", "HarmonyOS_Sans_SC_Black.ttf"],
]);

/** resources/fonts — same layout in dev (repo) and packaged (inside ASAR). */
export function fontsDir(): string {
  return join(app.getAppPath(), "resources", "fonts");
}

/** Read the bundled @font-face CSS (for guest injection); cached after first read. */
let fontsCssCache: string | null = null;
export function fontsCss(): string {
  if (fontsCssCache === null) {
    try {
      fontsCssCache = readFileSync(join(fontsDir(), "..", "fonts.css"), "utf8");
    } catch {
      fontsCssCache = "";
    }
  }
  return fontsCssCache;
}

/** Wire up the dsw-font:// handler. Call after app.ready. */
export function installFontProtocol(): void {
  protocol.handle("dsw-font", (request) => {
    let name: string | undefined;
    try {
      name = FONT_FILES.get(new URL(request.url).pathname);
    } catch {
      name = undefined;
    }
    if (!name) return new Response("not found", { status: 404 });
    try {
      const data = readFileSync(join(fontsDir(), "HarmonyOS_Sans_SC", name));
      return new Response(data, {
        status: 200,
        headers: {
          "content-type": "font/ttf",
          "access-control-allow-origin": "*",
          "cache-control": "no-cache",
        },
      });
    } catch {
      return new Response("not found", { status: 404 });
    }
  });
}
