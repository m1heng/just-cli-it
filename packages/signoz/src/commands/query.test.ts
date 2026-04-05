import { describe, expect, it } from "vitest";
import { MS_TO_NS, buildPromqlRequest, buildSqlRequest } from "./query";

const START_MS = 1_700_000_000_000; // example epoch ms
const END_MS = 1_700_003_600_000;
const START_NS = START_MS * MS_TO_NS;
const END_NS = END_MS * MS_TO_NS;

describe("buildPromqlRequest", () => {
	const req = buildPromqlRequest("up", START_NS, END_NS, 60);

	it("uses nanosecond timestamps", () => {
		expect(req.start).toBe(START_NS);
		expect(req.end).toBe(END_NS);
		expect(String(req.start).length).toBeGreaterThanOrEqual(19);
	});

	it("sets step at top level", () => {
		expect(req.step).toBe(60);
	});

	it("sets queryType to promql", () => {
		expect(req.compositeQuery.queryType).toBe("promql");
	});

	it("sets panelType to time_series", () => {
		expect(req.compositeQuery.panelType).toBe("time_series");
	});

	it("puts query in promQueries map keyed by name", () => {
		expect(req.compositeQuery.promQueries).toEqual({
			A: { query: "up", disabled: false },
		});
	});

	it("leaves chQueries and builderQueries empty", () => {
		expect(req.compositeQuery.chQueries).toEqual({});
		expect(req.compositeQuery.builderQueries).toEqual({});
	});
});

describe("buildSqlRequest", () => {
	const sql = "SELECT count(*) FROM signoz_logs.distributed_logs_v2";
	const req = buildSqlRequest(sql, START_NS, END_NS);

	it("uses nanosecond timestamps", () => {
		expect(req.start).toBe(START_NS);
		expect(req.end).toBe(END_NS);
	});

	it("does not set step", () => {
		expect(req.step).toBeUndefined();
	});

	it("sets queryType to clickhouse", () => {
		expect(req.compositeQuery.queryType).toBe("clickhouse");
	});

	it("puts query in chQueries map keyed by name", () => {
		expect(req.compositeQuery.chQueries).toEqual({
			A: { query: sql, disabled: false },
		});
	});

	it("leaves promQueries and builderQueries empty", () => {
		expect(req.compositeQuery.promQueries).toEqual({});
		expect(req.compositeQuery.builderQueries).toEqual({});
	});
});

describe("MS_TO_NS conversion", () => {
	it("converts milliseconds to nanoseconds correctly", () => {
		expect(1_700_000_000_000 * MS_TO_NS).toBe(1_700_000_000_000_000_000);
	});

	it("produces 19-digit nanosecond timestamps from realistic ms input", () => {
		const nowMs = Date.now();
		const nowNs = nowMs * MS_TO_NS;
		expect(String(nowNs).length).toBeGreaterThanOrEqual(19);
	});
});
