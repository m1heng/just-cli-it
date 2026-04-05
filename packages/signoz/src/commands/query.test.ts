import { describe, expect, it } from "vitest";
import { buildPromqlRequest, buildSqlRequest } from "./query";

const START = 1_700_000_000_000;
const END = 1_700_003_600_000;

describe("buildPromqlRequest", () => {
	const req = buildPromqlRequest("up", START, END, 60);

	it("uses millisecond timestamps", () => {
		expect(req.start).toBe(START);
		expect(req.end).toBe(END);
		expect(String(req.start)).toHaveLength(13);
	});

	it("sets requestType to time_series", () => {
		expect(req.requestType).toBe("time_series");
	});

	it("wraps query as a promql QueryEnvelope", () => {
		expect(req.compositeQuery.queries).toHaveLength(1);
		const q = req.compositeQuery.queries[0];
		expect(q.type).toBe("promql");
		expect(q.spec).toEqual({ name: "A", query: "up", step: 60, disabled: false });
	});

	it("puts step inside spec, not at top level", () => {
		expect(req.compositeQuery.queries[0].spec.step).toBe(60);
		expect((req as Record<string, unknown>).step).toBeUndefined();
	});
});

describe("buildSqlRequest", () => {
	const sql = "SELECT count(*) FROM signoz_logs.distributed_logs_v2";
	const req = buildSqlRequest(sql, START, END);

	it("uses millisecond timestamps", () => {
		expect(req.start).toBe(START);
		expect(req.end).toBe(END);
	});

	it("sets requestType to time_series", () => {
		expect(req.requestType).toBe("time_series");
	});

	it("wraps query as a clickhouse_sql QueryEnvelope", () => {
		expect(req.compositeQuery.queries).toHaveLength(1);
		const q = req.compositeQuery.queries[0];
		expect(q.type).toBe("clickhouse_sql");
		expect(q.spec).toEqual({ name: "A", query: sql, disabled: false });
	});
});

describe("v5 payload structure", () => {
	const req = buildPromqlRequest("up", START, END, 60);

	it("has only valid top-level fields per v5 spec", () => {
		const keys = Object.keys(req);
		const validFields = [
			"schemaVersion",
			"start",
			"end",
			"requestType",
			"compositeQuery",
			"variables",
			"noCache",
			"formatOptions",
		];
		for (const key of keys) {
			expect(validFields).toContain(key);
		}
	});

	it("compositeQuery contains only queries array", () => {
		expect(Object.keys(req.compositeQuery)).toEqual(["queries"]);
	});
});
