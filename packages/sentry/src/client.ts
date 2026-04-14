import { createApiClient, credential } from "@jcit/core";
import { consola } from "consola";

const SERVICE = "sentry";
const DEFAULT_BASE_URL = "https://sentry.io/api/0";

export interface SentryAuthOptions {
	url?: string;
	token?: string;
}

export function createSentryClient(opts: SentryAuthOptions = {}) {
	const baseURL =
		credential.resolve(SERVICE, "url", { flag: opts.url, envVar: "SENTRY_URL" }) ??
		DEFAULT_BASE_URL;
	const token =
		credential.resolve(SERVICE, "token", { flag: opts.token, envVar: "SENTRY_AUTH_TOKEN" }) ?? "";

	if (!token) {
		consola.warn("No auth token configured. Run 'sentry-cli-it auth login' or pass --token.");
	}

	return createApiClient({
		baseURL,
		headers: token ? { Authorization: `Bearer ${token}` } : {},
	});
}
