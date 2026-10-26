/** Runtime narrowing for untrusted JSON / settings values: a plain object or `undefined`. */
export function asRecord(value: unknown): Record<string, unknown> | undefined {
	return typeof value === "object" && value !== null ? Object.fromEntries(Object.entries(value)) : undefined;
}
