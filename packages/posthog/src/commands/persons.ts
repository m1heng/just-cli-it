import { type OutputFormat, addExamples, formatOutput } from "@jcit/core";
import type { Command } from "commander";
import { createPostHogClient, resolveProjectId } from "../client";
import { addCommonOptions } from "../options";

export function registerPersons(program: Command) {
	const persons = program.command("persons").description("Manage PostHog persons");

	const list = persons
		.command("list")
		.description("List persons")
		.option("--search <term>", "Search by email or distinct ID")
		.option("--distinct-id <id>", "Filter by distinct ID")
		.option("--email <email>", "Filter by email")
		.option("--limit <n>", "Max results", "100")
		.option("--offset <n>", "Pagination offset");
	addCommonOptions(list).action(async (opts) => {
		const client = createPostHogClient({ url: opts.url, token: opts.token });
		const projectId = resolveProjectId({ projectId: opts.projectId });
		const params = new URLSearchParams();
		if (opts.search) params.set("search", opts.search);
		if (opts.distinctId) params.set("distinct_id", opts.distinctId);
		if (opts.email) params.set("email", opts.email);
		if (opts.limit) params.set("limit", opts.limit);
		if (opts.offset) params.set("offset", opts.offset);
		const qs = params.toString();
		const result = await client(`/api/projects/${projectId}/persons/${qs ? `?${qs}` : ""}`);
		formatOutput(result, opts.format as OutputFormat);
	});

	addExamples(list, [
		"posthog-cli-it persons list",
		"posthog-cli-it persons list --search jane@example.com",
		"posthog-cli-it persons list --distinct-id user123",
	]);

	const get = persons
		.command("get")
		.description("Get a specific person")
		.argument("<person-id>", "Person ID (UUID)");
	addCommonOptions(get).action(async (personId, opts) => {
		const client = createPostHogClient({ url: opts.url, token: opts.token });
		const projectId = resolveProjectId({ projectId: opts.projectId });
		const result = await client(`/api/projects/${projectId}/persons/${personId}/`);
		formatOutput(result, opts.format as OutputFormat);
	});

	addExamples(get, ["posthog-cli-it persons get 01234567-89ab-cdef-0123-456789abcdef"]);
}
