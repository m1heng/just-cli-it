import { describe, expect, it } from "vitest";
import { createApiClient } from "./api-client";

describe("createApiClient", () => {
	it("should return a function", () => {
		const client = createApiClient({ baseURL: "http://localhost:3000" });
		expect(typeof client).toBe("function");
	});
});
