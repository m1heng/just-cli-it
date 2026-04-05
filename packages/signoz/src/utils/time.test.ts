import { describe, expect, it } from "vitest";
import { injectTimeVars, parseDuration, parseSince, parseUntil } from "./time";

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

describe("injectTimeVars", () => {
	const startMs = 1_700_000_000_000;
	const endMs = 1_700_003_600_000;

	it("replaces {{start_ms}} and {{end_ms}}", () => {
		const sql = "WHERE unix_milli >= {{start_ms}} AND unix_milli < {{end_ms}}";
		expect(injectTimeVars(sql, startMs, endMs)).toBe(
			`WHERE unix_milli >= ${startMs} AND unix_milli < ${endMs}`,
		);
	});

	it("replaces {{start_s}} and {{end_s}} as floored seconds", () => {
		const sql = "WHERE ts_bucket_start >= {{start_s}}";
		expect(injectTimeVars(sql, startMs, endMs)).toBe("WHERE ts_bucket_start >= 1700000000");
	});

	it("replaces {{start_ns}} and {{end_ns}} as nanoseconds", () => {
		const sql = "WHERE timestamp >= {{start_ns}} AND timestamp <= {{end_ns}}";
		expect(injectTimeVars(sql, startMs, endMs)).toBe(
			"WHERE timestamp >= 1700000000000000000 AND timestamp <= 1700003600000000000",
		);
	});

	it("leaves SQL unchanged when no variables present", () => {
		const sql = "SELECT count(*) FROM table";
		expect(injectTimeVars(sql, startMs, endMs)).toBe(sql);
	});
});
