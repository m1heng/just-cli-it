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

export function buildSqlRequest(query: string, start: number, end: number): QueryRangeRequest {
	return {
		schemaVersion: "v1",
		start,
		end,
		requestType: "time_series",
		compositeQuery: {
			queries: [{ type: "clickhouse_sql", spec: { name: "A", query, disabled: false } }],
		},
	};
}

interface QueryRangeResponse {
	status: string;
	data?: {
		data?: {
			results?: Array<{
				aggregations?: Array<{ series?: unknown[] | null }> | null;
			}>;
		};
	};
}

function isEmptyResult(res: QueryRangeResponse): boolean {
	const results = res.data?.data?.results;
	if (!results) return true;
	return results.every((r) => !r.aggregations?.some((a) => a.series && a.series.length > 0));
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
		.option("--step <seconds>", "Step interval in seconds (PromQL only)", "60");
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

		let body: QueryRangeRequest;

		if (opts.promql) {
			const step = Number(opts.step);
			if (Number.isNaN(step) || step <= 0) {
				cmd.error(`invalid --step value: "${opts.step}". Provide a positive number in seconds`);
			}
			body = buildPromqlRequest(opts.promql, start, end, step);
		} else if (opts.sql) {
			body = buildSqlRequest(injectTimeVars(opts.sql, start, end), start, end);
		} else {
			body = JSON.parse(readFileSync(opts.file, "utf-8"));
			body.schemaVersion ??= "v1";
			body.start = start;
			body.end = end;
		}

		const result = await client<QueryRangeResponse>("/api/v5/query_range", {
			method: "POST",
			body,
		});

		formatOutput(result, opts.format as OutputFormat);

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
		"signoz query --sql 'SELECT count(*) FROM signoz_logs.distributed_logs_v2 WHERE timestamp >= ...'",
		"signoz query -f my-query.json --since 7d --until 1d",
	]);
}
