import { addExamples, credential } from "@jcit/core";
import type { Command } from "commander";
import { consola } from "consola";

const SERVICE = "posthog";

export function registerAuth(program: Command) {
	const auth = program.command("auth").description("Manage PostHog authentication");

	const login = auth
		.command("login")
		.description("Store PostHog credentials in system keychain")
		.option("--url <url>", "PostHog API base URL")
		.option("--token <token>", "PostHog personal API key")
		.option("--project-id <id>", "Default project ID")
		.action(async (opts) => {
			const url =
				opts.url ??
				(await consola.prompt("PostHog API base URL (default: https://us.posthog.com):", {
					type: "text",
				}));
			const token =
				opts.token ??
				(await consola.prompt("PostHog personal API key:", {
					type: "text",
					style: "password",
				}));
			const projectId =
				opts.projectId ?? (await consola.prompt("Default project ID:", { type: "text" }));

			if (url) credential.store(SERVICE, "url", url);
			credential.store(SERVICE, "token", token);
			if (projectId) credential.store(SERVICE, "project-id", projectId);
			consola.success("Credentials stored in system keychain.");
		});

	addExamples(login, [
		"posthog-cli-it auth login",
		"posthog-cli-it auth login --url https://us.posthog.com --token phx_xxx --project-id 12345",
	]);

	auth
		.command("logout")
		.description("Remove stored PostHog credentials")
		.action(() => {
			credential.delete(SERVICE, "url");
			credential.delete(SERVICE, "token");
			credential.delete(SERVICE, "project-id");
			consola.success("Credentials removed.");
		});
}
