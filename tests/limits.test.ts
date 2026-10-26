import { describe, expect, test } from "bun:test";
import type { HostUsageLimit, HostUsageReport } from "../src/host.ts";
import { parseOpenRouterKey, pickAccountReport, selectWindows } from "../src/limits.ts";

const H = 3_600_000;
const limit = (over: Partial<HostUsageLimit> & { used?: number; remainingFraction?: number }): HostUsageLimit => {
	const { used, remainingFraction, ...rest } = over;
	return { id: "x", scope: { provider: "anthropic" }, amount: { usedFraction: used, remainingFraction, unit: "percent" }, ...rest };
};

const claude: HostUsageReport = {
	provider: "anthropic",
	limits: [
		limit({ id: "7d", scope: { provider: "anthropic", windowId: "7d", shared: true }, window: { id: "7d", label: "7 Day", durationMs: 168 * H }, used: 0.19 }),
		limit({ id: "5h", scope: { provider: "anthropic", windowId: "5h", shared: true }, window: { id: "5h", label: "5 Hour", durationMs: 5 * H, resetsAt: 123 }, used: 0.38 }),
		limit({ id: "7d:opus", scope: { provider: "anthropic", windowId: "7d", tier: "opus" }, window: { id: "7d", label: "7 Day", durationMs: 168 * H }, used: 0.5 }),
		limit({ id: "7d:sonnet", scope: { provider: "anthropic", windowId: "7d", tier: "sonnet" }, window: { id: "7d", label: "7 Day", durationMs: 168 * H }, used: 0.1 }),
		limit({ id: "extra", scope: { provider: "anthropic", windowId: "extra" }, window: { id: "extra", label: "Extra" }, used: 0.9 }),
	],
};

describe("selectWindows", () => {
	test("keeps shared windows (shortest first) plus model-scoped ones matching an active model", () => {
		expect(selectWindows(claude, ["claude-sonnet-5-5"]).map((w) => w.label)).toEqual(["5h", "7d", "7d sonnet"]);
	});
	test("drops model-scoped windows without an active match, and extra usage", () => {
		expect(selectWindows(claude, ["claude-haiku-5-5"]).map((w) => w.label)).toEqual(["5h", "7d"]);
	});
	test("remaining is the complement of used and carries the reset time", () => {
		const [w5h] = selectWindows(claude, []);
		expect(w5h!.remaining).toBeCloseTo(0.62);
		expect(w5h!.resetsAt).toBe(123);
	});
	test("a codex-style limit scoped by modelId is kept when that id is active", () => {
		const codex: HostUsageReport = {
			provider: "openai-codex",
			limits: [limit({ id: "spark", scope: { provider: "openai-codex", tier: "spark", modelId: "gpt-5-codex-spark" }, window: { id: "5h", label: "5h", durationMs: 5 * H }, used: 0.2 })],
		};
		expect(selectWindows(codex, ["gpt-5-codex-spark"]).map((w) => w.label)).toEqual(["5h spark"]);
		expect(selectWindows(codex, ["gpt-5"])).toEqual([]);
	});
	test("a limit expressed only as remainingFraction works", () => {
		const r: HostUsageReport = { provider: "anthropic", limits: [limit({ window: { id: "5h", label: "5h" }, scope: { provider: "anthropic", windowId: "5h" }, remainingFraction: 0.25 })] };
		expect(selectWindows(r, [])[0]!.remaining).toBeCloseTo(0.25);
	});
});

describe("pickAccountReport", () => {
	test("prefers the report whose email matches the active identity", () => {
		const a: HostUsageReport = { ...claude, metadata: { email: "a@x.io" } };
		const b: HostUsageReport = { ...claude, metadata: { email: "b@x.io" } };
		expect(pickAccountReport([a, b], "anthropic", { email: "B@x.io" })).toBe(b);
	});
	test("falls back to the first non-empty report of the provider", () => {
		const other: HostUsageReport = { provider: "openai-codex", limits: claude.limits };
		expect(pickAccountReport([other, claude], "anthropic", undefined)).toBe(claude);
		expect(pickAccountReport([other], "anthropic", undefined)).toBeUndefined();
	});
});

describe("parseOpenRouterKey", () => {
	test("effective budget becomes a money window", () => {
		const v = parseOpenRouterKey({ data: { effective_budget: { limit_usd: 50, remaining_usd: 17.5, spend_usd: 32.5, reset_interval: "weekly", resets_at: "2030-01-01T00:00:00Z" } } });
		expect(v?.kind).toBe("budget");
		if (v?.kind !== "budget") return;
		expect(v.window.label).toBe("wk");
		expect(v.window.remaining).toBeCloseTo(0.35);
		expect(v.window.money).toEqual({ remainingUsd: 17.5, limitUsd: 50 });
		expect(v.window.resetsAt).toBe(Date.parse("2030-01-01T00:00:00Z"));
	});
	test("key limit is used when there is no effective budget", () => {
		const v = parseOpenRouterKey({ data: { effective_budget: null, limit: 10, limit_remaining: 4, limit_reset: "monthly" } });
		expect(v).toEqual({ kind: "budget", window: { label: "mo", remaining: 0.4, money: { remainingUsd: 4, limitUsd: 10 } } });
	});
	test("no limit gives a spend view", () => {
		expect(parseOpenRouterKey({ data: { limit: null, effective_budget: null, usage_daily: 1.5, usage_monthly: 12 } })).toEqual({ kind: "spend", dailyUsd: 1.5, monthlyUsd: 12 });
	});
	test("missing data is undefined", () => {
		expect(parseOpenRouterKey({})).toBeUndefined();
	});
});
