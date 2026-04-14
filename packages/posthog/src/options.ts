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
