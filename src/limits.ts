import { asRecord } from "./util.ts";
import type { HostIdentity, HostUsageLimit, HostUsageReport } from "./host.ts";

export const SUPPORTED_PROVIDERS = ["anthropic", "openai-codex", "openrouter"] as const;
export type ProviderId = (typeof SUPPORTED_PROVIDERS)[number];
export const PROVIDER_NAMES: Record<ProviderId, string> = { anthropic: "Anthropic", "openai-codex": "OpenAI", openrouter: "OpenRouter" };

export function isProviderId(p: string): p is ProviderId {
	return (SUPPORTED_PROVIDERS as readonly string[]).includes(p);
}

function normalizeIdentityValue(value: unknown): string | undefined {
	return typeof value === "string" && value.trim() ? value.trim().toLowerCase() : undefined;
}

/** Port of omp's `limitMatchesActiveAccount` (slash-commands/helpers/active-oauth-account.ts): true when a limit belongs to the OAuth identity. */
export function limitMatchesActiveAccount(report: HostUsageReport, limit: HostUsageLimit, identity: HostIdentity | undefined): boolean {
	if (!identity) return false;
	const metadata = report.metadata ?? {};
	const activeAccountId = normalizeIdentityValue(identity.accountId);
	const activeEmail = normalizeIdentityValue(identity.email);
	const activeProjectId = normalizeIdentityValue(identity.projectId);
	const activeOrgId = normalizeIdentityValue(identity.orgId);
	const reportOrgId = normalizeIdentityValue(metadata.orgId);
	if (activeOrgId || reportOrgId) {
		if (activeOrgId !== reportOrgId) return false;
		if (!activeAccountId && !activeEmail && !activeProjectId) return true;
	}
	const reportEmail = normalizeIdentityValue(metadata.email);
	if (activeEmail && reportEmail) return activeEmail === reportEmail;
	if (activeAccountId) {
		const reportAccountId = normalizeIdentityValue(metadata.accountId) ?? normalizeIdentityValue(metadata.account_id);
		if (reportAccountId === activeAccountId) return true;
		if (normalizeIdentityValue(limit.scope.accountId) === activeAccountId) return true;
	}
	if (activeProjectId) {
		if (normalizeIdentityValue(metadata.projectId) === activeProjectId) return true;
		if (normalizeIdentityValue(limit.scope.projectId) === activeProjectId) return true;
	}
	return false;
}

export function pickAccountReport(reports: HostUsageReport[], provider: string, identity: HostIdentity | undefined): HostUsageReport | undefined {
	const mine = reports.filter((r) => r.provider === provider);
	const matched = mine.find((r) => r.limits.some((l) => limitMatchesActiveAccount(r, l, identity)));
	if (matched) return matched;
	return mine.find((r) => r.limits.length > 0);
}

export const clamp01 = (n: number): number => Math.min(1, Math.max(0, n));

export function usedFraction(limit: HostUsageLimit): number | undefined {
	const a = limit.amount;
	if (typeof a.usedFraction === "number" && Number.isFinite(a.usedFraction)) return clamp01(a.usedFraction);
	if (typeof a.remainingFraction === "number" && Number.isFinite(a.remainingFraction)) return clamp01(1 - a.remainingFraction);
	if (typeof a.used === "number" && typeof a.limit === "number" && Number.isFinite(a.used) && Number.isFinite(a.limit) && a.limit > 0) return clamp01(a.used / a.limit);
	return undefined;
}

export type WindowView = { label: string; remaining: number; resetsAt?: number; money?: { remainingUsd: number; limitUsd: number } };

const SHORT_WINDOW = /^\d+[mhdw]$/;

function windowLabel(limit: HostUsageLimit): string {
	const candidates = [limit.window?.id, limit.scope.windowId];
	for (const c of candidates) if (c && SHORT_WINDOW.test(c)) return c;
	return limit.window?.label ?? limit.label ?? limit.id;
}

export function selectWindows(report: HostUsageReport, activeModelIds: string[]): WindowView[] {
	type Entry = { view: WindowView; scoped: boolean; duration: number | undefined };
	const entries: Entry[] = [];
	for (const limit of report.limits) {
		if (limit.scope.windowId === "extra" || limit.window?.id === "extra") continue;
		const used = usedFraction(limit);
		if (used === undefined) continue;
		const { tier, modelId } = limit.scope;
		const scoped = tier !== undefined || modelId !== undefined;
		if (scoped) {
			const keep = activeModelIds.some((id) => id === modelId || (tier !== undefined && id.toLowerCase().includes(tier.toLowerCase())));
			if (!keep) continue;
		}
		const short = windowLabel(limit);
		const label = scoped ? `${short} ${tier ?? modelId}` : short;
		const view: WindowView = { label, remaining: 1 - used };
		if (limit.window?.resetsAt !== undefined) view.resetsAt = limit.window.resetsAt;
		entries.push({ view, scoped, duration: limit.window?.durationMs });
	}
	const dur = (e: Entry): number => e.duration ?? Number.POSITIVE_INFINITY;
	entries.sort((a, b) => Number(a.scoped) - Number(b.scoped) || (dur(a) === dur(b) ? 0 : dur(a) < dur(b) ? -1 : 1));
	return entries.map((e) => e.view);
}

export type OpenRouterView = { kind: "budget"; window: WindowView } | { kind: "spend"; dailyUsd: number; monthlyUsd: number };

const INTERVAL_LABEL: Record<string, string> = { daily: "day", weekly: "wk", monthly: "mo" };
const intervalLabel = (interval: unknown): string => (typeof interval === "string" ? INTERVAL_LABEL[interval] : undefined) ?? "total";
const num = (v: unknown): number | undefined => (typeof v === "number" && Number.isFinite(v) ? v : undefined);

export function parseOpenRouterKey(json: unknown): OpenRouterView | undefined {
	const d = asRecord(asRecord(json)?.data);
	if (!d) return undefined;
	const budget = asRecord(d.effective_budget);
	const limitUsd = num(budget?.limit_usd);
	if (budget && limitUsd !== undefined && limitUsd > 0) {
		const remainingUsd = num(budget.remaining_usd) ?? 0;
		const window: WindowView = { label: intervalLabel(budget.reset_interval), remaining: clamp01(remainingUsd / limitUsd), money: { remainingUsd, limitUsd } };
		const resetsAt = typeof budget.resets_at === "string" ? Date.parse(budget.resets_at) : Number.NaN;
		if (Number.isFinite(resetsAt)) window.resetsAt = resetsAt;
		return { kind: "budget", window };
	}
	const limit = num(d.limit);
	if (limit !== undefined && limit > 0) {
		const remainingUsd = num(d.limit_remaining) ?? 0;
		return { kind: "budget", window: { label: intervalLabel(d.limit_reset), remaining: clamp01(remainingUsd / limit), money: { remainingUsd, limitUsd: limit } } };
	}
	return { kind: "spend", dailyUsd: num(d.usage_daily) ?? 0, monthlyUsd: num(d.usage_monthly) ?? 0 };
}
