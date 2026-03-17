const DURATION_RE = /^(\d+)(s|m|h|d)$/;

const UNITS: Record<string, number> = {
	s: 1_000,
	m: 60_000,
	h: 3_600_000,
	d: 86_400_000,
};

/**
 * Parse a duration string (e.g. "1h", "30m", "7d") into milliseconds.
 */
export function parseDuration(input: string): number {
	const match = input.match(DURATION_RE);
	if (!match) throw new Error(`Invalid duration: "${input}". Use format like 1h, 30m, 7d`);
	return Number(match[1]) * UNITS[match[2]];
}

/**
 * Parse a --since value into epoch milliseconds.
 * Accepts duration strings ("1h", "30m") or ISO dates.
 */
export function parseSince(input: string): number {
	if (DURATION_RE.test(input)) {
		return Date.now() - parseDuration(input);
	}
	const ts = new Date(input).getTime();
	if (Number.isNaN(ts)) throw new Error(`Invalid time: "${input}"`);
	return ts;
}

/**
 * Parse a --until value into epoch milliseconds.
 * Defaults to "now". Accepts duration strings or ISO dates.
 */
export function parseUntil(input: string): number {
	if (input === "now") return Date.now();
	return parseSince(input);
}
