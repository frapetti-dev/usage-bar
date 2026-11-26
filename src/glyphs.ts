export interface GlyphSet {
	provider: Record<"anthropic" | "openai-codex" | "openrouter", string>;
	/** icon for a role label, "" when none */
	role: (label: string) => string;
	roleJoin: string;
	reset: string;
	warn: string;
	bar: { fullLeft: string; fullMid: string; fullRight: string; emptyLeft: string; emptyMid: string; emptyRight: string };
}

/** Nerd Fonts >= 3.5 codepoints; every glyph is one cell. Written as escapes, never raw private-use characters. */
export const NERD: GlyphSet = {
	provider: { anthropic: "\u{ec82}", "openai-codex": "\u{ec81}", openrouter: "\u{f0ac}" },
	role: (l) => (l === "plan" ? "\u{f2d2}" : l === "advisor" ? "\u{ea70}" : l === "verdict" ? "\u{f132}" : l === "verdict-fb" ? "\u{f0e2}" : "\u{ec19}"),
	roleJoin: " ",
	reset: "\u{f252}",
	warn: "\u{f071}",
	bar: { fullLeft: "\u{ee03}", fullMid: "\u{ee04}", fullRight: "\u{ee05}", emptyLeft: "\u{ee00}", emptyMid: "\u{ee01}", emptyRight: "\u{ee02}" },
};

export const PLAIN: GlyphSet = {
	provider: { anthropic: "", "openai-codex": "", openrouter: "" },
	role: () => "",
	roleJoin: "·",
	reset: "↻",
	warn: "",
	bar: { fullLeft: "█", fullMid: "█", fullRight: "█", emptyLeft: "░", emptyMid: "░", emptyRight: "░" },
};

export function glyphsFor(theme: { symbols?: { preset: string } }): GlyphSet {
	return theme.symbols?.preset === "nerd" ? NERD : PLAIN;
}
