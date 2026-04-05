import { type OutputFormat, addExamples, formatOutput } from "@jcit/core";
import type { Command } from "commander";
import { createSignozClient } from "../client";
import { addCommonOptions } from "../options";

const LIST_SQL = `SELECT now() as ts,
	metric_name, temporality, type, unit,
	count(*) as value
FROM signoz_metrics.distributed_metadata
GROUP BY metric_name, temporality, type, unit
ORDER BY metric_name`;

interface MetricRow {
	name: string;
	temporality: string;
	type: string;
	unit: string;
	promql: string;
}

interface QueryResult {
	data?: {
		data?: {
			results?: Array<{
				aggregations?: Array<{
					series?: Array<{
						labels?: Array<{ key: { name: string }; value: string }>;
					}> | null;
				}> | null;
			}>;
		};
	};
}

function extractMetrics(result: QueryResult): MetricRow[] {
	const series = result.data?.data?.results?.[0]?.aggregations?.[0]?.series;
	if (!series) return [];

	return series.map((s) => {
		const labels: Record<string, string> = {};
		for (const l of s.labels ?? []) {
			labels[l.key.name] = l.value;
		}
		const temporality = labels.temporality ?? "";
		const promqlOk = temporality === "Cumulative" || temporality === "Unspecified";
		return {
			name: labels.metric_name ?? "",
			temporality,
			type: labels.type ?? "",
			unit: labels.unit ?? "",
			promql: promqlOk ? "yes" : "no",
		};
	});
}

export function registerMetrics(program: Command) {
	const cmd = program
		.command("metrics")
		.description("List available metrics with temporality and type");
	addCommonOptions(cmd).action(async (opts) => {
		const client = createSignozClient({ url: opts.url, token: opts.token });
		const now = Date.now();

		const result = await client<QueryResult>("/api/v5/query_range", {
			method: "POST",
			body: {
				schemaVersion: "v1",
				start: now - 3_600_000,
				end: now,
				requestType: "time_series",
				compositeQuery: {
					queries: [
						{ type: "clickhouse_sql", spec: { name: "A", query: LIST_SQL, disabled: false } },
					],
				},
			},
		});

		const metrics = extractMetrics(result);

		if (opts.format === "json") {
			formatOutput(metrics, "json" as OutputFormat);
		} else {
			formatOutput(metrics, opts.format as OutputFormat);
		}
	});

	addExamples(cmd, ["signoz metrics", "signoz metrics --format table"]);
}
