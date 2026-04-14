import { type OutputFormat, addExamples, formatOutput } from "@jcit/core";
import type { Command } from "commander";
import { createPostHogClient, resolveProjectId } from "../client";
import { addCommonOptions } from "../options";

export function registerInsights(program: Command) {
	const insights = program.command("insights").description("Manage PostHog insights");

	const list = insights
		.command("list")
		.description("List saved insights")
		.option("--limit <n>", "Max results", "100")
		.option("--offset <n>", "Pagination offset");
	addCommonOptions(list).action(async (opts) => {
		const client = createPostHogClient({ url: opts.url, token: opts.token });
		const projectId = resolveProjectId({ projectId: opts.projectId });
		const params = new URLSearchParams();
		if (opts.limit) params.set("limit", opts.limit);
		if (opts.offset) params.set("offset", opts.offset);
		const qs = params.toString();
		const result = await client(`/api/projects/${projectId}/insights/${qs ? `?${qs}` : ""}`);
		formatOutput(result, opts.format as OutputFormat);
	});

	addExamples(list, [
		"posthog-cli-it insights list",
		"posthog-cli-it insights list --limit 20 --format table",
	]);

	const get = insights
		.command("get")
		.description("Get a specific insight")
		.argument("<insight-id>", "Insight ID");
	addCommonOptions(get).action(async (insightId, opts) => {
		const client = createPostHogClient({ url: opts.url, token: opts.token });
		const projectId = resolveProjectId({ projectId: opts.projectId });
		const result = await client(`/api/projects/${projectId}/insights/${insightId}/`);
		formatOutput(result, opts.format as OutputFormat);
	});

	addExamples(get, ["posthog-cli-it insights get 42"]);
}
