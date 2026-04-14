import { type OutputFormat, addExamples, formatOutput } from "@jcit/core";
import type { Command } from "commander";
import { createSentryClient } from "../client";
import { addCommonOptions } from "../options";

export function registerProjects(program: Command) {
	const projects = program.command("projects").description("Manage Sentry projects");

	const list = projects
		.command("list")
		.description("List projects in an organization")
		.requiredOption("--org <slug>", "Organization slug")
		.option("--cursor <cursor>", "Pagination cursor");
	addCommonOptions(list).action(async (opts) => {
		const client = createSentryClient({ url: opts.url, token: opts.token });
		const params = new URLSearchParams();
		if (opts.cursor) params.set("cursor", opts.cursor);
		const qs = params.toString();
		const result = await client(`/organizations/${opts.org}/projects/${qs ? `?${qs}` : ""}`);
		formatOutput(result, opts.format as OutputFormat);
	});

	addExamples(list, [
		"sentry-cli-it projects list --org my-org",
		"sentry-cli-it projects list --org my-org --format table",
	]);

	const get = projects
		.command("get")
		.description("Get project details")
		.requiredOption("--org <slug>", "Organization slug")
		.argument("<project-slug>", "Project slug");
	addCommonOptions(get).action(async (projectSlug, opts) => {
		const client = createSentryClient({ url: opts.url, token: opts.token });
		const result = await client(`/projects/${opts.org}/${projectSlug}/`);
		formatOutput(result, opts.format as OutputFormat);
	});

	addExamples(get, ["sentry-cli-it projects get my-project --org my-org"]);
}
