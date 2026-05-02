import { afterEach, describe, expect, it, vi } from "vitest";
import { formatOutput } from "./output";

describe("formatOutput", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("stringifies nested table values instead of letting console.table collapse them", () => {
		const table = vi.spyOn(console, "table").mockImplementation(() => undefined);

		formatOutput(
			[
				{
					body: { message: "hello" },
					count: 2,
					tags: ["api", "error"],
				},
			],
			"table",
		);

		expect(table).toHaveBeenCalledWith([
			{
				body: '{"message":"hello"}',
				count: 2,
				tags: '["api","error"]',
			},
		]);
	});

	it("uses inspect for circular table values", () => {
		const table = vi.spyOn(console, "table").mockImplementation(() => undefined);
		const body: Record<string, unknown> = {};
		body.self = body;

		formatOutput([{ body }], "table");

		expect(table).toHaveBeenCalledWith([
			{
				body: expect.stringContaining("[Circular"),
			},
		]);
	});
});
