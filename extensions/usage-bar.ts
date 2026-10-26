import { activeModelsKey, advisorEnabled, collectActiveModels, currentRoleLabel, type ActiveModel, type VerdictActiveModels } from "../src/active-models.ts";
import type { HostComponent, HostCtx, HostIdentity, HostModel, HostPi, HostTheme, HostTui, HostUsageReport } from "../src/host.ts";
import { parseOpenRouterKey, pickAccountReport, selectWindows, SUPPORTED_PROVIDERS, type OpenRouterView, type ProviderId } from "../src/limits.ts";
import { renderRows, type RowModel } from "../src/render.ts";
import { asRecord } from "../src/util.ts";

const WIDGET_KEY = "usage-bar";
const TICK_MS = 1_000;
const USAGE_REFRESH_MS = 60_000;
const FETCH_TIMEOUT_MS = 15_000;
const PROBE = Symbol.for("pi-verdict:active-models");
const OPENROUTER_KEY_URL = "https://openrouter.ai/api/v1/key";

function readVerdictProbe(ctx: HostCtx): VerdictActiveModels | undefined {
	const probe = Reflect.get(globalThis, PROBE);
	if (typeof probe !== "function") return undefined;
	const raw = asRecord(probe(ctx));
	if (!raw || typeof raw.enabled !== "boolean") return undefined;
	const ref = (v: unknown): { provider: string; id: string } | null => {
		const r = asRecord(v);
		return r && typeof r.provider === "string" && typeof r.id === "string" ? { provider: r.provider, id: r.id } : null;
	};
	return { enabled: raw.enabled, classifier: ref(raw.classifier), fallback: ref(raw.fallback) };
}

export default function usageBar(pi: HostPi): void {
	let liveCtx: HostCtx | undefined;
	let liveTui: HostTui | undefined;
	let timer: unknown;

	let activeModels: ActiveModel[] = [];
	let lastKey: string | undefined;
	let leafSeen = false;
	let leafId: string | null | undefined;
	let currentRole = "main";

	let reports: HostUsageReport[] = [];
	let identities: Partial<Record<ProviderId, HostIdentity | undefined>> = {};
	let openRouter: OpenRouterView | undefined;
	let refreshedOnce = false;
	let inFlight = false;
	let pending = false;
	let lastRefresh = 0;

	let version = 0;
	let requestedVersion = -1;
	let requestedMinute = -1;
	let cacheWidth = -1;
	let cacheVersion = -1;
	let cacheMinute = -1;
	let cacheLines: readonly string[] = [];

	const minuteNow = (): number => Math.floor(Date.now() / 60_000);
	const warn = (message: string, e: unknown): void => pi.logger?.warn?.(message, { error: String(e) });

	function buildRows(): RowModel[] {
		const rows: RowModel[] = [];
		for (const provider of SUPPORTED_PROVIDERS) {
			const group = activeModels.filter((m) => m.provider === provider);
			if (group.length === 0) continue;
			const roles = [...new Set(group.map((m) => m.role))];
			const row: RowModel = { provider, roles, windows: [] };
			const unavailable = refreshedOnce ? "usage unavailable" : "loading…";
			if (provider === "openrouter") {
				if (!openRouter) row.note = unavailable;
				else if (openRouter.kind === "budget") row.windows = [openRouter.window];
				else row.spend = { dailyUsd: openRouter.dailyUsd, monthlyUsd: openRouter.monthlyUsd };
			} else {
				const report = pickAccountReport(reports, provider, identities[provider]);
				if (report) row.windows = selectWindows(report, group.map((m) => m.id));
				else row.note = unavailable;
			}
			rows.push(row);
		}
		return rows;
	}

	function component(tui: HostTui, theme: HostTheme): HostComponent {
		liveTui = tui;
		return {
			render(width: number): readonly string[] {
				const minute = minuteNow();
				if (width === cacheWidth && version === cacheVersion && minute === cacheMinute) return cacheLines;
				cacheWidth = width;
				cacheVersion = version;
				cacheMinute = minute;
				cacheLines = renderRows(buildRows(), width, Date.now(), theme);
				return cacheLines;
			},
			invalidate(): void {
				cacheWidth = -1;
			},
			dispose(): void {
				if (liveTui === tui) liveTui = undefined;
			},
		};
	}

	function requestRender(): void {
		requestedVersion = version;
		requestedMinute = minuteNow();
		liveTui?.requestRender();
	}

	async function fetchOpenRouter(ctx: HostCtx, models: HostModel[]): Promise<void> {
		const sessionId = ctx.sessionManager.getSessionId();
		const key = ctx.modelRegistry.getApiKeyForProvider
			? await ctx.modelRegistry.getApiKeyForProvider("openrouter", sessionId)
			: models[0] && ctx.modelRegistry.getApiKey
				? await ctx.modelRegistry.getApiKey(models[0], sessionId)
				: undefined;
		if (!key) {
			openRouter = undefined;
			return;
		}
		try {
			const res = await fetch(OPENROUTER_KEY_URL, { headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
			if (!res.ok) return;
			const view = parseOpenRouterKey(await res.json());
			if (view) openRouter = view;
		} catch (e) {
			warn("usage-bar openrouter fetch failed", e);
		}
	}

	async function refreshUsage(): Promise<void> {
		const ctx = liveCtx;
		if (!ctx) return;
		if (inFlight) {
			pending = true;
			return;
		}
		inFlight = true;
		lastRefresh = Date.now();
		try {
			const providers = new Set(activeModels.map((m) => m.provider));
			if (providers.has("anthropic") || providers.has("openai-codex")) {
				try {
					const result = await ctx.modelRegistry.authStorage.usage.reports({ signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
					if (result) {
						reports = result;
						const sessionId = ctx.sessionManager.getSessionId();
						const next: typeof identities = {};
						for (const p of ["anthropic", "openai-codex"] as const) {
							try {
								next[p] = ctx.modelRegistry.authStorage.oauth.identity(p, sessionId);
							} catch {}
						}
						identities = next;
					}
				} catch (e) {
					warn("usage-bar usage reports failed", e);
				}
			}
			if (providers.has("openrouter")) {
				await fetchOpenRouter(ctx, activeModels.filter((m) => m.provider === "openrouter"));
			}
		} finally {
			inFlight = false;
			refreshedOnce = true;
			version++;
			requestRender();
			if (pending) {
				pending = false;
				void refreshUsage();
			}
		}
	}

	function readAdvisor(ctx: HostCtx): HostModel | undefined {
		let enabled = false;
		try {
			const settings = pi.pi?.settings;
			enabled = advisorEnabled(settings?.getGlobalSettings?.(), settings?.getProjectSettings?.());
		} catch {}
		return enabled ? ctx.models.resolve("@advisor") : undefined;
	}

	function tick(): void {
		const ctx = liveCtx;
		if (!ctx) return;
		try {
			const leaf = ctx.sessionManager.getLeafId();
			if (!leafSeen || leaf !== leafId) {
				leafSeen = true;
				leafId = leaf;
				currentRole = currentRoleLabel(ctx.sessionManager.getBranch());
			}
			let verdict: VerdictActiveModels | undefined;
			try {
				verdict = readVerdictProbe(ctx);
			} catch {}
			activeModels = collectActiveModels({ current: ctx.model, currentRole, advisor: readAdvisor(ctx), verdict });
			const key = activeModelsKey(activeModels);
			if (key !== lastKey) {
				lastKey = key;
				version++;
				void refreshUsage();
			} else if (Date.now() - lastRefresh >= USAGE_REFRESH_MS) {
				void refreshUsage();
			}
			if (version !== requestedVersion || minuteNow() !== requestedMinute) requestRender();
		} catch (e) {
			warn("usage-bar tick failed", e);
		}
	}

	function reset(): void {
		liveCtx = undefined;
		liveTui = undefined;
		timer = undefined;
		activeModels = [];
		lastKey = undefined;
		leafSeen = false;
		leafId = undefined;
		currentRole = "main";
		reports = [];
		identities = {};
		openRouter = undefined;
		refreshedOnce = false;
		pending = false;
		lastRefresh = 0;
		version = 0;
		requestedVersion = -1;
		requestedMinute = -1;
		cacheWidth = -1;
		cacheVersion = -1;
		cacheMinute = -1;
		cacheLines = [];
	}

	function init(ctx: HostCtx): void {
		if (!ctx.hasUI || ctx.agent?.kind === "sub") return;
		if (timer !== undefined) ctx.clearTimer(timer);
		reset();
		liveCtx = ctx;
		ctx.ui.setWidget(WIDGET_KEY, (tui, theme) => component(tui, theme), { placement: "belowEditor" });
		timer = ctx.setInterval(tick, TICK_MS);
		tick();
	}

	pi.on("session_start", (_e, ctx) => init(ctx));
	pi.on("session_switch", (_e, ctx) => init(ctx));
	pi.on("turn_start", () => tick());
	pi.on("agent_end", () => tick());
	pi.on("session_shutdown", (_e, ctx) => {
		if (!liveCtx) return;
		if (ctx.hasUI) ctx.ui.setWidget(WIDGET_KEY, undefined);
		if (timer !== undefined) ctx.clearTimer(timer);
		reset();
	});
}
