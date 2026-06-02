import { describe, expect, it } from "vitest";
import type { FlagFilters } from "./filters";
import { validateFilters, validateTopLevel } from "./validation";

describe("validateFilters", () => {
	it("accepts a well-formed person flag", () => {
		const f: FlagFilters = {
			groups: [
				{
					properties: [{ key: "plan", operator: "exact", type: "person", value: ["pro"] }],
					rollout_percentage: 100,
				},
			],
		};
		expect(() => validateFilters(f)).not.toThrow();
	});

	it("rejects null holes in the groups array", () => {
		const f = { groups: [null] } as unknown as FlagFilters;
		expect(() => validateFilters(f)).toThrow(/no null holes/);
	});

	it("enforces person/group aggregation mutual exclusion", () => {
		const personOnGroupFlag: FlagFilters = {
			groups: [
				{
					properties: [{ key: "x", operator: "exact", type: "person", value: ["y"] }],
					rollout_percentage: 100,
				},
			],
			aggregation_group_type_index: 0,
		};
		expect(() => validateFilters(personOnGroupFlag)).toThrow(/only use group properties/);

		const groupOnPersonFlag: FlagFilters = {
			groups: [
				{
					properties: [
						{ key: "x", operator: "exact", type: "group", value: ["y"], group_type_index: 0 },
					],
					rollout_percentage: 100,
				},
			],
		};
		expect(() => validateFilters(groupOnPersonFlag)).toThrow(/not group-aggregated/);
	});

	it("requires group_type_index to match the aggregation index", () => {
		const f: FlagFilters = {
			groups: [
				{
					properties: [
						{ key: "name", operator: "exact", type: "group", value: ["acme"], group_type_index: 1 },
					],
					rollout_percentage: 100,
				},
			],
			aggregation_group_type_index: 0,
		};
		expect(() => validateFilters(f)).toThrow(/must match aggregation index/);
	});

	it("requires variant percentages to sum to 100", () => {
		const f: FlagFilters = {
			groups: [],
			multivariate: {
				variants: [
					{ key: "a", rollout_percentage: 60 },
					{ key: "b", rollout_percentage: 60 },
				],
			},
		};
		expect(() => validateFilters(f)).toThrow(/sum to 100/);
	});

	it("rejects a payload key that is not a variant", () => {
		const f: FlagFilters = {
			groups: [],
			multivariate: { variants: [{ key: "a", rollout_percentage: 100 }] },
			payloads: { b: 1 },
		};
		expect(() => validateFilters(f)).toThrow(/not a defined variant/);
	});

	it("rejects a non-true payload key on a boolean flag", () => {
		expect(() => validateFilters({ groups: [], payloads: { something: 1 } })).toThrow(/use "true"/);
	});

	it("tolerates a legacy property with an omitted operator", () => {
		const f = {
			groups: [{ properties: [{ key: "plan", value: ["pro"] }], rollout_percentage: 100 }],
		} as unknown as FlagFilters;
		expect(() => validateFilters(f)).not.toThrow();
	});

	it("rejects operators that require a value when missing", () => {
		const f: FlagFilters = {
			groups: [
				{ properties: [{ key: "x", operator: "exact", type: "person" }], rollout_percentage: 100 },
			],
		};
		expect(() => validateFilters(f)).toThrow(/requires a value/);
	});
});

describe("validateTopLevel", () => {
	it("rejects an invalid evaluation_runtime", () => {
		expect(() => validateTopLevel({ evaluation_runtime: "both" })).toThrow(/evaluation_runtime/);
	});

	it("requires is_remote_configuration for encrypted payloads", () => {
		expect(() => validateTopLevel({ has_encrypted_payloads: true })).toThrow(
			/is_remote_configuration/,
		);
	});

	it("accepts valid top-level fields", () => {
		expect(() => validateTopLevel({ evaluation_runtime: "all", name: "x" })).not.toThrow();
	});
});
