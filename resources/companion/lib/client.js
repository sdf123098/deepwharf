// Browser half of the DeepWharf companion plugin.
//
// Three jobs, each independently degradable (a failure in one never affects
// the web UI or the others):
//   1. Register the shell's extra palettes as web UI themes (ctx.theme), so
//      "midnight/forest/warm/contrast" theme the Harness UI too.
//   2. Register a live usage text line over the composer (input.dock slot)
//      driven by the official token-meter projections.
//   3. Bridge the theme registry to the DeepWharf shell over postMessage:
//      snapshots out (all registered themes incl. third-party plugin themes),
//      set-theme commands in. The Electron embedder relays these to the
//      shell's main process.
window.__ModuleLoader__.load({
	id: "deepwharf-companion",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		const React = require("react");

		const NS = "deepwharf.companion";
		const BRIDGE_SOURCE = "deepwharf-companion";
		const SHELL_SOURCE = "deepwharf-shell";

		// --- extra themes (mirror of the shell palettes in pure.ts) ---------------
		// Tokens not listed here inherit the base palette for the theme's
		// colorScheme (state colors, scrollbars, …), so only the alias core is set.
		const EXTRA_THEMES = [
			{
				id: "midnight",
				label: "Midnight",
				colorScheme: "dark",
				tokens: {
					"--dsw-alias-bg-base": "#0a1428",
					"--dsw-alias-bg-layer-1": "#101d36",
					"--dsw-alias-bg-layer-2": "#152345",
					"--dsw-alias-bg-overlay": "#101d36",
					"--dsw-alias-border-l1": "#16254a",
					"--dsw-alias-border-l2": "#1d2d4d",
					"--dsw-alias-brand-primary": "#5ba3f5",
					"--dsw-alias-label-primary": "#dbe7ff",
					"--dsw-alias-label-secondary": "#7f93b8",
					"--dsw-specific-sidebar-fill": "#0c1730",
				},
			},
			{
				id: "forest",
				label: "Forest",
				colorScheme: "dark",
				tokens: {
					"--dsw-alias-bg-base": "#0e1512",
					"--dsw-alias-bg-layer-1": "#14201a",
					"--dsw-alias-bg-layer-2": "#192921",
					"--dsw-alias-bg-overlay": "#14201a",
					"--dsw-alias-border-l1": "#1c2f24",
					"--dsw-alias-border-l2": "#223529",
					"--dsw-alias-brand-primary": "#3fb950",
					"--dsw-alias-label-primary": "#dcefe3",
					"--dsw-alias-label-secondary": "#7e9a88",
					"--dsw-specific-sidebar-fill": "#101a15",
				},
			},
			{
				id: "warm",
				label: "Warm",
				colorScheme: "light",
				tokens: {
					"--dsw-alias-bg-base": "#faf5ec",
					"--dsw-alias-bg-layer-1": "#f3ead9",
					"--dsw-alias-bg-layer-2": "#ecdfc8",
					"--dsw-alias-bg-overlay": "#f3ead9",
					"--dsw-alias-border-l1": "#e8dcc4",
					"--dsw-alias-border-l2": "#e2d5bd",
					"--dsw-alias-brand-primary": "#b4632a",
					"--dsw-alias-label-primary": "#33302a",
					"--dsw-alias-label-secondary": "#7c7364",
					"--dsw-specific-sidebar-fill": "#f7efe0",
				},
			},
			{
				id: "contrast",
				label: "Contrast",
				colorScheme: "light",
				tokens: {
					"--dsw-alias-bg-base": "#ffffff",
					"--dsw-alias-bg-layer-1": "#ffffff",
					"--dsw-alias-bg-layer-2": "#f2f2f2",
					"--dsw-alias-bg-overlay": "#ffffff",
					"--dsw-alias-border-l1": "#000000",
					"--dsw-alias-border-l2": "#000000",
					"--dsw-alias-brand-primary": "#0000cd",
					"--dsw-alias-label-primary": "#000000",
					"--dsw-alias-label-secondary": "#333333",
					"--dsw-specific-sidebar-fill": "#ffffff",
				},
			},
		];

		// --- usage line (same math as the shell's pure.ts) -----------------------

		function fmtTokens(n) {
			if (!Number.isFinite(n) || n < 0) return "0";
			if (n < 1000) return String(Math.round(n));
			const units = [[1e9, "B"], [1e6, "M"], [1e3, "K"]];
			for (const [size, suffix] of units) {
				if (n >= size) {
					const v = n / size;
					return (v >= 100 ? v.toFixed(0) : v.toFixed(1)) + suffix;
				}
			}
			return String(n);
		}

		function validUsage(u) {
			if (!u || typeof u !== "object") return null;
			const keys = ["uncachedInputTokens", "outputTokens", "cacheReadTokens", "cacheWriteTokens"];
			for (const k of keys) if (typeof u[k] !== "number" || !Number.isFinite(u[k]) || u[k] < 0) return null;
			return u;
		}

		function pct1(x) {
			return (Math.min(1, Math.max(0, x)) * 100).toFixed(x >= 0.995 ? 0 : 1) + "%";
		}

		function UsageBar({ useProjection, t }) {
			const usage = validUsage(useProjection("tokenUsage"));
			const pressure = useProjection("contextPressure");
			if (!usage && !pressure) return null;
			if (!usage) {
				return React.createElement(
					"div",
					{ style: dockStyle },
					React.createElement("span", { style: { opacity: 0.7 } }, t("usage.noUsage")),
				);
			}
			const input = usage.cacheReadTokens + usage.cacheWriteTokens + usage.uncachedInputTokens;
			const hit = input > 0 ? usage.cacheReadTokens / input : null;
			const used = pressure && typeof pressure.projectedTokens === "number"
				? pressure.projectedTokens
				: pressure && typeof pressure.pressureTokens === "number" ? pressure.pressureTokens : null;
			const win = pressure && typeof pressure.contextWindow === "number" ? pressure.contextWindow : null;
			const ctx = used !== null && win ? Math.min(1, used / win) : null;

			const items = [
				[t("usage.in"), fmtTokens(input)],
				[t("usage.out"), fmtTokens(usage.outputTokens)],
			];
			if (hit !== null) items.push([t("usage.cache"), pct1(hit)]);
			if (ctx !== null) {
				items.push([t("usage.ctx"), `${pct1(ctx)} (${fmtTokens(used)}/${fmtTokens(win)})`]);
			} else if (used !== null) {
				items.push([t("usage.ctx"), fmtTokens(used)]);
			}
			return React.createElement(
				"div",
				{
					style: dockStyle,
					"data-deepwharf-usage": "1",
					title: t("usage.title"),
				},
				items.map(([label, value]) =>
					React.createElement(
						"span",
						{ key: label, style: { whiteSpace: "nowrap" } },
						label + " ",
						React.createElement(
							"b",
							{ style: { color: "var(--dsw-alias-label-primary)", fontWeight: 500 } },
							value,
						),
					),
				),
			);
		}

		const dockStyle = {
			display: "flex",
			flexWrap: "wrap",
			justifyContent: "center",
			gap: "4px 16px",
			padding: "0 16px 8px",
			margin: "0 auto",
			maxWidth: "720px",
			fontSize: "12px",
			lineHeight: "20px",
			color: "var(--dsw-alias-label-secondary)",
			fontVariantNumeric: "tabular-nums",
			userSelect: "text",
		};

		// --- shell bridge ---------------------------------------------------------

		const TOKEN_MAP = {
			bgBase: "--dsw-alias-bg-base",
			bgLayer1: "--dsw-alias-bg-layer-1",
			bgOverlay: "--dsw-alias-bg-overlay",
			borderL1: "--dsw-alias-border-l1",
			borderL2: "--dsw-alias-border-l2",
			labelPrimary: "--dsw-alias-label-primary",
			labelSecondary: "--dsw-alias-label-secondary",
			brandPrimary: "--dsw-alias-brand-primary",
			sidebarFill: "--dsw-specific-sidebar-fill",
		};

		function readTokens() {
			const cs = getComputedStyle(document.body);
			const out = {};
			for (const [key, cssName] of Object.entries(TOKEN_MAP)) {
				out[key] = cs.getPropertyValue(cssName).trim();
			}
			return out;
		}

		function apply(ctx) {
			// 1) usage text line above the composer.
			try {
				if (ctx.slots) {
					ctx.slots.inject("conversation.input.dock", () =>
						ctx.slots.register(
							{ name: "conversation.input.dock", id: "deepwharf-usage", order: 90, locale: NS },
							UsageBar,
						),
					);
				}
			} catch (err) {
				console.warn("[deepwharf-companion] usage line unavailable:", err);
			}

			// 2) localized labels for the usage line.
			try {
				if (ctx.locale) {
					ctx.locale.register(NS, {
						zh: {
							"usage.title": "本会话 token 用量（来自官方 token-meter 投影，实时刷新）",
							"usage.in": "输入",
							"usage.out": "输出",
							"usage.cache": "缓存命中",
							"usage.ctx": "上下文",
							"usage.noUsage": "暂无用量（跑一个任务后出现）",
						},
						en: {
							"usage.title": "Session token usage (official token-meter projection, live)",
							"usage.in": "in",
							"usage.out": "out",
							"usage.cache": "cache",
							"usage.ctx": "ctx",
							"usage.noUsage": "no usage yet (appears after the first turn)",
						},
					});
				}
			} catch (err) {
				console.warn("[deepwharf-companion] locale registration failed:", err);
			}

			// 3) extra themes + the shell bridge.
			const theme = ctx.theme;
			const sessions = ctx.sessions;
			const layout = ctx.layout;
			const labels = new Map(EXTRA_THEMES.map((t) => [t.id, t.label]));

			// The DeepWharf shell ships its own session sidebar, which FULLY
			// replaces the web UI's sidebar. The layout frame carries a stable
			// data attribute while the details panel is closed; a stylesheet
			// rule with !important beats React's inline grid style, so the
			// sidebar cannot come back on re-renders. When the details panel is
			// open (attribute absent) an interval re-zeros the first track
			// inline as a fallback.
			const HIDE_CSS = "[data-details-collapsed]{grid-template-columns:0 minmax(0, 1fr) !important}";
			if (!document.getElementById("deepwharf-hide-webui-sidebar")) {
				const tag = document.createElement("style");
				tag.id = "deepwharf-hide-webui-sidebar";
				tag.textContent = HIDE_CSS;
				document.head.appendChild(tag);
			}
			let frame = null;
			const zeroSidebarTrack = () => {
				if (!frame) return;
				const st = frame.style.gridTemplateColumns;
				if (!st) return;
				const parts = st.trim().split(/\s+/);
				if (parts.length >= 2 && parts[0] !== "0") {
					frame.style.gridTemplateColumns = "0 " + parts.slice(1).join(" ");
				}
			};
			const findFrame = () => {
				frame =
					document.querySelector("[data-details-collapsed], [data-sidebar-collapsed]") ||
					document.querySelector("#root > div") ||
					null;
				if (frame) zeroSidebarTrack();
				return frame !== null;
			};
			let attempts = 0;
			const tryFind = () => {
				if (findFrame() || ++attempts > 20) return;
				setTimeout(tryFind, 300);
			};
			tryFind();
			// Keep the first track zeroed while the details panel is open.
			setInterval(() => {
				if (!frame) {
					findFrame();
					return;
				}
				zeroSidebarTrack();
			}, 1500);
			// Fallback: if the frame never appeared, collapse via the layout
			// service (narrow rail instead of a full sidebar).
			const collapseWebuiSidebar = () => {
				try {
					if (layout && typeof layout.toggleSidebar === "function") {
						layout.toggleSidebar();
						return true;
					}
				} catch (err) {
					console.warn("[deepwharf-companion] layout toggle failed:", err);
				}
				return false;
			};
			let fallbackAttempts = 0;
			const tryCollapse = () => {
				if (frame || collapseWebuiSidebar() || ++fallbackAttempts > 10) return;
				setTimeout(tryCollapse, 300);
			};
			setTimeout(tryCollapse, 3000); // only if the CSS path did not engage
			if (theme) {
				for (const def of EXTRA_THEMES) {
					try {
						theme.register(def);
					} catch (err) {
						// A theme plugin took the id first — the shell falls back to
						// its own chrome-only palette for this id.
						console.warn(`[deepwharf-companion] theme "${def.id}" not registered:`, err);
					}
				}
			}

			const post = (msg) => {
				try {
					// Preferred: the guest preload's sendToHost bridge (a webview
					// guest's window.parent is itself, so plain postMessage is a
					// no-op). Fall back to parent-postMessage for non-webview embeds.
					const g = window.deepwharfGuest;
					if (g && typeof g.post === "function") {
						g.post(msg);
						return;
					}
					if (window.parent && window.parent !== window) window.parent.postMessage(msg, "*");
				} catch {
					// embedder gone (page opened standalone) — nothing to do
				}
			};

			const snapshot = () => {
				const s = theme ? theme.getTheme() : null;
				const fallbackDark = typeof matchMedia !== "undefined" && matchMedia("(prefers-color-scheme: dark)").matches;
				return {
					source: BRIDGE_SOURCE,
					type: "snapshot",
					preference: s ? s.preference : "system",
					activeId: s ? s.active.id : fallbackDark ? "dark" : "light",
					colorScheme: s ? s.active.colorScheme : fallbackDark ? "dark" : "light",
					themes: s
						? s.themes.map((t) => ({
								id: t.id,
								label: labels.get(t.id) || t.id,
								colorScheme: t.colorScheme,
								builtin: t.id === "light" || t.id === "dark",
							}))
						: [],
					tokens: readTokens(),
				};
			};

			// Defer one frame so the ThemePresenter's DOM writes land before the
			// resolved tokens are read.
			const emit = () => requestAnimationFrame(() => post(snapshot()));

			const handleCommand = (d) => {
				if (!d || typeof d !== "object" || d.source !== SHELL_SOURCE) return;
				if (d.type === "set-theme" && theme && typeof d.id === "string" && d.id.length <= 64) {
					if (typeof console !== "undefined") console.warn("[deepwharf-companion] set-theme " + d.id);
					try {
						theme.setTheme(d.id);
					} catch (err) {
						post({ source: BRIDGE_SOURCE, type: "error", message: String((err && err.message) || err) });
					}
				} else if (d.type === "set-font") {
					// Shell-driven global font: overrides the UI's --dsw-font-family
					// (empty restores the Harness default).
					const v = typeof d.value === "string" ? d.value.slice(0, 100).trim() : "";
					const docEl = document.documentElement;
					const bodyEl = document.body;
					if (v === "") {
						docEl.style.removeProperty("--dsw-font-family");
						bodyEl.style.removeProperty("--dsw-font-family");
						bodyEl.style.removeProperty("font-family");
					} else {
						docEl.style.setProperty("--dsw-font-family", v);
						bodyEl.style.setProperty("--dsw-font-family", v);
						bodyEl.style.setProperty("font-family", v);
					}
				} else if (d.type === "open-session" && sessions && typeof d.id === "string" && d.id.length <= 200) {
					// Sidebar click: switch the embedded web UI to this session.
					try {
						sessions.open(d.id);
					} catch (err) {
						post({ source: BRIDGE_SOURCE, type: "error", message: String((err && err.message) || err) });
					}
				} else if (d.type === "open-webui-settings") {
					// Migrated from the (now hidden) web UI sidebar: open the
					// harness's own settings panel. The trigger button carries
					// stable ARIA attributes.
					const btn = document.querySelector('button[aria-haspopup="dialog"]');
					if (btn && typeof btn.click === "function") {
						btn.click();
					} else {
						post({ source: BRIDGE_SOURCE, type: "error", message: "web UI settings trigger not found" });
					}
				} else if (d.type === "ping") {
					emit();
				}
			};

			if (theme) {
				try {
					ctx.on("theme/change", emit);
				} catch (err) {
					console.warn("[deepwharf-companion] theme/change listener failed:", err);
				}
			}

			// Commands arrive through the guest preload bridge when embedded in
			// DeepWharf; the postMessage path is a fallback for other hosts.
			const g = window.deepwharfGuest;
			if (g && typeof g.onCommand === "function") {
				g.onCommand(handleCommand);
			}
			window.addEventListener("message", (ev) => {
				if (ev.source !== window.parent) return;
				handleCommand(ev.data);
			});

			post(snapshot()); // hello — the shell adopts or replays on this
		}

		exports.apply = apply;
		exports.inject = ["slots", "theme", "locale", "sessions", "layout"];
		return module.exports;
	},
});
