import { createApiClient, credential } from "@jcit/core";
import { consola } from "consola";

const SERVICE = "posthog";
const DEFAULT_BASE_URL = "https://us.posthog.com";

export interface PostHogAuthOptions {
	url?: string;
	token?: string;
	projectId?: string;
}

export function resolveProjectId(opts: { projectId?: string }): string {
	const id = credential.resolve(SERVICE, "project-id", {
		flag: opts.projectId,
		envVar: "POSTHOG_PROJECT_ID",
	});
	if (!id) {
		throw new Error(
			"Project ID is required. Pass --project-id, set POSTHOG_PROJECT_ID, or run 'posthog-cli-it auth login'.",
		);
	}
	return id;
}

export function createPostHogClient(opts: PostHogAuthOptions = {}) {
	const baseURL =
		credential.resolve(SERVICE, "url", { flag: opts.url, envVar: "POSTHOG_URL" }) ??
		DEFAULT_BASE_URL;
	const token =
		credential.resolve(SERVICE, "token", { flag: opts.token, envVar: "POSTHOG_API_KEY" }) ?? "";

	if (!token) {
		consola.warn("No API key configured. Run 'posthog-cli-it auth login' or pass --token.");
	}

	return createApiClient({
		baseURL,
		headers: token ? { Authorization: `Bearer ${token}` } : {},
	});
}
