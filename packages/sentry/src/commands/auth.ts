import { addExamples, credential } from "@jcit/core";
import type { Command } from "commander";
import { consola } from "consola";

const SERVICE = "sentry";

export function registerAuth(program: Command) {
	const auth = program.command("auth").description("Manage Sentry authentication");

	const login = auth
		.command("login")
		.description("Store Sentry credentials in system keychain")
		.option("--url <url>", "Sentry API base URL")
		.option("--token <token>", "Sentry auth token")
		.action(async (opts) => {
			const url =
				opts.url ??
				(await consola.prompt("Sentry API base URL (default: https://sentry.io/api/0):", {
					type: "text",
				}));
			const token =
				opts.token ??
				(await consola.prompt("Sentry auth token:", { type: "text", style: "password" }));

			if (url) credential.store(SERVICE, "url", url);
			credential.store(SERVICE, "token", token);
			consola.success("Credentials stored in system keychain.");
		});

	addExamples(login, [
		"sentry-cli-it auth login",
		"sentry-cli-it auth login --url https://sentry.io/api/0 --token sntrys_xxx",
	]);

	auth
		.command("logout")
		.description("Remove stored Sentry credentials")
		.action(() => {
			credential.delete(SERVICE, "url");
			credential.delete(SERVICE, "token");
			consola.success("Credentials removed.");
		});
}
