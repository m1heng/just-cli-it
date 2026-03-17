import { type OutputFormat, addExamples, formatOutput } from "@jcit/core";
import type { Command } from "commander";
import { createSignozClient } from "../client";

export function registerServices(program: Command) {
	const cmd = program
		.command("services")
		.description("List all SigNoz services")
		.option("--format <format>", "Output format: json | table | text", "text")
		.option("--url <url>", "SigNoz API base URL")
		.option("--token <token>", "SigNoz API token")
		.action(async (opts) => {
			const client = createSignozClient({ url: opts.url, token: opts.token });
			const services = await client("/api/v1/services/list");
			formatOutput(services, opts.format as OutputFormat);
		});

	addExamples(cmd, ["signoz services", "signoz services --format json"]);
}
