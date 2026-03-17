import { Command } from "commander";

export interface CliAppOptions {
	name: string;
	version: string;
	description: string;
	docsUrl?: string;
}

/**
 * Create a pre-configured Commander program for consistent CLI structure.
 * Adds global --url and --token options, standardized error output, and docs link.
 */
export function defineCliApp(options: CliAppOptions): Command {
	const program = new Command(options.name)
		.version(options.version)
		.description(options.description)
		.configureHelp({ sortSubcommands: true });

	if (options.docsUrl) {
		program.addHelpText("after", `\nDocumentation: ${options.docsUrl}`);
	}

	return program;
}

/**
 * Add usage examples to a command's help output.
 */
export function addExamples(cmd: Command, examples: string[]): Command {
	const text = examples.map((e) => `  $ ${e}`).join("\n");
	cmd.addHelpText("after", `\nExamples:\n${text}`);
	return cmd;
}
