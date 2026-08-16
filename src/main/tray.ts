import { Menu, nativeImage, Tray } from "electron";

export interface TrayStrings {
  tooltip: string;
  showLabel: string;
  quitLabel: string;
  balloonTitle: string;
  balloonBody: string;
}

/**
 * Owns the tray icon. With the tray up, closing the main window hides it
 * instead of quitting — the app (and with it the harness process and every
 * running session) stays alive until the user explicitly quits from the tray.
 */
export class TrayManager {
  private tray: Tray | null = null;
  private notifiedHidden = false;
  private strings: TrayStrings | null = null;

  constructor(
    private readonly onShow: () => void,
    private readonly onQuit: () => void,
  ) {}

  get available(): boolean {
    return this.tray !== null;
  }

  create(iconPath: string, s: TrayStrings): void {
    if (this.tray) return;
    const image = nativeImage.createFromPath(iconPath);
    if (image.isEmpty()) throw new Error(`tray icon unreadable: ${iconPath}`);
    this.strings = s;
    const tray = new Tray(image.resize({ width: 16, height: 16 }));
    tray.setToolTip(s.tooltip);
    tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: s.showLabel, click: () => this.onShow() },
        { type: "separator" },
        { label: s.quitLabel, click: () => this.onQuit() },
      ]),
    );
    // Left click (and balloon click) restore the window; right click opens the menu.
    tray.on("click", () => this.onShow());
    tray.on("balloon-click", () => this.onShow());
    this.tray = tray;
  }

  /** One-time balloon the first time the window is hidden, so the keep-alive
   * behavior is discovered instead of looking like a quit that didn't work. */
  notifyHiddenOnce(): void {
    if (!this.tray || this.notifiedHidden || !this.strings) return;
    this.notifiedHidden = true;
    this.tray.displayBalloon({
      iconType: "info",
      title: this.strings.balloonTitle,
      content: this.strings.balloonBody,
    });
  }

  destroy(): void {
    this.tray?.destroy();
    this.tray = null;
  }
}
