import { createApiClient, credential } from "@jcit/core";
import { consola } from "consola";

const SERVICE = "signoz";
const DEFAULT_BASE_URL = "http://localhost:3301";

export interface SignozAuthOptions {
	url?: string;
	token?: string;
}

export function createSignozClient(opts: SignozAuthOptions = {}) {
	const baseURL =
		credential.resolve(SERVICE, "url", { flag: opts.url, envVar: "SIGNOZ_URL" }) ??
		DEFAULT_BASE_URL;
	const token =
		credential.resolve(SERVICE, "token", { flag: opts.token, envVar: "SIGNOZ_TOKEN" }) ?? "";

	if (!token) {
		consola.warn("No API token configured. Run 'signoz auth login' or pass --token.");
	}

	return createApiClient({
		baseURL,
		headers: token ? { "SIGNOZ-API-KEY": token } : {},
	});
}
