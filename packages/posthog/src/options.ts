import { Option } from "commander";
import type { Command } from "commander";

export function addCommonOptions(cmd: Command): Command {
	return cmd
		.addOption(
			new Option("--format <format>", "Output format: json | table | text").default("json"),
		)
		.addOption(new Option("--url <url>", "PostHog API base URL").hideHelp())
		.addOption(new Option("--token <token>", "PostHog personal API key").hideHelp())
		.addOption(new Option("--project-id <id>", "PostHog project ID").hideHelp());
}

/**
 * Shared safety options for every mutating command. Always composed as
 * addCommonOptions(addMutationOptions(cmd)) so help blocks never drift.
 */
export function addMutationOptions(cmd: Command): Command {
	return cmd
		.addOption(new Option("--dry-run", "Print the request without sending it").default(false))
		.addOption(
			new Option("--yes", "Skip confirmation (also via CI or POSTHOG_YES env)").default(false),
		);
}

/** Commander reducer for repeatable options. */
export function collectValues(value: string, previous: string[]): string[] {
	return [...previous, value];
}
