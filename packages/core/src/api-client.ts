import { ofetch } from "ofetch";

export interface ApiClientOptions {
	baseURL: string;
	headers?: Record<string, string>;
	token?: string;
}

/**
 * Create a pre-configured API client for a specific service.
 * Wraps ofetch with base URL, auth, and error handling.
 */
export function createApiClient(options: ApiClientOptions) {
	const headers: Record<string, string> = { ...options.headers };
	if (options.token) {
		headers.Authorization = `Bearer ${options.token}`;
	}

	return <T>(path: string, fetchOptions?: Parameters<typeof ofetch>[1]) => {
		const mergedHeaders = { ...headers, ...(fetchOptions?.headers as Record<string, string>) };
		return ofetch<T>(path, {
			baseURL: options.baseURL,
			...fetchOptions,
			headers: mergedHeaders,
		});
	};
}
