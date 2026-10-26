/** Structural types for the omp host surface usage-bar touches (no omp dependency). */

export interface HostModel {
	provider: string;
	id: string;
}

export interface HostUsageLimit {
	id: string;
	label?: string;
	scope: {
		provider?: string;
		accountId?: string;
		projectId?: string;
		modelId?: string;
		tier?: string;
		windowId?: string;
		shared?: boolean;
	};
	window?: { id?: string; label?: string; durationMs?: number; resetsAt?: number };
	amount: {
		used?: number;
		limit?: number;
		remaining?: number;
		usedFraction?: number;
		remainingFraction?: number;
		unit?: string;
	};
	status?: string;
}

export interface HostUsageReport {
	provider: string;
	fetchedAt?: number;
	limits: HostUsageLimit[];
	metadata?: Record<string, unknown>;
}

export interface HostIdentity {
	accountId?: string;
	email?: string;
	projectId?: string;
	orgId?: string;
}

export type ThemeColor =
	| "accent"
	| "success"
	| "warning"
	| "error"
	| "muted"
	| "dim"
	| "thinkingHigh"
	| "statusLineModel"
	| "statusLineContext"
	| "statusLineSpend"
	| "statusLineCost";

export interface HostTheme {
	fg(color: ThemeColor, text: string): string;
	bold(text: string): string;
	getSymbolPreset?(): string;
	getColorMode?(): string;
}

export interface HostTui {
	requestRender(): void;
}

export interface HostComponent {
	render(width: number): readonly string[];
	invalidate?(): void;
	dispose?(): void;
}

export interface HostSessionEntry {
	type: string;
	role?: string;
	mode?: string;
}

export interface HostCtx {
	hasUI: boolean;
	agent?: { kind: "main" | "sub" };
	model: HostModel | undefined;
	ui: {
		setWidget(
			key: string,
			content: ((tui: HostTui, theme: HostTheme) => HostComponent) | undefined,
			options?: { placement?: "aboveEditor" | "belowEditor" },
		): void;
	};
	sessionManager: {
		getBranch(): readonly HostSessionEntry[];
		getLeafId(): string | null | undefined;
		getSessionId(): string;
	};
	models: { resolve(spec: string): HostModel | undefined };
	modelRegistry: {
		authStorage: {
			usage: { reports(opts?: { signal?: AbortSignal }): Promise<HostUsageReport[] | null> };
			oauth: { identity(provider: string, sessionId?: string): HostIdentity | undefined };
		};
		getApiKeyForProvider?(provider: string, sessionId?: string): Promise<string | undefined>;
		getApiKey?(model: HostModel, sessionId?: string): Promise<string | undefined>;
	};
	setInterval(fn: () => void, ms: number): unknown;
	clearTimer(timer: unknown): void;
}

export interface HostPi {
	on(event: string, handler: (event: unknown, ctx: HostCtx) => void): void;
	pi?: {
		settings?: {
			getGlobalSettings?(): unknown;
			getProjectSettings?(): unknown;
		};
	};
	logger?: { warn?(message: string, meta?: Record<string, unknown>): void };
}
