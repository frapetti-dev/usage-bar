import { asRecord } from "./util.ts";
import type { HostModel } from "./host.ts";

export type ActiveModel = { provider: string; id: string; role: string };

/** Shape published by pi-verdict's probe (`Symbol.for("pi-verdict:active-models")`). */
export interface VerdictActiveModels {
	enabled: boolean;
	classifier: { provider: string; id: string } | null;
	fallback: { provider: string; id: string } | null;
}

/** Role label of the current model: `plan` while plan mode is active, else the role of the latest `model_change`. */
export function currentRoleLabel(branch: readonly { type: string; role?: string; mode?: string }[]): string {
	let mode: string | undefined;
	let modeSeen = false;
	let role: string | undefined;
	let roleSeen = false;
	for (let i = branch.length - 1; i >= 0 && !(modeSeen && roleSeen); i--) {
		const e = branch[i]!;
		if (!modeSeen && e.type === "mode_change") {
			modeSeen = true;
			mode = e.mode;
		} else if (!roleSeen && e.type === "model_change") {
			roleSeen = true;
			role = e.role;
		}
	}
	if (mode === "plan") return "plan";
	return !role || role === "default" ? "main" : role;
}

function readAdvisorEnabled(raw: unknown): unknown {
	return asRecord(asRecord(raw)?.advisor)?.enabled;
}

/** `advisor.enabled` from the raw settings layers: project overrides global; only boolean `true` enables. */
export function advisorEnabled(globalRaw: unknown, projectRaw: unknown): boolean {
	const project = readAdvisorEnabled(projectRaw);
	const value = project !== undefined ? project : readAdvisorEnabled(globalRaw);
	return value === true;
}

export function collectActiveModels(input: {
	current: HostModel | undefined;
	currentRole: string;
	advisor: HostModel | undefined;
	verdict: VerdictActiveModels | undefined;
}): ActiveModel[] {
	const out: ActiveModel[] = [];
	const push = (m: { provider: string; id: string } | null | undefined, role: string): void => {
		if (m) out.push({ provider: m.provider, id: m.id, role });
	};
	push(input.current, input.currentRole);
	push(input.advisor, "advisor");
	if (input.verdict?.enabled) {
		push(input.verdict.classifier, "verdict");
		push(input.verdict.fallback, "verdict-fb");
	}
	return out;
}

export function activeModelsKey(models: ActiveModel[]): string {
	return models.map((m) => `${m.provider}/${m.id}:${m.role}`).join("|");
}
