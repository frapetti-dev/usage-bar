import { describe, expect, test } from "bun:test";
import type { UiNode } from "@oh-my-pi/pi-tui";
import { NERD, PLAIN } from "../src/glyphs.ts";
import { describeRows } from "../src/native.ts";
import type { RowModel } from "../src/render.ts";

const MIN = 60_000;
const NOW = 1_700_000_000_000;
const OPTS = { meter: true };
type Node = Omit<UiNode, "props"> & { props(): Record<string, any> };

const row = (over: Partial<RowModel> = {}): RowModel => ({
	provider: "anthropic",
	roles: ["main"],
	windows: [{ label: "5h", remaining: 0.62, resetsAt: NOW + (2 * 60 + 14) * MIN }],
	...over,
});

function find(node: unknown, pred: (n: Node) => boolean): Node | undefined {
	if (!node) return undefined;
	const nd = node as unknown as Node;
	if (pred(nd)) return nd;
	for (const c of nd.children()) {
		const hit = find(c, pred);
		if (hit) return hit;
	}
	return undefined;
}
const byRole = (node: unknown, role: string) => find(node, (n) => n.props().role === role);
const spans = (n: Node | undefined) => (n?.props().spans ?? []) as { t: string; s: string }[];

describe("describeRows", () => {
	test("no rows falls back to the plain-rows path", () => {
		expect(describeRows([], NOW, PLAIN, OPTS)).toBeNull();
	});

	test("meter value is the remaining fraction and tone follows the cutoffs", () => {
		for (const [remaining, tone] of [[0.19, "error"], [0.2, "warning"], [0.5, "success"]] as const) {
			const root = describeRows([row({ windows: [{ label: "5h", remaining }] })], NOW, PLAIN, OPTS);
			const meter = find(root, (n) => n.kind === "meter")!;
			expect(meter.props().value).toBe(remaining);
			expect(meter.props().tone).toBe(tone);
			expect(spans(byRole(root, "omp.usage.pct"))[0]!.s).toBe(tone);
		}
	});

	test("without meter support a progress node carries the same value and tone", () => {
		const root = describeRows([row({ windows: [{ label: "5h", remaining: 0.3 }] })], NOW, PLAIN, { meter: false });
		expect(find(root, (n) => n.kind === "meter")).toBeUndefined();
		const progress = find(root, (n) => n.kind === "progress")!;
		expect(progress.props().value).toBe(0.3);
		expect(progress.props().tone).toBe("warning");
	});

	test("money window shows spend and limit", () => {
		const root = describeRows([row({ windows: [{ label: "mo", remaining: 0.624, money: { remainingUsd: 31.2, limitUsd: 50 } }] })], NOW, PLAIN, OPTS);
		expect(spans(byRole(root, "omp.usage.pct"))[0]!.t).toBe("$31.20/$50");
		expect(find(root, (n) => n.key() === "w0")!.props().title as string).toStartWith("mo: $31.20 of $50 remaining");
	});

	test("countdown appears in the reset cell and the title only when resetsAt is in the future", () => {
		const root = describeRows([row({ windows: [{ label: "5h", remaining: 0.62, resetsAt: NOW + 134 * MIN }, { label: "7d", remaining: 0.5 }] })], NOW, PLAIN, OPTS);
		const [w0, w1] = find(root, (n) => n.key() === "tail")!.children();
		expect(spans(byRole(w0!, "omp.usage.reset"))[1]!.t).toBe("2h14m");
		expect(w0!.props().title as string).toContain("resets in 2h14m (");
		expect(byRole(w1!, "omp.usage.reset")).toBeUndefined();
		expect(w1!.props().title as string).not.toContain("resets");
	});

	test("unavailable note replaces the windows; warn glyph only with the nerd preset", () => {
		const r = row({ windows: [], note: "usage unavailable" });
		const nerd = describeRows([r], NOW, NERD, OPTS);
		expect(find(nerd, (n) => n.kind === "meter")).toBeUndefined();
		expect(spans(byRole(nerd, "omp.usage.amount"))).toEqual([{ t: "\u{f071} ", s: "warning" }, { t: "usage unavailable", s: "dim" }]);
		const plain = describeRows([r], NOW, PLAIN, OPTS);
		expect(spans(byRole(plain, "omp.usage.amount"))).toEqual([{ t: "usage unavailable", s: "dim" }]);
	});

	test("spend row states daily and monthly cost", () => {
		const root = describeRows([row({ windows: [], spend: { dailyUsd: 1, monthlyUsd: 12.5 } })], NOW, PLAIN, OPTS);
		expect(spans(byRole(root, "omp.usage.amount"))[0]!.t).toBe("$1.00 today · $12.50 this month (no limit)");
	});

	test("provider name carries the nerd logo only under the nerd preset; roles use role tokens", () => {
		const r = row({ roles: ["main", "plan"] });
		expect(spans(byRole(describeRows([r], NOW, NERD, OPTS), "omp.usage.provider.name"))[0]!.t).toStartWith("\u{ec82} Anthropic");
		const plain = describeRows([r], NOW, PLAIN, OPTS);
		expect(spans(byRole(plain, "omp.usage.provider.name"))[0]!.t).toBe("Anthropic");
		const roles = spans(byRole(plain, "omp.usage.provider.meta"));
		expect(roles.find((s) => s.t === "plan")!.s).toBe("thinkingHigh");
		expect(roles.find((s) => s.t === "main")!.s).toBe("statusLineModel");
	});
});
