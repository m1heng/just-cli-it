import { inspect } from "node:util";
import { consola } from "consola";

export type OutputFormat = "json" | "table" | "text";

type TableRow = Record<string, unknown>;

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringifyNestedValue(value: unknown): unknown {
	if (value === null || value === undefined) return value;
	if (value instanceof Date) return value.toISOString();

	const valueType = typeof value;
	if (valueType === "string" || valueType === "number" || valueType === "boolean") {
		return value;
	}
	if (valueType === "bigint") return value.toString();

	try {
		return JSON.stringify(value) ?? inspect(value, { breakLength: Number.POSITIVE_INFINITY });
	} catch {
		return inspect(value, { breakLength: Number.POSITIVE_INFINITY });
	}
}

function normalizeTableRow(row: unknown): TableRow {
	if (!isRecord(row)) {
		return { value: stringifyNestedValue(row) };
	}

	return Object.fromEntries(
		Object.entries(row).map(([key, value]) => [key, stringifyNestedValue(value)]),
	);
}

function normalizeTableData(data: unknown): TableRow[] {
	return Array.isArray(data) ? data.map(normalizeTableRow) : [normalizeTableRow(data)];
}

/**
 * Format and print data to stdout based on the requested format.
 */
export function formatOutput(data: unknown, format: OutputFormat = "text"): void {
	switch (format) {
		case "json":
			console.log(JSON.stringify(data, null, 2));
			break;
		case "table":
			console.table(normalizeTableData(data));
			break;
		case "text":
			consola.log(stringifyNestedValue(data));
			break;
	}
}
