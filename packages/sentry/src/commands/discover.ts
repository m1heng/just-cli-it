import { type OutputFormat, addExamples, formatOutput } from "@jcit/core";
import type { Command } from "commander";
import { createSentryClient } from "../client";
import { addCommonOptions } from "../options";

export function registerDiscover(program: Command) {
	const discover = program
		.command("discover")
		.description("Query Sentry event data via Discover (aggregations, filters, timeseries)");

	// ── query (table format) ─────────────────────────────────────
	const query = discover
		.command("query")
		.description("Query events in table format")
		.requiredOption("--org <slug>", "Organization slug")
		.requiredOption(
			"--field <field>",
			"Field / function / equation to select (repeatable)",
			collectValues,
			[],
		)
		.option("--dataset <ds>", "Dataset: spans | logs | profile_functions | uptime_results")
		.option("--query <q>", "Sentry search syntax filter")
		.option("--sort <field>", "Sort by field (prefix with - for desc)")
		.option("--stats-period <period>", "Relative time range (e.g. 24h, 14d)")
		.option("--start <iso>", "Absolute start time (ISO 8601)")
		.option("--end <iso>", "Absolute end time (ISO 8601)")
		.option("--project <id>", "Project ID filter (repeatable, -1 = all)", collectValues, [])
		.option("--environment <env>", "Environment filter")
		.option("--per-page <n>", "Max rows (max 100)", "25");
	addCommonOptions(query).action(async (opts) => {
		const client = createSentryClient({ url: opts.url, token: opts.token });
		const params = new URLSearchParams();
		for (const f of opts.field) params.append("field", f);
		if (opts.dataset) params.set("dataset", opts.dataset);
		if (opts.query) params.set("query", opts.query);
		if (opts.sort) params.set("sort", opts.sort);
		if (opts.statsPeriod) params.set("statsPeriod", opts.statsPeriod);
		if (opts.start) params.set("start", opts.start);
		if (opts.end) params.set("end", opts.end);
		for (const p of opts.project) params.append("project", p);
		if (opts.environment) params.set("environment", opts.environment);
		params.set("per_page", opts.perPage);
		const result = await client(`/organizations/${opts.org}/events/?${params}`);
		formatOutput(result, opts.format as OutputFormat);
	});

	addExamples(query, [
		"sentry-cli-it discover query --org my-org --field title --field count() --sort -count() --stats-period 24h",
		"sentry-cli-it discover query --org my-org --field transaction --field p95(transaction.duration) --field count() --dataset spans --query 'transaction.op:http.server' --sort -count()",
		"sentry-cli-it discover query --org my-org --field 'count_unique(user)' --field level --stats-period 7d --format table",
	]);

	// ── timeseries ───────────────────────────────────────────────
	const ts = discover
		.command("timeseries")
		.description("Query events in timeseries format")
		.requiredOption("--org <slug>", "Organization slug")
		.option("--y-axis <agg>", "Aggregate for y-axis", "count()")
		.option("--dataset <ds>", "Dataset: spans | logs | profile_functions | uptime_results")
		.option("--query <q>", "Sentry search syntax filter")
		.option("--group-by <field>", "Group by field (repeatable)", collectValues, [])
		.option("--top-events <n>", "Number of top events (1-10)")
		.option("--sort <field>", "Sort field (required with --top-events)")
		.option("--stats-period <period>", "Relative time range (e.g. 24h, 14d)")
		.option("--start <iso>", "Absolute start time (ISO 8601)")
		.option("--end <iso>", "Absolute end time (ISO 8601)")
		.option("--interval <secs>", "Bucket size in seconds")
		.option("--project <id>", "Project ID filter (repeatable, -1 = all)", collectValues, [])
		.option("--environment <env>", "Environment filter");
	addCommonOptions(ts).action(async (opts) => {
		const client = createSentryClient({ url: opts.url, token: opts.token });
		const params = new URLSearchParams();
		params.set("yAxis", opts.yAxis);
		if (opts.dataset) params.set("dataset", opts.dataset);
		if (opts.query) params.set("query", opts.query);
		for (const g of opts.groupBy) params.append("groupBy", g);
		if (opts.topEvents) params.set("topEvents", opts.topEvents);
		if (opts.sort) params.set("sort", opts.sort);
		if (opts.statsPeriod) params.set("statsPeriod", opts.statsPeriod);
		if (opts.start) params.set("start", opts.start);
		if (opts.end) params.set("end", opts.end);
		if (opts.interval) params.set("interval", opts.interval);
		for (const p of opts.project) params.append("project", p);
		if (opts.environment) params.set("environment", opts.environment);
		const result = await client(`/organizations/${opts.org}/events-timeseries/?${params}`);
		formatOutput(result, opts.format as OutputFormat);
	});

	addExamples(ts, [
		"sentry-cli-it discover timeseries --org my-org --y-axis count() --stats-period 24h",
		"sentry-cli-it discover timeseries --org my-org --y-axis p95(transaction.duration) --dataset spans --group-by transaction --top-events 5 --sort -count() --stats-period 7d",
	]);

	// ── saved queries ────────────────────────────────────────────
	const saved = discover.command("saved").description("Manage saved Discover queries");

	const savedList = saved
		.command("list")
		.description("List saved queries")
		.requiredOption("--org <slug>", "Organization slug")
		.option("--query <term>", "Filter by name")
		.option(
			"--sort-by <field>",
			"Sort: name | dateCreated | dateUpdated | mostPopular | recentlyViewed | myqueries",
		)
		.option("--per-page <n>", "Max results (max 100)")
		.option("--cursor <cursor>", "Pagination cursor");
	addCommonOptions(savedList).action(async (opts) => {
		const client = createSentryClient({ url: opts.url, token: opts.token });
		const params = new URLSearchParams();
		if (opts.query) params.set("query", opts.query);
		if (opts.sortBy) params.set("sortBy", opts.sortBy);
		if (opts.perPage) params.set("per_page", opts.perPage);
		if (opts.cursor) params.set("cursor", opts.cursor);
		const qs = params.toString();
		const result = await client(`/organizations/${opts.org}/discover/saved/${qs ? `?${qs}` : ""}`);
		formatOutput(result, opts.format as OutputFormat);
	});

	addExamples(savedList, ["sentry-cli-it discover saved list --org my-org"]);

	const savedGet = saved
		.command("get")
		.description("Get a saved query")
		.requiredOption("--org <slug>", "Organization slug")
		.argument("<query-id>", "Saved query ID");
	addCommonOptions(savedGet).action(async (queryId, opts) => {
		const client = createSentryClient({ url: opts.url, token: opts.token });
		const result = await client(`/organizations/${opts.org}/discover/saved/${queryId}/`);
		formatOutput(result, opts.format as OutputFormat);
	});

	addExamples(savedGet, ["sentry-cli-it discover saved get 123 --org my-org"]);

	const savedDelete = saved
		.command("delete")
		.description("Delete a saved query")
		.requiredOption("--org <slug>", "Organization slug")
		.argument("<query-id>", "Saved query ID");
	addCommonOptions(savedDelete).action(async (queryId, opts) => {
		const client = createSentryClient({ url: opts.url, token: opts.token });
		await client(`/organizations/${opts.org}/discover/saved/${queryId}/`, { method: "DELETE" });
		console.log(`Saved query ${queryId} deleted.`);
	});

	addExamples(savedDelete, ["sentry-cli-it discover saved delete 123 --org my-org"]);
}

function collectValues(value: string, previous: string[]): string[] {
	return [...previous, value];
}
