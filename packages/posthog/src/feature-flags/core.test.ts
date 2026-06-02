import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type FlagCtx, applyFlagMutation, createFlag, resolveFlagRef } from "./core";
import { type FeatureFlag, setRollout } from "./filters";

interface Call {
	path: string;
	method: string;
	body?: unknown;
}

/** A stub PostHog client: GET (single + list) returns canned data; PATCH/DELETE record the call. */
function stubCtx(
	flag: FeatureFlag,
	pages?: Array<{ results: FeatureFlag[]; next: string | null }>,
) {
	const calls: Call[] = [];
	let pageIdx = 0;
	const client = (async (path: string, options?: { method?: string; body?: unknown }) => {
		const method = options?.method ?? "GET";
		calls.push({ path, method, body: options?.body });
		if (method !== "GET") return flag;
		if (path.endsWith("/dependent_flags/")) return [];
		if (path.includes("?")) {
			const page = pages?.[pageIdx] ?? { results: [flag], next: null };
			pageIdx++;
			return page;
		}
		return flag;
	}) as unknown as FlagCtx["client"];
	const ctx: FlagCtx = { client, projectId: "1", format: "json" };
	return { ctx, calls };
}

function patchOf(calls: Call[]): Call | undefined {
	return calls.find((c) => c.method === "PATCH");
}

const TWO_GROUP_FLAG: FeatureFlag = {
	id: 7,
	key: "clips",
	active: true,
	filters: {
		groups: [
			{
				properties: [{ key: "plan", operator: "exact", type: "person", value: ["pro"] }],
				rollout_percentage: 10,
			},
			{ properties: [], rollout_percentage: 0 },
		],
		aggregation_group_type_index: null,
	},
};

describe("applyFlagMutation", () => {
	beforeEach(() => {
		vi.spyOn(console, "log").mockImplementation(() => {});
		vi.spyOn(process.stderr, "write").mockImplementation(() => true);
	});
	afterEach(() => vi.restoreAllMocks());

	it("read-modify-write preserves sibling conditions and aggregation", async () => {
		const { ctx, calls } = stubCtx(structuredClone(TWO_GROUP_FLAG));
		await applyFlagMutation(ctx, 7, {
			mutateFilters: (f) => setRollout(f, 50, "all"),
			summary: "x",
			yes: true,
		});
		const patch = patchOf(calls);
		const filters = (patch?.body as { filters: FeatureFlag["filters"] }).filters;
		expect(filters.groups).toHaveLength(2);
		expect(filters.groups[0].properties[0].key).toBe("plan");
		expect(filters.groups[1].rollout_percentage).toBe(50);
		expect("aggregation_group_type_index" in filters).toBe(true);
		expect((patch?.body as Record<string, unknown>).active).toBeUndefined();
	});

	it("topLevel-only mutations never include a filters key", async () => {
		const { ctx, calls } = stubCtx(structuredClone(TWO_GROUP_FLAG));
		await applyFlagMutation(ctx, 7, { topLevel: { active: false }, summary: "x", yes: true });
		const patch = patchOf(calls);
		expect(patch?.body).toEqual({ active: false });
		expect("filters" in (patch?.body as object)).toBe(false);
	});

	it("rollout --enable sends BOTH active and the complete filters", async () => {
		const { ctx, calls } = stubCtx(structuredClone(TWO_GROUP_FLAG));
		await applyFlagMutation(ctx, 7, {
			mutateFilters: (f) => setRollout(f, 100, "all"),
			topLevel: { active: true },
			summary: "x",
			yes: true,
		});
		const body = patchOf(calls)?.body as { active: boolean; filters: FeatureFlag["filters"] };
		expect(body.active).toBe(true);
		expect(body.filters.groups).toHaveLength(2);
	});

	it("is fail-closed: non-TTY without --yes throws and issues no PATCH", async () => {
		const savedTty = process.stdin.isTTY;
		// Empty string is falsy, so autoYes stays false without using the `delete` operator.
		vi.stubEnv("CI", "");
		vi.stubEnv("POSTHOG_YES", "");
		(process.stdin as { isTTY: boolean }).isTTY = false;
		try {
			const { ctx, calls } = stubCtx(structuredClone(TWO_GROUP_FLAG));
			await expect(
				applyFlagMutation(ctx, 7, { topLevel: { active: true }, summary: "x" }),
			).rejects.toThrow(/TTY/);
			expect(calls.some((c) => c.method === "PATCH")).toBe(false);
		} finally {
			vi.unstubAllEnvs();
			(process.stdin as { isTTY?: boolean }).isTTY = savedTty;
		}
	});

	it("--dry-run prints the diff to stderr and the body to stdout, and issues no PATCH", async () => {
		const errs: string[] = [];
		const logs: string[] = [];
		vi.spyOn(process.stderr, "write").mockImplementation((s) => {
			errs.push(String(s));
			return true;
		});
		vi.spyOn(console, "log").mockImplementation((s) => {
			logs.push(String(s));
		});
		const { ctx, calls } = stubCtx(structuredClone(TWO_GROUP_FLAG));
		await applyFlagMutation(ctx, 7, {
			mutateFilters: (f) => setRollout(f, 50, "all"),
			summary: "set rollout",
			dryRun: true,
		});
		expect(calls.some((c) => c.method === "PATCH")).toBe(false);
		expect(errs.join("")).toContain("current filters");
		expect(logs.join("")).toContain("PATCH");
	});
});

describe("createFlag", () => {
	beforeEach(() => {
		vi.spyOn(console, "log").mockImplementation(() => {});
		vi.spyOn(process.stderr, "write").mockImplementation(() => true);
	});
	afterEach(() => vi.restoreAllMocks());

	it("is fail-closed: non-TTY without --yes throws and issues no POST", async () => {
		const savedTty = process.stdin.isTTY;
		vi.stubEnv("CI", "");
		vi.stubEnv("POSTHOG_YES", "");
		(process.stdin as { isTTY: boolean }).isTTY = false;
		try {
			const { ctx, calls } = stubCtx(structuredClone(TWO_GROUP_FLAG));
			await expect(createFlag(ctx, { key: "x", active: false }, {})).rejects.toThrow(/TTY/);
			expect(calls.some((c) => c.method === "POST")).toBe(false);
		} finally {
			vi.unstubAllEnvs();
			(process.stdin as { isTTY?: boolean }).isTTY = savedTty;
		}
	});

	it("--dry-run prints the POST body and issues no POST", async () => {
		const { ctx, calls } = stubCtx(structuredClone(TWO_GROUP_FLAG));
		await createFlag(ctx, { key: "x", active: false }, { dryRun: true });
		expect(calls.some((c) => c.method === "POST")).toBe(false);
	});
});

describe("resolveFlagRef", () => {
	it("returns an explicit --id without a lookup", async () => {
		const { ctx, calls } = stubCtx(TWO_GROUP_FLAG);
		expect(await resolveFlagRef(ctx, { id: "42" })).toBe(42);
		expect(calls).toHaveLength(0);
	});

	it("exact-matches a key on a later page", async () => {
		const other: FeatureFlag = { id: 1, key: "other", active: true, filters: { groups: [] } };
		const { ctx } = stubCtx(TWO_GROUP_FLAG, [
			{ results: [other], next: "http://next" },
			{ results: [TWO_GROUP_FLAG], next: null },
		]);
		expect(await resolveFlagRef(ctx, { key: "clips" })).toBe(7);
	});

	it("throws on a missing key", async () => {
		const { ctx } = stubCtx(TWO_GROUP_FLAG, [{ results: [], next: null }]);
		await expect(resolveFlagRef(ctx, { key: "nope" })).rejects.toThrow(/No flag with key/);
	});

	it("throws on duplicate keys", async () => {
		const { ctx } = stubCtx(TWO_GROUP_FLAG, [
			{ results: [TWO_GROUP_FLAG, TWO_GROUP_FLAG], next: null },
		]);
		await expect(resolveFlagRef(ctx, { key: "clips" })).rejects.toThrow(/multiple flags/);
	});
});
