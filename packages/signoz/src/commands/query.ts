import { readFileSync } from "node:fs";
import { type OutputFormat, addExamples, formatOutput } from "@jcit/core";
import type { Command } from "commander";
import { createSignozClient } from "../client";
import { parseSince, parseUntil } from "../utils/time";

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
		start,
		end,
		requestType: "time_series",
		compositeQuery: {
			queries: [{ type: "promql", spec: { name: "A", query, step, disabled: false } }],
		},
	};
}

export function buildSqlRequest(query: string, start: number, end: number): QueryRangeRequest {
	return {
		start,
		end,
		requestType: "time_series",
		compositeQuery: {
			queries: [{ type: "clickhouse_sql", spec: { name: "A", query, disabled: false } }],
		},
	};
}

export function registerQuery(program: Command) {
	const cmd = program
		.command("query")
		.description("Query traces, logs, and metrics via the unified query API")
		.option("--promql <expr>", "PromQL expression")
		.option("--sql <query>", "ClickHouse SQL query (must include timestamp WHERE clause)")
		.option("-f, --file <path>", "Load query from JSON file (v5 query_range format)")
		.option("--since <time>", "Start time: duration ago (1h, 30m, 7d) or ISO date", "1h")
		.option("--until <time>", "End time: 'now', duration ago, or ISO date", "now")
		.option("--step <seconds>", "Step interval in seconds (PromQL only)", "60")
		.option("--format <format>", "Output format: json | table | text", "json")
		.option("--url <url>", "SigNoz API base URL")
		.option("--token <token>", "SigNoz API token")
		.action(async (opts) => {
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
				body = buildSqlRequest(opts.sql, start, end);
			} else {
				body = JSON.parse(readFileSync(opts.file, "utf-8"));
				body.start = start;
				body.end = end;
			}

			const result = await client("/api/v5/query_range", {
				method: "POST",
				body,
			});

			formatOutput(result, opts.format as OutputFormat);
		});

	addExamples(cmd, [
		"signoz query --promql 'rate(http_requests_total[5m])' --since 1h",
		"signoz query --sql 'SELECT count(*) FROM signoz_logs.distributed_logs_v2 WHERE timestamp >= ...'",
		"signoz query -f my-query.json --since 7d --until 1d",
		"signoz query --promql 'up' --format table --step 30",
	]);
}
