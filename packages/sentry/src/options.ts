import { Option } from "commander";
import type { Command } from "commander";

export function addCommonOptions(cmd: Command): Command {
	return cmd
		.addOption(
			new Option("--format <format>", "Output format: json | table | text").default("json"),
		)
		.addOption(new Option("--url <url>", "Sentry API base URL").hideHelp())
		.addOption(new Option("--token <token>", "Sentry auth token").hideHelp());
}
