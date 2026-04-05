import { type OutputFormat, addExamples, formatOutput } from "@jcit/core";
import type { Command } from "commander";
import { createSignozClient } from "../client";
import { addCommonOptions } from "../options";

export function registerAlerts(program: Command) {
	const cmd = program.command("alerts").description("List all alert rules");
	addCommonOptions(cmd).action(async (opts) => {
		const client = createSignozClient({ url: opts.url, token: opts.token });
		const alerts = await client("/api/v1/rules");
		formatOutput(alerts, opts.format as OutputFormat);
	});

	addExamples(cmd, ["signoz alerts", "signoz alerts --format json"]);
}
