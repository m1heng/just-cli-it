import { type OutputFormat, addExamples, formatOutput } from "@jcit/core";
import type { Command } from "commander";
import { createSentryClient } from "../client";
import { addCommonOptions } from "../options";

export function registerStats(program: Command) {
	const cmd = program
		.command("stats")
		.description("Retrieve organization event count statistics (quota / usage)")
		.requiredOption("--org <slug>", "Organization slug")
		.requiredOption(
			"--group-by <dim>",
			"Grouping dimension (repeatable): outcome | category | reason | project",
			collectValues,
			[],
		)
		.option("--field <agg>", "Aggregate field", "sum(quantity)")
		.option(
			"--category <cat>",
			"Filter category: error | transaction | attachment | replay | profile | monitor",
		)
		.option(
			"--outcome <outcome>",
			"Filter outcome: accepted | filtered | rate_limited | invalid | abuse | client_discard",
		)
		.option("--stats-period <period>", "Relative time range (e.g. 24h, 14d)")
		.option("--start <iso>", "Absolute start time (ISO 8601)")
		.option("--end <iso>", "Absolute end time (ISO 8601)")
		.option("--interval <interval>", "Resolution (e.g. 1h, 1d)", "1h")
		.option("--project <id>", "Project ID filter (repeatable, -1 = all)", collectValues, []);
	addCommonOptions(cmd).action(async (opts) => {
		if (opts.groupBy.length === 0) {
			cmd.error("At least one --group-by dimension is required.");
		}
		const client = createSentryClient({ url: opts.url, token: opts.token });
		const params = new URLSearchParams();
		params.set("field", opts.field);
		for (const g of opts.groupBy) params.append("groupBy", g);
		if (opts.category) params.set("category", opts.category);
		if (opts.outcome) params.set("outcome", opts.outcome);
		if (opts.statsPeriod) params.set("statsPeriod", opts.statsPeriod);
		if (opts.start) params.set("start", opts.start);
		if (opts.end) params.set("end", opts.end);
		params.set("interval", opts.interval);
		for (const p of opts.project) params.append("project", p);
		const result = await client(`/organizations/${opts.org}/stats_v2/?${params}`);
		formatOutput(result, opts.format as OutputFormat);
	});

	addExamples(cmd, [
		"sentry-cli-it stats --org my-org --group-by category --group-by outcome --stats-period 24h",
		"sentry-cli-it stats --org my-org --group-by project --category error --stats-period 7d --format table",
	]);
}

function collectValues(value: string, previous: string[]): string[] {
	return [...previous, value];
}
