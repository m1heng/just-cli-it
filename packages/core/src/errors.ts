import { consola } from "consola";

/**
 * Walk the cause chain to find an error code (e.g. ECONNREFUSED).
 */
function findErrorCode(err: unknown, depth = 5): string | undefined {
	if (depth <= 0 || !(err instanceof Error)) return undefined;
	if ("code" in err && typeof (err as NodeJS.ErrnoException).code === "string") {
		return (err as NodeJS.ErrnoException).code;
	}
	return findErrorCode((err as Error & { cause?: unknown }).cause, depth - 1);
}

/**
 * Extract a human-readable message from any error.
 */
function formatError(err: unknown): string {
	if (!(err instanceof Error)) return String(err);

	const name = err.constructor.name;

	// Network errors (ofetch / fetch) — cause chain: FetchError → TypeError → AggregateError
	if (name === "FetchError" || err.message.includes("fetch failed")) {
		const code = findErrorCode(err);
		const url = err.message.match(/\[.*?\]\s*"([^"]+)"/)?.[1];
		if (code === "ECONNREFUSED") {
			return `Connection refused${url ? `: ${url}` : ""}\nIs the server running? Check --url or run 'auth login'.`;
		}
		if (code === "ENOTFOUND") {
			return `Host not found${url ? `: ${url}` : ""}. Check --url or run 'auth login'.`;
		}
		if (code === "ETIMEDOUT") {
			return `Connection timed out${url ? `: ${url}` : ""}. Check --url or run 'auth login'.`;
		}
		return `Network error: ${err.message}`;
	}

	// File system errors
	if ("code" in err) {
		const code = (err as NodeJS.ErrnoException).code;
		const path = (err as NodeJS.ErrnoException).path;
		if (code === "ENOENT" && path) return `File not found: ${path}`;
		if (code === "EACCES" && path) return `Permission denied: ${path}`;
	}

	// JSON parse errors
	if (name === "SyntaxError" && err.message.includes("JSON")) {
		return `Invalid JSON: ${err.message}`;
	}

	return err.message;
}

/**
 * Install a global unhandled error handler for CLI apps.
 * Converts raw stack traces into clean, user-friendly messages.
 */
export function installErrorHandler(): void {
	process.on("uncaughtException", (err) => {
		consola.error(formatError(err));
		process.exit(1);
	});

	process.on("unhandledRejection", (reason) => {
		consola.error(formatError(reason));
		process.exit(1);
	});
}
