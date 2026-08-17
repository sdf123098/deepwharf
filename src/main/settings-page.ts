/**
 * Shared sender authorization for the merged settings page.
 *
 * The shell settings, Harness settings, plugin manager, and usage features all
 * live in ONE window now. Their IPC handlers historically asserted a dedicated
 * window's webContents as the sender; this module lets the merged page be the
 * authorized sender for all of them.
 */
import type { WebContents } from "electron";

let wc: WebContents | null = null;

/** Register (or clear) the merged settings window's webContents. */
export function setSettingsPageSender(c: WebContents | null): void {
  wc = c;
}

/** True when `sender` is the merged settings page. */
export function isSettingsPageSender(sender: WebContents): boolean {
  return wc !== null && sender === wc;
}

/** The settings page webContents (for pushes), if the window is alive. */
export function settingsPageSender(): WebContents | null {
  return wc !== null && !wc.isDestroyed() ? wc : null;
}
