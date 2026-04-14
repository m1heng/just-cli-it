import { type OutputFormat, addExamples, formatOutput } from "@jcit/core";
import type { Command } from "commander";
import { createSentryClient } from "../client";
import { addCommonOptions } from "../options";

export function registerOrgs(program: Command) {
	const orgs = program.command("orgs").description("Manage Sentry organizations");

	const get = orgs
		.command("get")
		.description("Get organization details")
		.argument("<org-slug>", "Organization slug");
	addCommonOptions(get).action(async (orgSlug, opts) => {
		const client = createSentryClient({ url: opts.url, token: opts.token });
		const result = await client(`/organizations/${orgSlug}/`);
		formatOutput(result, opts.format as OutputFormat);
	});

	addExamples(get, ["sentry-cli-it orgs get my-org"]);

	const members = orgs
		.command("members")
		.description("List organization members")
		.argument("<org-slug>", "Organization slug")
		.option("--cursor <cursor>", "Pagination cursor");
	addCommonOptions(members).action(async (orgSlug, opts) => {
		const client = createSentryClient({ url: opts.url, token: opts.token });
		const params = new URLSearchParams();
		if (opts.cursor) params.set("cursor", opts.cursor);
		const qs = params.toString();
		const result = await client(`/organizations/${orgSlug}/members/${qs ? `?${qs}` : ""}`);
		formatOutput(result, opts.format as OutputFormat);
	});

	addExamples(members, ["sentry-cli-it orgs members my-org"]);

	const teams = orgs
		.command("teams")
		.description("List organization teams")
		.argument("<org-slug>", "Organization slug")
		.option("--cursor <cursor>", "Pagination cursor");
	addCommonOptions(teams).action(async (orgSlug, opts) => {
		const client = createSentryClient({ url: opts.url, token: opts.token });
		const params = new URLSearchParams();
		if (opts.cursor) params.set("cursor", opts.cursor);
		const qs = params.toString();
		const result = await client(`/organizations/${orgSlug}/teams/${qs ? `?${qs}` : ""}`);
		formatOutput(result, opts.format as OutputFormat);
	});

	addExamples(teams, ["sentry-cli-it orgs teams my-org"]);
}
