import { type OutputFormat, addExamples, formatOutput } from "@jcit/core";
import type { Command } from "commander";
import { createSentryClient } from "../client";
import { addCommonOptions } from "../options";

export function registerIssues(program: Command) {
	const issues = program.command("issues").description("Manage Sentry issues");

	const list = issues
		.command("list")
		.description("List issues for an organization")
		.requiredOption("--org <slug>", "Organization slug")
		.option("--project <id>", "Filter by project ID (repeatable)", collectValues, [])
		.option("--query <query>", "Sentry search query", "is:unresolved")
		.option("--sort <field>", "Sort by: date | freq | new | trends | user", "date")
		.option("--environment <env>", "Filter by environment")
		.option("--stats-period <period>", "Stats period (e.g. 24h, 14d)")
		.option("--limit <n>", "Max results (max 100)", "25")
		.option("--cursor <cursor>", "Pagination cursor");
	addCommonOptions(list).action(async (opts) => {
		const client = createSentryClient({ url: opts.url, token: opts.token });
		const params = new URLSearchParams();
		params.set("query", opts.query);
		params.set("sort", opts.sort);
		if (opts.limit) params.set("limit", opts.limit);
		if (opts.cursor) params.set("cursor", opts.cursor);
		if (opts.environment) params.set("environment", opts.environment);
		if (opts.statsPeriod) params.set("statsPeriod", opts.statsPeriod);
		for (const p of opts.project) params.append("project", p);
		const result = await client(`/organizations/${opts.org}/issues/?${params}`);
		formatOutput(result, opts.format as OutputFormat);
	});

	addExamples(list, [
		"sentry-cli-it issues list --org my-org",
		"sentry-cli-it issues list --org my-org --query 'is:unresolved level:error' --sort freq",
		"sentry-cli-it issues list --org my-org --project 12345 --environment production",
	]);

	const get = issues
		.command("get")
		.description("Get details of a specific issue")
		.requiredOption("--org <slug>", "Organization slug")
		.argument("<issue-id>", "Issue ID");
	addCommonOptions(get).action(async (issueId, opts) => {
		const client = createSentryClient({ url: opts.url, token: opts.token });
		const result = await client(`/organizations/${opts.org}/issues/${issueId}/`);
		formatOutput(result, opts.format as OutputFormat);
	});

	addExamples(get, ["sentry-cli-it issues get 12345 --org my-org"]);

	const update = issues
		.command("update")
		.description("Update an issue (resolve, assign, etc.)")
		.requiredOption("--org <slug>", "Organization slug")
		.argument("<issue-id>", "Issue ID")
		.option("--status <status>", "Set status: resolved | unresolved | ignored")
		.option("--assigned-to <user>", "Assign to user or team (e.g. user:jane, team:backend)");
	addCommonOptions(update).action(async (issueId, opts) => {
		const client = createSentryClient({ url: opts.url, token: opts.token });
		const body: Record<string, unknown> = {};
		if (opts.status) body.status = opts.status;
		if (opts.assignedTo) body.assignedTo = opts.assignedTo;
		if (Object.keys(body).length === 0) {
			program.error("Provide at least one field to update (--status, --assigned-to).");
		}
		const result = await client(`/organizations/${opts.org}/issues/${issueId}/`, {
			method: "PUT",
			body,
		});
		formatOutput(result, opts.format as OutputFormat);
	});

	addExamples(update, [
		"sentry-cli-it issues update 12345 --org my-org --status resolved",
		"sentry-cli-it issues update 12345 --org my-org --assigned-to user:jane",
	]);

	const events = issues
		.command("events")
		.description("List events for an issue")
		.requiredOption("--org <slug>", "Organization slug")
		.argument("<issue-id>", "Issue ID")
		.option("--full", "Include full event details")
		.option("--cursor <cursor>", "Pagination cursor");
	addCommonOptions(events).action(async (issueId, opts) => {
		const client = createSentryClient({ url: opts.url, token: opts.token });
		const params = new URLSearchParams();
		if (opts.full) params.set("full", "true");
		if (opts.cursor) params.set("cursor", opts.cursor);
		const qs = params.toString();
		const result = await client(
			`/organizations/${opts.org}/issues/${issueId}/events/${qs ? `?${qs}` : ""}`,
		);
		formatOutput(result, opts.format as OutputFormat);
	});

	addExamples(events, [
		"sentry-cli-it issues events 12345 --org my-org",
		"sentry-cli-it issues events 12345 --org my-org --full",
	]);
}

function collectValues(value: string, previous: string[]): string[] {
	return [...previous, value];
}
