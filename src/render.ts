import { brand, remainingColor, roleColor } from "./colors.ts";
import { glyphsFor, type GlyphSet } from "./glyphs.ts";
import type { HostTheme, ThemeColor } from "./host.ts";
import { PROVIDER_NAMES, type ProviderId, type WindowView } from "./limits.ts";

export type RowModel = {
	provider: ProviderId;
	roles: string[];
	windows: WindowView[];
	note?: string;
	spend?: { dailyUsd: number; monthlyUsd: number };
};

const ANSI = /\x1b\[[0-9;]*m/g;
/** Terminal cells: code points after stripping SGR (every glyph used here is one cell; `.length` would double-count astral ones). */
const cells = (s: string): number => [...s.replace(ANSI, "")].length;

export function formatCountdown(resetsAt: number | undefined, now: number): string | undefined {
	if (resetsAt === undefined || resetsAt <= now) return undefined;
	const m = Math.ceil((resetsAt - now) / 60000);
	if (m >= 1440) {
		const d = Math.floor(m / 1440);
		const h = Math.floor((m % 1440) / 60);
		return `${d}d${String(h).padStart(2, "0")}h`;
	}
	if (m >= 60) {
		return `${Math.floor(m / 60)}h${String(m % 60).padStart(2, "0")}m`;
	}
	return `${m}m`;
}

type Level = { barWidth: number; countdown: boolean; firstOnly: boolean };
const LEVELS: Level[] = [
	{ barWidth: 10, countdown: true, firstOnly: false },
	{ barWidth: 5, countdown: true, firstOnly: false },
	{ barWidth: 0, countdown: true, firstOnly: false },
	{ barWidth: 0, countdown: false, firstOnly: false },
	{ barWidth: 0, countdown: false, firstOnly: true },
];

function renderBar(theme: HostTheme, g: GlyphSet, remaining: number, barWidth: number): string {
	const filled = Math.round(remaining * barWidth);
	const fullColor = remainingColor(remaining);
	let out = "";
	let run = "";
	let runColor: ThemeColor | undefined;
	const flush = (): void => {
		if (run && runColor) out += theme.fg(runColor, run);
		run = "";
	};
	for (let i = 0; i < barWidth; i++) {
		const pos = i === 0 ? "Left" : i === barWidth - 1 ? "Right" : "Mid";
		const full = i < filled;
		const glyph = g.bar[`${full ? "full" : "empty"}${pos}` as keyof GlyphSet["bar"]];
		const color: ThemeColor = full ? fullColor : "dim";
		if (color !== runColor) {
			flush();
			runColor = color;
		}
		run += glyph;
	}
	flush();
	return out;
}

function windowValue(w: WindowView): string {
	if (w.money) {
		const lim = Number.isInteger(w.money.limitUsd) ? String(w.money.limitUsd) : w.money.limitUsd.toFixed(2);
		return `$${w.money.remainingUsd.toFixed(2)}/$${lim}`;
	}
	return `${Math.round(w.remaining * 100)}%`.padStart(4);
}

function renderWindow(w: WindowView, level: Level, now: number, theme: HostTheme, g: GlyphSet): string {
	const color = remainingColor(w.remaining);
	let out = theme.fg("muted", w.label) + " ";
	if (level.barWidth > 0) out += `${renderBar(theme, g, w.remaining, level.barWidth)} `;
	out += theme.fg(color, windowValue(w));
	const countdown = level.countdown ? formatCountdown(w.resetsAt, now) : undefined;
	if (countdown) out += ` ${theme.fg("statusLineSpend", g.reset)} ${theme.fg("dim", countdown)}`;
	return out;
}

function renderTail(row: RowModel, level: Level, now: number, theme: HostTheme, g: GlyphSet): string {
	if (row.note !== undefined) {
		if (row.note === "usage unavailable") return (g.warn ? theme.fg("warning", `${g.warn} `) : "") + theme.fg("dim", row.note);
		return theme.fg("dim", row.note);
	}
	if (row.spend) return theme.fg("statusLineCost", `$${row.spend.dailyUsd.toFixed(2)} today · $${row.spend.monthlyUsd.toFixed(2)} this month (no limit)`);
	const windows = level.firstOnly ? row.windows.slice(0, 1) : row.windows;
	return windows.map((w) => renderWindow(w, level, now, theme, g)).join("   ");
}

function renderLevel(rows: RowModel[], level: Level, now: number, theme: HostTheme, g: GlyphSet): string[] {
	const providerText = (r: RowModel): string => {
		const icon = g.provider[r.provider];
		return icon ? `${icon} ${PROVIDER_NAMES[r.provider]}` : PROVIDER_NAMES[r.provider];
	};
	const roleCell = (r: RowModel): string => r.roles.map((l) => theme.fg(roleColor(l), (g.role(l) ? `${g.role(l)} ` : "") + l)).join(theme.fg("dim", g.roleJoin));
	const providerWidth = Math.max(...rows.map((r) => cells(providerText(r))));
	const rolesWidth = Math.max(...rows.map((r) => cells(roleCell(r))));
	return rows.map((r) => {
		const p = providerText(r);
		const roles = roleCell(r);
		const providerCell = brand(theme, r.provider, theme.bold(p)) + " ".repeat(providerWidth - cells(p));
		const rolesPadded = roles + " ".repeat(rolesWidth - cells(roles));
		return `${providerCell}  ${rolesPadded}  ${renderTail(r, level, now, theme, g)}`;
	});
}

export function renderRows(rows: RowModel[], width: number, now: number, theme: HostTheme): string[] {
	if (rows.length === 0) return [];
	const g = glyphsFor(theme);
	let last: string[] = [];
	for (const level of LEVELS) {
		last = renderLevel(rows, level, now, theme, g);
		if (last.every((l) => cells(l) <= width)) return last;
	}
	return last.map((l) => {
		const plain = [...l.replace(ANSI, "")];
		return plain.length <= width ? plain.join("") : `${plain.slice(0, Math.max(0, width - 1)).join("")}…`;
	});
}
