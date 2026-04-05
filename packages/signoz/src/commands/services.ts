import { type OutputFormat, addExamples, formatOutput } from "@jcit/core";
import type { Command } from "commander";
import { createSignozClient } from "../client";
import { addCommonOptions } from "../options";

export function registerServices(program: Command) {
	const cmd = program.command("services").description("List all SigNoz services");
	addCommonOptions(cmd).action(async (opts) => {
		const client = createSignozClient({ url: opts.url, token: opts.token });
		const services = await client("/api/v1/services/list");
		formatOutput(services, opts.format as OutputFormat);
	});

	addExamples(cmd, ["signoz services", "signoz services --format json"]);
}
