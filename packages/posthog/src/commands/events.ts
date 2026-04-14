import { type OutputFormat, addExamples, formatOutput } from "@jcit/core";
import type { Command } from "commander";
import { createPostHogClient, resolveProjectId } from "../client";
import { addCommonOptions } from "../options";

export function registerEvents(program: Command) {
	const events = program.command("events").description("List and inspect PostHog events");

	const list = events
		.command("list")
		.description("List recent events")
		.option("--event <name>", "Filter by event name")
		.option("--distinct-id <id>", "Filter by distinct ID")
		.option("--after <date>", "Events after this ISO timestamp")
		.option("--before <date>", "Events before this ISO timestamp")
		.option("--limit <n>", "Max results", "100")
		.option("--offset <n>", "Pagination offset");
	addCommonOptions(list).action(async (opts) => {
		const client = createPostHogClient({ url: opts.url, token: opts.token });
		const projectId = resolveProjectId({ projectId: opts.projectId });
		const params = new URLSearchParams();
		if (opts.event) params.set("event", opts.event);
		if (opts.distinctId) params.set("distinct_id", opts.distinctId);
		if (opts.after) params.set("after", opts.after);
		if (opts.before) params.set("before", opts.before);
		if (opts.limit) params.set("limit", opts.limit);
		if (opts.offset) params.set("offset", opts.offset);
		const qs = params.toString();
		const result = await client(`/api/projects/${projectId}/events/${qs ? `?${qs}` : ""}`);
		formatOutput(result, opts.format as OutputFormat);
	});

	addExamples(list, [
		"posthog-cli-it events list",
		"posthog-cli-it events list --event '$pageview' --limit 50",
		"posthog-cli-it events list --distinct-id user123 --after 2025-01-01T00:00:00Z",
	]);
}
