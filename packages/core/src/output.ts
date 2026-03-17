import { consola } from "consola";

export type OutputFormat = "json" | "table" | "text";

/**
 * Format and print data to stdout based on the requested format.
 */
export function formatOutput(data: unknown, format: OutputFormat = "text"): void {
	switch (format) {
		case "json":
			console.log(JSON.stringify(data, null, 2));
			break;
		case "table":
			if (Array.isArray(data)) {
				console.table(data);
			} else {
				console.table([data]);
			}
			break;
		case "text":
			consola.log(data);
			break;
	}
}
