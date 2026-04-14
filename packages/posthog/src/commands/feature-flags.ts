import { type OutputFormat, addExamples, formatOutput } from "@jcit/core";
import type { Command } from "commander";
import { createPostHogClient, resolveProjectId } from "../client";
import { addCommonOptions } from "../options";

export function registerFeatureFlags(program: Command) {
	const flags = program.command("feature-flags").description("Manage PostHog feature flags");

	const list = flags
		.command("list")
		.description("List feature flags")
		.option("--search <term>", "Search by flag key or name")
		.option("--active <value>", "Filter: true | false | STALE")
		.option("--limit <n>", "Max results", "100")
		.option("--offset <n>", "Pagination offset");
	addCommonOptions(list).action(async (opts) => {
		const client = createPostHogClient({ url: opts.url, token: opts.token });
		const projectId = resolveProjectId({ projectId: opts.projectId });
		const params = new URLSearchParams();
		if (opts.search) params.set("search", opts.search);
		if (opts.active) params.set("active", opts.active);
		if (opts.limit) params.set("limit", opts.limit);
		if (opts.offset) params.set("offset", opts.offset);
		const qs = params.toString();
		const result = await client(`/api/projects/${projectId}/feature_flags/${qs ? `?${qs}` : ""}`);
		formatOutput(result, opts.format as OutputFormat);
	});

	addExamples(list, [
		"posthog-cli-it feature-flags list",
		"posthog-cli-it feature-flags list --active true --search beta",
	]);

	const get = flags
		.command("get")
		.description("Get a specific feature flag")
		.argument("<flag-id>", "Feature flag ID");
	addCommonOptions(get).action(async (flagId, opts) => {
		const client = createPostHogClient({ url: opts.url, token: opts.token });
		const projectId = resolveProjectId({ projectId: opts.projectId });
		const result = await client(`/api/projects/${projectId}/feature_flags/${flagId}/`);
		formatOutput(result, opts.format as OutputFormat);
	});

	addExamples(get, ["posthog-cli-it feature-flags get 42"]);

	const toggle = flags
		.command("toggle")
		.description("Enable or disable a feature flag")
		.argument("<flag-id>", "Feature flag ID")
		.requiredOption("--active <bool>", "Set active state: true | false");
	addCommonOptions(toggle).action(async (flagId, opts) => {
		const client = createPostHogClient({ url: opts.url, token: opts.token });
		const projectId = resolveProjectId({ projectId: opts.projectId });
		const result = await client(`/api/projects/${projectId}/feature_flags/${flagId}/`, {
			method: "PATCH",
			body: { active: opts.active === "true" },
		});
		formatOutput(result, opts.format as OutputFormat);
	});

	addExamples(toggle, [
		"posthog-cli-it feature-flags toggle 42 --active true",
		"posthog-cli-it feature-flags toggle 42 --active false",
	]);

	const create = flags
		.command("create")
		.description("Create a new feature flag")
		.requiredOption("--key <key>", "Flag key (unique identifier)")
		.option("--name <name>", "Human-readable name")
		.option("--active", "Set flag as active immediately");
	addCommonOptions(create).action(async (opts) => {
		const client = createPostHogClient({ url: opts.url, token: opts.token });
		const projectId = resolveProjectId({ projectId: opts.projectId });
		const body: Record<string, unknown> = {
			key: opts.key,
			filters: { groups: [{ rollout_percentage: 0 }] },
		};
		if (opts.name) body.name = opts.name;
		if (opts.active) body.active = true;
		const result = await client(`/api/projects/${projectId}/feature_flags/`, {
			method: "POST",
			body,
		});
		formatOutput(result, opts.format as OutputFormat);
	});

	addExamples(create, [
		"posthog-cli-it feature-flags create --key new-dashboard --name 'New Dashboard' --active",
	]);
}
