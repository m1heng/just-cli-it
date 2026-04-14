import { type OutputFormat, addExamples, formatOutput } from "@jcit/core";
import type { Command } from "commander";
import { createSentryClient } from "../client";
import { addCommonOptions } from "../options";

export function registerEvents(program: Command) {
	const events = program.command("events").description("List and inspect Sentry events");

	const list = events
		.command("list")
		.description("List events for a project")
		.requiredOption("--org <slug>", "Organization slug")
		.requiredOption("--project <slug>", "Project slug")
		.option("--full", "Include full event details")
		.option("--cursor <cursor>", "Pagination cursor");
	addCommonOptions(list).action(async (opts) => {
		const client = createSentryClient({ url: opts.url, token: opts.token });
		const params = new URLSearchParams();
		if (opts.full) params.set("full", "true");
		if (opts.cursor) params.set("cursor", opts.cursor);
		const qs = params.toString();
		const result = await client(
			`/projects/${opts.org}/${opts.project}/events/${qs ? `?${qs}` : ""}`,
		);
		formatOutput(result, opts.format as OutputFormat);
	});

	addExamples(list, [
		"sentry-cli-it events list --org my-org --project my-project",
		"sentry-cli-it events list --org my-org --project my-project --full",
	]);

	const get = events
		.command("get")
		.description("Get a specific event")
		.requiredOption("--org <slug>", "Organization slug")
		.requiredOption("--project <slug>", "Project slug")
		.argument("<event-id>", "Event ID");
	addCommonOptions(get).action(async (eventId, opts) => {
		const client = createSentryClient({ url: opts.url, token: opts.token });
		const result = await client(`/projects/${opts.org}/${opts.project}/events/${eventId}/`);
		formatOutput(result, opts.format as OutputFormat);
	});

	addExamples(get, ["sentry-cli-it events get abc123 --org my-org --project my-project"]);
}
