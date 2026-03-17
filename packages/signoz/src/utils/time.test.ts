import { describe, expect, it } from "vitest";
import { parseDuration, parseSince, parseUntil } from "./time";

describe("parseDuration", () => {
	it("parses seconds", () => expect(parseDuration("30s")).toBe(30_000));
	it("parses minutes", () => expect(parseDuration("5m")).toBe(300_000));
	it("parses hours", () => expect(parseDuration("1h")).toBe(3_600_000));
	it("parses days", () => expect(parseDuration("7d")).toBe(604_800_000));
	it("throws on invalid input", () => expect(() => parseDuration("abc")).toThrow());
});

describe("parseSince", () => {
	it("parses duration as relative to now", () => {
		const result = parseSince("1h");
		expect(Date.now() - result).toBeGreaterThan(3_500_000);
		expect(Date.now() - result).toBeLessThan(3_700_000);
	});

	it("parses ISO date", () => {
		const result = parseSince("2025-01-01T00:00:00Z");
		expect(result).toBe(new Date("2025-01-01T00:00:00Z").getTime());
	});
});

describe("parseUntil", () => {
	it("returns now for 'now'", () => {
		expect(Math.abs(parseUntil("now") - Date.now())).toBeLessThan(100);
	});
});
