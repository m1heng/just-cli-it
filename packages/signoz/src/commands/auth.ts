import { addExamples, credential } from "@jcit/core";
import type { Command } from "commander";
import { consola } from "consola";

const SERVICE = "signoz";

export function registerAuth(program: Command) {
	const auth = program.command("auth").description("Manage SigNoz authentication");

	const login = auth
		.command("login")
		.description("Store SigNoz credentials in system keychain")
		.option("--url <url>", "SigNoz API base URL")
		.option("--token <token>", "SigNoz API token")
		.action(async (opts) => {
			const url = opts.url ?? (await consola.prompt("SigNoz API base URL:", { type: "text" }));
			const token =
				opts.token ??
				(await consola.prompt("SigNoz API token:", { type: "text", style: "password" }));

			credential.store(SERVICE, "url", url);
			credential.store(SERVICE, "token", token);
			consola.success("Credentials stored in system keychain.");
		});

	addExamples(login, [
		"signoz auth login",
		"signoz auth login --url https://signoz.example.com --token my-api-key",
	]);

	auth
		.command("logout")
		.description("Remove stored SigNoz credentials")
		.action(() => {
			credential.delete(SERVICE, "url");
			credential.delete(SERVICE, "token");
			consola.success("Credentials removed.");
		});
}
