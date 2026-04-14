import { readFileSync } from "node:fs";
import { type OutputFormat, addExamples, formatOutput } from "@jcit/core";
import type { Command } from "commander";
import { createPostHogClient, resolveProjectId } from "../client";
import { addCommonOptions } from "../options";

export function registerQuery(program: Command) {
	const cmd = program
		.command("query")
		.description("Execute a HogQL query against PostHog")
		.option("--sql <query>", "HogQL query string")
		.option("-f, --file <path>", "Read HogQL query from file (instead of --sql)");
	addCommonOptions(cmd).action(async (opts) => {
		if (!opts.sql && !opts.file) {
			cmd.error("Provide either --sql or --file.");
		}
		const client = createPostHogClient({ url: opts.url, token: opts.token });
		const projectId = resolveProjectId({ projectId: opts.projectId });
		const sql = opts.file ? readFileSync(opts.file, "utf-8").trim() : opts.sql;
		const result = await client(`/api/projects/${projectId}/query/`, {
			method: "POST",
			body: {
				query: {
					kind: "HogQLQuery",
					query: sql,
				},
			},
		});
		formatOutput(result, opts.format as OutputFormat);
	});

	addExamples(cmd, [
		"posthog-cli-it query --sql 'SELECT event, count() FROM events GROUP BY event ORDER BY count() DESC LIMIT 10'",
		"posthog-cli-it query --file query.sql",
		"posthog-cli-it query --sql 'SELECT distinct_id, count() FROM events WHERE timestamp > now() - INTERVAL 7 DAY GROUP BY distinct_id LIMIT 20'",
	]);
}
