import { describe, expect, test } from "bun:test";
import { PLAIN, glyphsFor } from "../src/glyphs.ts";
import type { HostTheme } from "../src/host.ts";
import { formatCountdown, renderRows, type RowModel } from "../src/render.ts";

const MIN = 60_000;
const NOW = 1_700_000_000_000;
/** Tagged themes inflate row width with markup, so assertions on markup use a width nothing degrades at */
const WIDE = 5000;
const strip = (s: string): string => s.replace(/\x1b\[[0-9;]*m/g, "");
const cp = (s: string): number => [...strip(s)].length;

const tagged = (extra: Partial<HostTheme> = {}): HostTheme => ({ fg: (c, t) => `<${c}>${t}</${c}>`, bold: (t) => t, ...extra });
const bare = (extra: Partial<HostTheme> = {}): HostTheme => ({ fg: (_c, t) => t, bold: (t) => t, ...extra });
const nerd = { symbols: { preset: "nerd" } };

const row = (over: Partial<RowModel> = {}): RowModel => ({
	provider: "anthropic",
	roles: ["main"],
	windows: [{ label: "5h", remaining: 0.62, resetsAt: NOW + (2 * 60 + 14) * MIN }, { label: "7d", remaining: 0.81, resetsAt: NOW + (3 * 1440 + 4 * 60) * MIN }],
	...over,
});

describe("formatCountdown", () => {
	test("hours and minutes", () => expect(formatCountdown(NOW + (2 * 60 + 14) * MIN, NOW)).toBe("2h14m"));
	test("days and zero-padded hours", () => expect(formatCountdown(NOW + (3 * 1440 + 4 * 60) * MIN, NOW)).toBe("3d04h"));
	test("minutes only", () => expect(formatCountdown(NOW + 41 * MIN, NOW)).toBe("41m"));
	test("past or missing is undefined", () => {
		expect(formatCountdown(NOW - 1, NOW)).toBeUndefined();
		expect(formatCountdown(undefined, NOW)).toBeUndefined();
	});
});

describe("renderRows plain preset", () => {
	test("bar and value share the threshold color", () => {
		const [line] = renderRows([row()], WIDE, NOW, tagged());
		expect(line).toContain("<success>██████</success><dim>░░░░</dim>");
		expect(line).toContain("<success> 62%</success>");
		expect(line).toContain("↻");
	});
	test("threshold boundaries: 0.19 is error, 0.2 is warning", () => {
		const low = renderRows([row({ windows: [{ label: "5h", remaining: 0.19 }] })], WIDE, NOW, tagged())[0]!;
		const mid = renderRows([row({ windows: [{ label: "5h", remaining: 0.2 }] })], WIDE, NOW, tagged())[0]!;
		expect(low).toContain("<error> 19%</error>");
		expect(mid).toContain("<warning> 20%</warning>");
	});
	test("one provider with two roles is one row", () => {
		const lines = renderRows([row({ roles: ["main", "verdict"] })], WIDE, NOW, tagged());
		expect(lines).toHaveLength(1);
		expect(strip(lines[0]!.replace(/<[^>]+>/g, ""))).toContain("main·verdict");
	});
	test("money windows show $remaining/$limit", () => {
		const [line] = renderRows([row({ provider: "openrouter", windows: [{ label: "mo", remaining: 0.624, money: { remainingUsd: 31.2, limitUsd: 50 } }] })], 200, NOW, bare());
		expect(line).toContain("$31.20/$50");
	});
	test("spend and note rows", () => {
		const spend = renderRows([row({ provider: "openrouter", windows: [], spend: { dailyUsd: 1, monthlyUsd: 12.5 } })], WIDE, NOW, tagged())[0]!;
		expect(spend).toContain("<statusLineCost>$1.00 today · $12.50 this month (no limit)</statusLineCost>");
		const note = renderRows([row({ windows: [], note: "usage unavailable" })], WIDE, NOW, tagged())[0]!;
		expect(note).toContain("<dim>usage unavailable</dim>");
		expect(note).not.toContain("<warning>");
	});
});

describe("renderRows nerd preset", () => {
	test("capped bar runs, provider logo and hourglass", () => {
		const [line] = renderRows([row({ windows: [{ label: "5h", remaining: 0.62, resetsAt: NOW + 134 * MIN }] })], WIDE, NOW, tagged(nerd));
		expect(line).toContain(`<success>\u{ee03}${"\u{ee04}".repeat(5)}</success>`);
		expect(line).toContain(`<dim>${"\u{ee01}".repeat(3)}\u{ee02}</dim>`);
		expect(line).toContain("\u{ec82}");
		expect(line).toContain("<statusLineSpend>\u{f252}</statusLineSpend> <dim>2h14m</dim>");
	});
	test("empty bar starts with the empty left cap, full bar ends with the full right cap", () => {
		const empty = renderRows([row({ windows: [{ label: "5h", remaining: 0 }] })], WIDE, NOW, tagged(nerd))[0]!;
		const full = renderRows([row({ windows: [{ label: "5h", remaining: 1 }] })], WIDE, NOW, tagged(nerd))[0]!;
		expect(empty).toContain("<dim>\u{ee00}");
		expect(full).toContain("\u{ee05}</success>");
	});
	test("roles carry icons and are joined by a space", () => {
		const [line] = renderRows([row({ roles: ["main", "verdict"] })], WIDE, NOW, tagged(nerd));
		expect(line!.replace(/<[^>]+>/g, "")).toContain("\u{ec19} main \u{f132} verdict");
	});
});

describe("colors", () => {
	test("truecolor brand SGR, closed", () => {
		const [line] = renderRows([row()], WIDE, NOW, tagged({ depth: "truecolor" }));
		expect(line!.startsWith("\x1b[38;2;217;119;87m")).toBe(true);
		expect(line).toContain("\x1b[39m");
	});
	test("256-color fallback for 256 and for a missing depth", () => {
		expect(renderRows([row()], WIDE, NOW, tagged({ depth: "256" }))[0]!.startsWith("\x1b[38;5;173m")).toBe(true);
		expect(renderRows([row()], WIDE, NOW, tagged())[0]!.startsWith("\x1b[38;5;173m")).toBe(true);
	});
	test("role colors", () => {
		const out = renderRows([row({ roles: ["plan", "main", "verdict-fb"] })], WIDE, NOW, tagged())[0]!;
		expect(out).toContain("<thinkingHigh>plan</thinkingHigh>");
		expect(out).toContain("<statusLineModel>main</statusLineModel>");
		expect(out).toContain("<statusLineCost>verdict-fb</statusLineCost>");
	});
});

describe("width degradation", () => {
	const rows: RowModel[] = [row(), row({ provider: "openrouter", roles: ["verdict-fb"], windows: [{ label: "mo", remaining: 0.6, money: { remainingUsd: 31.2, limitUsd: 50 }, resetsAt: NOW + 6 * 1440 * MIN }] })];
	for (const [name, extra] of [["plain", {}], ["nerd", nerd]] as const) {
		test(`every row fits at width 60 (${name})`, () => {
			for (const line of renderRows(rows, 60, NOW, bare(extra))) expect(cp(line)).toBeLessThanOrEqual(60);
		});
		test(`width 20 cuts with an ellipsis (${name})`, () => {
			for (const line of renderRows(rows, 20, NOW, bare(extra))) {
				expect(cp(line)).toBeLessThanOrEqual(20);
				expect(line.endsWith("…")).toBe(true);
			}
		});
	}
	test("bars shrink before they disappear", () => {
		const wide = renderRows([row()], 200, NOW, bare())[0]!;
		const narrower = renderRows([row()], cp(wide) - 1, NOW, bare())[0]!;
		expect(cp(narrower)).toBeLessThan(cp(wide));
		expect(narrower).toContain("█");
	});
});

describe("glyphsFor", () => {
	test("no symbols falls back to PLAIN", () => {
		expect(glyphsFor({})).toBe(PLAIN);
	});
});
