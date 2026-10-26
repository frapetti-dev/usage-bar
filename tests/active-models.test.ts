import { describe, expect, test } from "bun:test";
import { activeModelsKey, advisorEnabled, collectActiveModels, currentRoleLabel } from "../src/active-models.ts";

describe("currentRoleLabel", () => {
	test("empty branch is main", () => {
		expect(currentRoleLabel([])).toBe("main");
	});
	test("latest model_change role is shown verbatim", () => {
		expect(currentRoleLabel([{ type: "model_change", role: "smol" }])).toBe("smol");
	});
	test("missing or default role is main", () => {
		expect(currentRoleLabel([{ type: "model_change" }])).toBe("main");
		expect(currentRoleLabel([{ type: "model_change", role: "default" }])).toBe("main");
	});
	test("plan mode after a model change wins", () => {
		expect(currentRoleLabel([{ type: "model_change", role: "slow" }, { type: "mode_change", mode: "plan" }])).toBe("plan");
	});
	test("leaving plan mode restores the model role", () => {
		const branch = [{ type: "model_change", role: "slow" }, { type: "mode_change", mode: "plan" }, { type: "mode_change", mode: "none" }];
		expect(currentRoleLabel(branch)).toBe("slow");
	});
});

describe("advisorEnabled", () => {
	test("project layer overrides global", () => {
		expect(advisorEnabled({ advisor: { enabled: true } }, { advisor: { enabled: false } })).toBe(false);
	});
	test("global applies when project is silent", () => {
		expect(advisorEnabled({ advisor: { enabled: true } }, {})).toBe(true);
	});
	test("missing in both layers is false", () => {
		expect(advisorEnabled(undefined, null)).toBe(false);
	});
	test("non-boolean values do not enable", () => {
		expect(advisorEnabled({ advisor: { enabled: "true" } }, undefined)).toBe(false);
	});
});

describe("collectActiveModels", () => {
	const m = (id: string) => ({ provider: "p", id });
	test("order is current, advisor, verdict, verdict-fb", () => {
		const out = collectActiveModels({
			current: m("a"),
			currentRole: "main",
			advisor: m("b"),
			verdict: { enabled: true, classifier: m("c"), fallback: m("d") },
		});
		expect(out.map((x) => x.role)).toEqual(["main", "advisor", "verdict", "verdict-fb"]);
		expect(activeModelsKey(out)).toBe("p/a:main|p/b:advisor|p/c:verdict|p/d:verdict-fb");
	});
	test("verdict entries are excluded when pi-verdict is disabled", () => {
		const out = collectActiveModels({ current: m("a"), currentRole: "main", advisor: undefined, verdict: { enabled: false, classifier: m("c"), fallback: m("d") } });
		expect(out.map((x) => x.role)).toEqual(["main"]);
	});
	test("a null fallback is skipped", () => {
		const out = collectActiveModels({ current: m("a"), currentRole: "plan", advisor: undefined, verdict: { enabled: true, classifier: m("c"), fallback: null } });
		expect(out.map((x) => x.role)).toEqual(["plan", "verdict"]);
	});
});
