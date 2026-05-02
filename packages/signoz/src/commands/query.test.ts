import { describe, expect, it } from "vitest";
import { buildPromqlRequest, buildSqlRequest, flattenQueryResult, flattenSeries } from "./query";

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
		expect(q.spec).toEqual({ name: "A", query: "up", step: 60, disabled: false, stats: false });
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

	it("supports raw request type for log rows", () => {
		const rawReq = buildSqlRequest(sql, START, END, "raw");
		expect(rawReq.requestType).toBe("raw");
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

	it("includes schemaVersion v1", () => {
		expect(req.schemaVersion).toBe("v1");
	});

	it("compositeQuery contains only queries array", () => {
		expect(Object.keys(req.compositeQuery)).toEqual(["queries"]);
	});
});

describe("flattenSeries", () => {
	it("flattens labels + values into one row per data point", () => {
		const res = {
			status: "success",
			data: {
				data: {
					results: [
						{
							aggregations: [
								{
									series: [
										{
											labels: [{ key: { name: "severity_text" }, value: "WARN" }],
											values: [
												{ timestamp: 1_700_000_000_000, value: 14 },
												{ timestamp: 1_700_003_600_000, value: 34 },
											],
										},
									],
								},
							],
						},
					],
				},
			},
		};
		const rows = flattenSeries(res);
		expect(rows).toHaveLength(2);
		expect(rows[0]).toEqual({
			ts: new Date(1_700_000_000_000).toISOString(),
			severity_text: "WARN",
			value: 14,
		});
		expect(rows[1].value).toBe(34);
	});

	it("returns empty array for null series", () => {
		const res = {
			status: "success",
			data: {
				data: {
					results: [{ aggregations: [{ series: null }] }],
				},
			},
		};
		expect(flattenSeries(res)).toEqual([]);
	});

	it("returns empty array for missing data", () => {
		expect(flattenSeries({ status: "success" })).toEqual([]);
	});
});

describe("flattenQueryResult", () => {
	it("flattens raw log rows into readable table rows", () => {
		const res = {
			status: "success",
			data: {
				type: "raw",
				data: {
					results: [
						{
							queryName: "A",
							rows: [
								{
									timestamp: "2025-07-31T00:56:48.40583808Z",
									data: {
										attributes_string: {
											service: "demo-service",
											"code.function": "ProcessRequest",
										},
										body: "Processing request",
										id: "log-1",
										severity_text: "INFO",
										span_id: "span-1",
										timestamp: "1753923408405838080",
										trace_id: "trace-1",
									},
								},
							],
						},
					],
				},
			},
		};

		expect(flattenQueryResult(res)).toEqual([
			{
				ts: "2025-07-31T00:56:48.40583808Z",
				service: "demo-service",
				level: "INFO",
				body: "Processing request",
				trace_id: "trace-1",
				span_id: "span-1",
				id: "log-1",
				attributes_string: {
					service: "demo-service",
					"code.function": "ProcessRequest",
				},
			},
		]);
	});

	it("flattens scalar query responses into table rows", () => {
		const res = {
			status: "success",
			data: {
				type: "scalar",
				data: {
					results: [
						{
							columns: [
								{ name: "severity_text", columnType: "group", queryName: "A" },
								{ name: "count()", columnType: "aggregation", queryName: "A" },
							],
							data: [
								["ERROR", 3],
								["WARN", 5],
							],
						},
					],
				},
			},
		};

		expect(flattenQueryResult(res)).toEqual([
			{ severity_text: "ERROR", "count()": 3 },
			{ severity_text: "WARN", "count()": 5 },
		]);
	});

	it("formats raw nanosecond timestamps without losing precision", () => {
		const res = {
			status: "success",
			data: {
				type: "raw",
				data: {
					results: [
						{
							queryName: "A",
							rows: [
								{
									data: {
										body: "Processing request",
										timestamp: "1753923408405838080",
									},
								},
							],
						},
					],
				},
			},
		};

		expect(flattenQueryResult(res)).toEqual([
			{
				ts: "2025-07-31T00:56:48.405Z",
				body: "Processing request",
			},
		]);
	});

	it("does not fall back to the whole response when no rows are present", () => {
		const res = {
			status: "success",
			data: {
				type: "raw",
				data: {
					results: [{ queryName: "A", rows: [] }],
				},
			},
		};

		expect(flattenQueryResult(res)).toEqual([]);
	});
});
