import { Option } from "commander";
import type { Command } from "commander";

/**
 * Add --format, --url, --token to a command.
 * Single source of truth for options shared across all subcommands.
 */
export function addCommonOptions(cmd: Command): Command {
	return cmd
		.addOption(
			new Option("--format <format>", "Output format: json | table | text").default("json"),
		)
		.addOption(new Option("--url <url>", "SigNoz API base URL").hideHelp())
		.addOption(new Option("--token <token>", "SigNoz API token").hideHelp());
}
