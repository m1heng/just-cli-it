import { readFileSync } from "node:fs";
import { type OutputFormat, addExamples, formatOutput } from "@jcit/core";
import type { Command } from "commander";
import { createSignozClient } from "../client";
import { parseSince, parseUntil } from "../utils/time";

export const MS_TO_NS = 1_000_000;

interface QueryRangeRequest {
	start: number;
	end: number;
	step?: number;
	compositeQuery: {
		queryType: "promql" | "clickhouse" | "builder";
		panelType: string;
		promQueries: Record<string, { query: string; disabled: boolean; legend?: string }>;
		chQueries: Record<string, { query: string; disabled: boolean; legend?: string }>;
		builderQueries: Record<string, unknown>;
	};
	[key: string]: unknown;
}

export function buildPromqlRequest(
	query: string,
	startNs: number,
	endNs: number,
	step: number,
): QueryRangeRequest {
	return {
		start: startNs,
		end: endNs,
		step,
		compositeQuery: {
			queryType: "promql",
			panelType: "time_series",
			promQueries: { A: { query, disabled: false } },
			chQueries: {},
			builderQueries: {},
		},
	};
}

export function buildSqlRequest(query: string, startNs: number, endNs: number): QueryRangeRequest {
	return {
		start: startNs,
		end: endNs,
		compositeQuery: {
			queryType: "clickhouse",
			panelType: "time_series",
			chQueries: { A: { query, disabled: false } },
			promQueries: {},
			builderQueries: {},
		},
	};
}

export function registerQuery(program: Command) {
	const cmd = program
		.command("query")
		.description("Query traces, logs, and metrics via the unified query API")
		.option("--promql <expr>", "PromQL expression")
		.option("--sql <query>", "ClickHouse SQL query (must include timestamp WHERE clause)")
		.option("-f, --file <path>", "Load query from JSON file (v3 query_range format)")
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
			const startNs = parseSince(opts.since) * MS_TO_NS;
			const endNs = parseUntil(opts.until) * MS_TO_NS;

			let body: QueryRangeRequest;

			if (opts.promql) {
				const step = Number(opts.step);
				if (Number.isNaN(step) || step <= 0) {
					cmd.error(`invalid --step value: "${opts.step}". Provide a positive number in seconds`);
				}
				body = buildPromqlRequest(opts.promql, startNs, endNs, step);
			} else if (opts.sql) {
				body = buildSqlRequest(opts.sql, startNs, endNs);
			} else {
				body = JSON.parse(readFileSync(opts.file, "utf-8"));
				body.start = startNs;
				body.end = endNs;
			}

			const result = await client("/api/v3/query_range", {
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
