import type { HostTheme, ThemeColor } from "./host.ts";

const BRAND: Record<"anthropic" | "openai-codex" | "openrouter", { tc: string; c256: string }> = {
	anthropic: { tc: "\x1b[38;2;217;119;87m", c256: "\x1b[38;5;173m" },
	"openai-codex": { tc: "\x1b[38;2;16;163;127m", c256: "\x1b[38;5;36m" },
	openrouter: { tc: "\x1b[38;2;100;103;242m", c256: "\x1b[38;5;63m" },
};

/** Provider brand color as raw SGR (theme.fg only takes theme keys); truecolor only when the theme says so. */
export function brand(theme: HostTheme, provider: keyof typeof BRAND, text: string): string {
	let truecolor = false;
	try {
		truecolor = theme.getColorMode?.() === "truecolor";
	} catch {}
	const b = BRAND[provider];
	return `${truecolor ? b.tc : b.c256}${text}\x1b[39m`;
}

export function roleColor(label: string): ThemeColor {
	return label === "plan" ? "thinkingHigh" : label === "advisor" ? "accent" : label === "verdict" ? "statusLineContext" : label === "verdict-fb" ? "statusLineCost" : "statusLineModel";
}

export function remainingColor(remaining: number): "success" | "warning" | "error" {
	return remaining >= 0.5 ? "success" : remaining >= 0.2 ? "warning" : "error";
}
