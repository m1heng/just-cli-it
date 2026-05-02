import { readFileSync } from "node:fs";
import { type OutputFormat, addExamples, formatOutput } from "@jcit/core";
import type { Command } from "commander";
import { consola } from "consola";
import { createSignozClient } from "../client";
import { addCommonOptions } from "../options";
import { injectTimeVars, parseSince, parseUntil } from "../utils/time";

interface QueryEnvelope {
	type: string;
	spec: Record<string, unknown>;
}

interface QueryRangeRequest {
	start: number;
	end: number;
	requestType: string;
	compositeQuery: { queries: QueryEnvelope[] };
	[key: string]: unknown;
}

const SQL_REQUEST_TYPES = ["time_series", "scalar", "raw", "trace"] as const;
type SqlRequestType = (typeof SQL_REQUEST_TYPES)[number];

export function buildPromqlRequest(
	query: string,
	start: number,
	end: number,
	step: number,
): QueryRangeRequest {
	return {
		schemaVersion: "v1",
		start,
		end,
		requestType: "time_series",
		compositeQuery: {
			queries: [
				{ type: "promql", spec: { name: "A", query, step, disabled: false, stats: false } },
			],
		},
	};
}

export function buildSqlRequest(
	query: string,
	start: number,
	end: number,
	requestType: SqlRequestType = "time_series",
): QueryRangeRequest {
	return {
		schemaVersion: "v1",
		start,
		end,
		requestType,
		compositeQuery: {
			queries: [{ type: "clickhouse_sql", spec: { name: "A", query, disabled: false } }],
		},
	};
}

interface SeriesLabel {
	key: { name: string };
	value: unknown;
}

interface SeriesValue {
	timestamp: number;
	value: unknown;
}

interface Series {
	labels?: SeriesLabel[];
	values?: SeriesValue[];
}

interface QueryRangeResponse {
	status?: string;
	type?: string;
	data?: unknown;
}

function isEmptyResult(res: QueryRangeResponse): boolean {
	return flattenQueryResult(res).length === 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getQueryPayload(res: QueryRangeResponse): Record<string, unknown> | undefined {
	if (!isRecord(res)) return undefined;

	const data = res.data;
	if (isRecord(data) && isRecord(data.data)) {
		const nestedData = data.data;
		if (Array.isArray(nestedData.results)) return data;
	}

	if (isRecord(data) && Array.isArray(data.results)) return res;

	return undefined;
}

function getResultEntries(res: QueryRangeResponse): unknown[] {
	const payload = getQueryPayload(res);
	const data = payload?.data;
	if (!isRecord(data) || !Array.isArray(data.results)) return [];
	return data.results;
}

function getResponseType(res: QueryRangeResponse): string | undefined {
	const payload = getQueryPayload(res);
	return typeof payload?.type === "string" ? payload.type : undefined;
}

function toIsoTimestamp(timestamp: unknown): unknown {
	if (typeof timestamp === "string") {
		if (!/^\d+$/.test(timestamp)) return timestamp;
		const value = BigInt(timestamp);
		const millis =
			value > 1_000_000_000_000_000n
				? Number(value / 1_000_000n)
				: value > 100_000_000_000n
					? Number(value)
					: Number(value * 1000n);
		return new Date(millis).toISOString();
	}

	if (typeof timestamp !== "number" || !Number.isFinite(timestamp)) return timestamp;

	const millis =
		timestamp > 1_000_000_000_000_000
			? Math.trunc(timestamp / 1_000_000)
			: timestamp > 100_000_000_000
				? timestamp
				: timestamp * 1000;

	return new Date(millis).toISOString();
}

function getColumnName(column: unknown, index: number, used: Set<string>): string {
	const col = isRecord(column) ? column : {};
	const baseCandidates = [col.name, col.key, col.queryName, `col_${index}`];
	const base =
		baseCandidates.find(
			(value): value is string => typeof value === "string" && value.length > 0,
		) ?? `col_${index}`;

	let name = base;
	let suffix = 2;
	while (used.has(name)) {
		name = `${base}_${suffix}`;
		suffix += 1;
	}
	used.add(name);
	return name;
}

function findNestedString(data: Record<string, unknown>, sources: string[], keys: string[]) {
	for (const source of sources) {
		const nested = data[source];
		if (!isRecord(nested)) continue;
		for (const key of keys) {
			const value = nested[key];
			if (typeof value === "string" && value.length > 0) return value;
		}
	}
	return undefined;
}

function findServiceName(data: Record<string, unknown>): string | undefined {
	const keys = ["service.name", "service", "serviceName", "service_name", "otelServiceName"];
	for (const key of keys) {
		const value = data[key];
		if (typeof value === "string" && value.length > 0) return value;
	}

	return findNestedString(data, ["resources_string", "resource_string", "attributes_string"], keys);
}

function flattenRawRow(row: unknown): Record<string, unknown> {
	if (!isRecord(row)) return { value: row };

	const data = isRecord(row.data) ? row.data : {};
	const output: Record<string, unknown> = {};
	const consumed = new Set([
		"timestamp",
		"service.name",
		"service",
		"serviceName",
		"service_name",
		"otelServiceName",
		"severity_text",
		"body",
		"trace_id",
		"span_id",
		"id",
	]);

	const timestamp = row.timestamp ?? data.timestamp;
	if (timestamp !== undefined) output.ts = toIsoTimestamp(timestamp);

	const service = findServiceName(data);
	if (service) output.service = service;
	if (data.severity_text !== undefined) output.level = data.severity_text;
	if (data.body !== undefined) output.body = data.body;
	if (data.trace_id !== undefined) output.trace_id = data.trace_id;
	if (data.span_id !== undefined) output.span_id = data.span_id;
	if (data.id !== undefined) output.id = data.id;

	for (const [key, value] of Object.entries(data)) {
		if (!consumed.has(key)) output[key] = value;
	}

	return output;
}

function flattenRawRows(res: QueryRangeResponse): Record<string, unknown>[] {
	const rows: Record<string, unknown>[] = [];

	for (const result of getResultEntries(res)) {
		if (!isRecord(result) || !Array.isArray(result.rows)) continue;
		for (const row of result.rows) {
			rows.push(flattenRawRow(row));
		}
	}

	return rows;
}

function flattenScalarRows(res: QueryRangeResponse): Record<string, unknown>[] {
	const rows: Record<string, unknown>[] = [];

	for (const result of getResultEntries(res)) {
		if (!isRecord(result) || !Array.isArray(result.columns) || !Array.isArray(result.data)) {
			continue;
		}

		const used = new Set<string>();
		const columns = result.columns.map((column, index) => getColumnName(column, index, used));

		for (const dataRow of result.data) {
			if (!Array.isArray(dataRow)) continue;
			const row: Record<string, unknown> = {};
			for (const [index, column] of columns.entries()) {
				row[column] = dataRow[index];
			}
			rows.push(row);
		}
	}

	return rows;
}

/** Flatten nested v5 query_range response into one row per data point. */
export function flattenSeries(res: QueryRangeResponse): Record<string, unknown>[] {
	const rows: Record<string, unknown>[] = [];
	for (const result of getResultEntries(res)) {
		if (!isRecord(result) || !Array.isArray(result.aggregations)) continue;
		for (const agg of result.aggregations) {
			if (!isRecord(agg) || !Array.isArray(agg.series)) continue;
			for (const s of agg.series) {
				if (!isRecord(s) || !Array.isArray(s.values)) continue;
				const labels: Record<string, unknown> = {};
				const series = s as Series;
				for (const l of series.labels ?? []) {
					labels[l.key.name] = l.value;
				}
				for (const v of series.values ?? []) {
					rows.push({ ts: toIsoTimestamp(v.timestamp), ...labels, value: v.value });
				}
			}
		}
	}
	return rows;
}

export function flattenQueryResult(res: QueryRangeResponse): Record<string, unknown>[] {
	switch (getResponseType(res)) {
		case "raw":
		case "trace":
			return flattenRawRows(res);
		case "scalar":
			return flattenScalarRows(res);
		case "time_series":
			return flattenSeries(res);
		default: {
			for (const flatten of [flattenRawRows, flattenScalarRows, flattenSeries]) {
				const rows = flatten(res);
				if (rows.length > 0) return rows;
			}
			return [];
		}
	}
}

function parseSqlRequestType(value: unknown, cmd: Command): SqlRequestType | undefined {
	if (value === undefined) return undefined;
	if (typeof value === "string" && SQL_REQUEST_TYPES.includes(value as SqlRequestType)) {
		return value as SqlRequestType;
	}

	cmd.error(
		`invalid --request-type value: "${value}". Expected one of ${SQL_REQUEST_TYPES.join(", ")}`,
	);
}

export function registerQuery(program: Command) {
	const cmd = program
		.command("query")
		.description("Query traces, logs, and metrics via the unified query API")
		.option("--promql <expr>", "PromQL expression")
		.option("--sql <query>", "ClickHouse SQL query (use {{start_ms}} etc. for time injection)")
		.option("-f, --file <path>", "Load query from JSON file (v5 query_range format)")
		.option("--since <time>", "Start time: duration ago (1h, 30m, 7d) or ISO date", "1h")
		.option("--until <time>", "End time: 'now', duration ago, or ISO date", "now")
		.option("--step <seconds>", "Step interval in seconds (PromQL only)", "60")
		.option("--request-type <type>", "SQL/file result type: time_series | scalar | raw | trace");
	addCommonOptions(cmd).action(async (opts) => {
		const modes = [opts.promql, opts.sql, opts.file].filter(Boolean);
		if (modes.length === 0) {
			cmd.error("specify one of --promql, --sql, or --file");
		}
		if (modes.length > 1) {
			cmd.error("specify only one of --promql, --sql, or --file");
		}

		const client = createSignozClient({ url: opts.url, token: opts.token });
		const start = parseSince(opts.since);
		const end = parseUntil(opts.until);
		const sqlRequestType = parseSqlRequestType(opts.requestType, cmd);

		let body: QueryRangeRequest;

		if (opts.promql) {
			if (sqlRequestType && sqlRequestType !== "time_series") {
				cmd.error("--request-type is only supported as time_series for --promql");
			}
			const step = Number(opts.step);
			if (Number.isNaN(step) || step <= 0) {
				cmd.error(`invalid --step value: "${opts.step}". Provide a positive number in seconds`);
			}
			body = buildPromqlRequest(opts.promql, start, end, step);
		} else if (opts.sql) {
			body = buildSqlRequest(
				injectTimeVars(opts.sql, start, end),
				start,
				end,
				sqlRequestType ?? "time_series",
			);
		} else {
			body = JSON.parse(readFileSync(opts.file, "utf-8"));
			body.schemaVersion ??= "v1";
			body.start = start;
			body.end = end;
			if (sqlRequestType) body.requestType = sqlRequestType;
		}

		const result = await client<QueryRangeResponse>("/api/v5/query_range", {
			method: "POST",
			body,
		});

		if (opts.format === "table") {
			formatOutput(flattenQueryResult(result), "table" as OutputFormat);
		} else {
			formatOutput(result, opts.format as OutputFormat);
		}

		if (opts.promql && isEmptyResult(result)) {
			consola.warn(
				"PromQL returned no data. Common causes:\n" +
					"  • Delta-temporality metrics (e.g. signoz_calls_total) are not queryable via PromQL — use --sql or the builder API instead\n" +
					'  • OTel dot-separated names require {__name__="metric.name"} syntax',
			);
		}
	});

	addExamples(cmd, [
		"signoz query --promql '{__name__=\"http.client.request.duration.bucket\"}' --since 1h",
		"signoz query --promql 'rate(http_requests_total[5m])' --since 1h",
		"signoz query --request-type raw --format table --sql 'SELECT timestamp, severity_text, body FROM signoz_logs.distributed_logs_v2 WHERE timestamp >= {{start_ns}} LIMIT 20'",
		"signoz query -f my-query.json --since 7d --until 1d",
	]);
}
