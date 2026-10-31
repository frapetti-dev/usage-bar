import { remainingColor, roleColor } from "./colors.ts";
import type { GlyphSet } from "./glyphs.ts";
import type { HostNativeNode } from "./host.ts";
import { clamp01, PROVIDER_NAMES, type WindowView } from "./limits.ts";
import { formatCountdown, windowValue, type RowModel } from "./render.ts";

type Span = { t: string; s: string };

const n = (k: string, p?: Record<string, unknown>, c?: readonly HostNativeNode[], key?: string): HostNativeNode => ({ k, p, c, key });
const cps = (s: string): number => [...s].length;

function windowTitle(w: WindowView, now: number, hour12: boolean | undefined): string {
	let title: string;
	if (w.money) {
		const lim = Number.isInteger(w.money.limitUsd) ? String(w.money.limitUsd) : w.money.limitUsd.toFixed(2);
		title = `${w.label}: $${w.money.remainingUsd.toFixed(2)} of $${lim} remaining`;
	} else {
		title = `${w.label}: ${Math.round(w.remaining * 100)}% remaining`;
	}
	const countdown = formatCountdown(w.resetsAt, now);
	if (countdown && w.resetsAt !== undefined) {
		const clock = new Date(w.resetsAt).toLocaleString(undefined, { weekday: "short", hour: "2-digit", minute: "2-digit", hour12 });
		title += ` · resets in ${countdown} (${clock})`;
	}
	return title;
}

function windowNode(w: WindowView, i: number, now: number, g: GlyphSet, opts: { meter: boolean; hour12?: boolean }): HostNativeNode {
	const tone = remainingColor(w.remaining);
	const sizing = { grow: 1, shrink: 1, min: { w: "4ch" }, max: { w: "10ch" } };
	const cells: HostNativeNode[] = [n("text", { role: "omp.usage.label", spans: [{ t: w.label, s: "muted" }], wrap: "none", shrink: 0 })];
	cells.push(
		opts.meter
			? n("meter", { value: clamp01(w.remaining), style: "bar", size: "sm", tone, ...sizing })
			: n("progress", { value: clamp01(w.remaining), tone, ...sizing }),
	);
	cells.push(n("text", { role: "omp.usage.pct", spans: [{ t: windowValue(w), s: tone }], wrap: "none", shrink: 0 }));
	const countdown = formatCountdown(w.resetsAt, now);
	if (countdown) {
		cells.push(n("text", { role: "omp.usage.reset", spans: [{ t: `${g.reset} `, s: "statusLineSpend" }, { t: countdown, s: "dim" }], wrap: "none", shrink: 0 }));
	}
	return n("row", { gap: "sm", align: "center", shrink: 0, title: windowTitle(w, now, opts.hour12) }, cells, `w${i}`);
}

function tailNode(row: RowModel, now: number, g: GlyphSet, opts: { meter: boolean; hour12?: boolean }): HostNativeNode {
	const text = (spans: Span[]): HostNativeNode => n("text", { role: "omp.usage.amount", spans, wrap: "none", truncate: "end" }, undefined, "tail");
	if (row.note !== undefined) {
		const spans: Span[] = [];
		if (row.note === "usage unavailable" && g.warn) spans.push({ t: `${g.warn} `, s: "warning" });
		spans.push({ t: row.note, s: "dim" });
		return text(spans);
	}
	if (row.spend) {
		return text([{ t: `$${row.spend.dailyUsd.toFixed(2)} today · $${row.spend.monthlyUsd.toFixed(2)} this month (no limit)`, s: "statusLineCost" }]);
	}
	return n("row", { gap: "lg", align: "center", shrink: 1, min: { w: 0 } }, row.windows.map((w, i) => windowNode(w, i, now, g, opts)), "tail");
}

/** Describe provider rows as a Tern Surface Protocol tree; null (no rows) falls back to the ANSI render path. */
export function describeRows(rows: RowModel[], now: number, g: GlyphSet, opts: { meter: boolean; hour12?: boolean }): HostNativeNode | null {
	if (rows.length === 0) return null;
	const names = rows.map((r) => (g.provider[r.provider] ? `${g.provider[r.provider]} ${PROVIDER_NAMES[r.provider]}` : PROVIDER_NAMES[r.provider]));
	const roleSpans = rows.map((r) => {
		const spans: Span[] = [];
		r.roles.forEach((l, i) => {
			if (i > 0) spans.push({ t: g.roleJoin, s: "dim" });
			const icon = g.role(l);
			spans.push({ t: (icon ? `${icon} ` : "") + l, s: roleColor(l) });
		});
		return spans;
	});
	const nameCh = Math.max(...names.map(cps));
	const rolesCh = Math.max(...roleSpans.map((spans) => spans.reduce((sum, sp) => sum + cps(sp.t), 0)));

	const providerRows = rows.map((r, i) => {
		const title = r.roles.length > 0 ? `${PROVIDER_NAMES[r.provider]}: ${r.roles.join(", ")}` : PROVIDER_NAMES[r.provider];
		const name = n("text", { role: "omp.usage.provider.name", spans: [{ t: names[i]!, s: "strong" }], wrap: "none", truncate: "end", min: { w: `${nameCh}ch` } }, undefined, "name");
		const roles = n("text", { role: "omp.usage.provider.meta", spans: roleSpans[i]!, wrap: "none", truncate: "end", min: { w: `${rolesCh}ch` } }, undefined, "roles");
		return n("row", { gap: "md", align: "center", title }, [name, roles, tailNode(r, now, g, opts)], r.provider);
	});
	return n("col", { gap: "xs" }, providerRows);
}
