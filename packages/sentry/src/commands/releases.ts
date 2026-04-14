import { type OutputFormat, addExamples, formatOutput } from "@jcit/core";
import type { Command } from "commander";
import { createSentryClient } from "../client";
import { addCommonOptions } from "../options";

export function registerReleases(program: Command) {
	const releases = program.command("releases").description("Manage Sentry releases");

	const list = releases
		.command("list")
		.description("List releases for an organization")
		.requiredOption("--org <slug>", "Organization slug")
		.option("--query <query>", "Filter by version prefix")
		.option("--cursor <cursor>", "Pagination cursor");
	addCommonOptions(list).action(async (opts) => {
		const client = createSentryClient({ url: opts.url, token: opts.token });
		const params = new URLSearchParams();
		if (opts.query) params.set("query", opts.query);
		if (opts.cursor) params.set("cursor", opts.cursor);
		const qs = params.toString();
		const result = await client(`/organizations/${opts.org}/releases/${qs ? `?${qs}` : ""}`);
		formatOutput(result, opts.format as OutputFormat);
	});

	addExamples(list, [
		"sentry-cli-it releases list --org my-org",
		"sentry-cli-it releases list --org my-org --query 1.0",
	]);

	const get = releases
		.command("get")
		.description("Get release details")
		.requiredOption("--org <slug>", "Organization slug")
		.argument("<version>", "Release version identifier");
	addCommonOptions(get).action(async (version, opts) => {
		const client = createSentryClient({ url: opts.url, token: opts.token });
		const result = await client(
			`/organizations/${opts.org}/releases/${encodeURIComponent(version)}/`,
		);
		formatOutput(result, opts.format as OutputFormat);
	});

	addExamples(get, ["sentry-cli-it releases get 1.0.0 --org my-org"]);

	const create = releases
		.command("create")
		.description("Create a new release")
		.requiredOption("--org <slug>", "Organization slug")
		.argument("<version>", "Release version identifier")
		.option("--project <slug>", "Project slug (repeatable)", collectValues, [])
		.option("--ref <ref>", "VCS reference (commit sha)")
		.option("--release-url <url>", "URL for the release")
		.option("--date-released <date>", "Date released (ISO 8601)");
	addCommonOptions(create).action(async (version, opts) => {
		if (opts.project.length === 0) {
			create.error("At least one --project is required.");
		}
		const client = createSentryClient({ url: opts.url, token: opts.token });
		const body: Record<string, unknown> = {
			version,
			projects: opts.project,
		};
		if (opts.ref) body.ref = opts.ref;
		if (opts.releaseUrl) body.url = opts.releaseUrl;
		if (opts.dateReleased) body.dateReleased = opts.dateReleased;
		const result = await client(`/organizations/${opts.org}/releases/`, {
			method: "POST",
			body,
		});
		formatOutput(result, opts.format as OutputFormat);
	});

	addExamples(create, [
		"sentry-cli-it releases create 1.0.0 --org my-org --project my-project",
		"sentry-cli-it releases create 1.0.0 --org my-org --project web --project api --ref abc123",
	]);

	const deploys = releases
		.command("deploys")
		.description("List deploys for a release")
		.requiredOption("--org <slug>", "Organization slug")
		.argument("<version>", "Release version identifier");
	addCommonOptions(deploys).action(async (version, opts) => {
		const client = createSentryClient({ url: opts.url, token: opts.token });
		const result = await client(
			`/organizations/${opts.org}/releases/${encodeURIComponent(version)}/deploys/`,
		);
		formatOutput(result, opts.format as OutputFormat);
	});

	addExamples(deploys, ["sentry-cli-it releases deploys 1.0.0 --org my-org"]);
}

function collectValues(value: string, previous: string[]): string[] {
	return [...previous, value];
}
