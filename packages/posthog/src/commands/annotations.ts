import { type OutputFormat, addExamples, formatOutput } from "@jcit/core";
import type { Command } from "commander";
import { createPostHogClient, resolveProjectId } from "../client";
import { addCommonOptions } from "../options";

export function registerAnnotations(program: Command) {
	const annotations = program.command("annotations").description("Manage PostHog annotations");

	const list = annotations
		.command("list")
		.description("List annotations")
		.option("--search <term>", "Search annotations by content")
		.option("--limit <n>", "Max results", "100")
		.option("--offset <n>", "Pagination offset");
	addCommonOptions(list).action(async (opts) => {
		const client = createPostHogClient({ url: opts.url, token: opts.token });
		const projectId = resolveProjectId({ projectId: opts.projectId });
		const params = new URLSearchParams();
		if (opts.search) params.set("search", opts.search);
		if (opts.limit) params.set("limit", opts.limit);
		if (opts.offset) params.set("offset", opts.offset);
		const qs = params.toString();
		const result = await client(`/api/projects/${projectId}/annotations/${qs ? `?${qs}` : ""}`);
		formatOutput(result, opts.format as OutputFormat);
	});

	addExamples(list, [
		"posthog-cli-it annotations list",
		"posthog-cli-it annotations list --search deploy",
	]);

	const create = annotations
		.command("create")
		.description("Create an annotation")
		.requiredOption("--content <text>", "Annotation content")
		.option("--date <iso>", "Date marker (ISO 8601, defaults to now)")
		.option("--scope <scope>", "Scope: project | organization", "project");
	addCommonOptions(create).action(async (opts) => {
		const client = createPostHogClient({ url: opts.url, token: opts.token });
		const projectId = resolveProjectId({ projectId: opts.projectId });
		const body: Record<string, unknown> = {
			content: opts.content,
			scope: opts.scope,
		};
		if (opts.date) body.date_marker = opts.date;
		const result = await client(`/api/projects/${projectId}/annotations/`, {
			method: "POST",
			body,
		});
		formatOutput(result, opts.format as OutputFormat);
	});

	addExamples(create, [
		"posthog-cli-it annotations create --content 'v2.0 deployed'",
		"posthog-cli-it annotations create --content 'Hotfix applied' --date 2025-03-15T10:00:00Z",
	]);
}
