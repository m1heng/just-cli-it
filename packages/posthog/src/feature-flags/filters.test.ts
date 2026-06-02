import { describe, expect, it } from "vitest";
import {
	type FlagFilters,
	buildFilters,
	classifyDotPath,
	clearMultivariate,
	parsePayload,
	parseProperty,
	parseVariant,
	setAggregation,
	setDeep,
	setMultivariate,
	setRollout,
	summarizeCondition,
	upsertTargetGroup,
} from "./filters";

describe("parseProperty", () => {
	it("parses key=value shorthand as exact with an array value", () => {
		expect(parseProperty("plan=enterprise")).toEqual({
			key: "plan",
			operator: "exact",
			type: "person",
			value: ["enterprise"],
		});
	});

	it("parses 'key operator value' with a scalar value", () => {
		expect(parseProperty("email icontains @acme.com")).toEqual({
			key: "email",
			operator: "icontains",
			type: "person",
			value: "@acme.com",
		});
	});

	it("stamps group_type_index and forces type=group when groupTypeIndex is given", () => {
		expect(parseProperty("name=acme", { groupTypeIndex: 2 })).toEqual({
			key: "name",
			operator: "exact",
			type: "group",
			value: ["acme"],
			group_type_index: 2,
		});
	});

	it("treats a cohort membership value as a scalar cohort id", () => {
		expect(parseProperty("id:cohort in 123")).toEqual({
			key: "id",
			operator: "in",
			type: "cohort",
			value: 123,
		});
	});

	it("keeps comparison values as strings (PostHog validates them as strings)", () => {
		expect(parseProperty("age gt 30")).toEqual({
			key: "age",
			operator: "gt",
			type: "person",
			value: "30",
		});
	});

	it("rejects in/not_in for non-cohort properties", () => {
		expect(() => parseProperty("plan in pro,team")).toThrow(/only valid for cohort/);
	});

	it("splits comma-separated exact values into an array", () => {
		expect(parseProperty("plan=pro,team").value).toEqual(["pro", "team"]);
	});

	it("supports key=value shorthand with spaces in the value", () => {
		expect(parseProperty("company=Acme Inc")).toEqual({
			key: "company",
			operator: "exact",
			type: "person",
			value: ["Acme Inc"],
		});
	});

	it("accepts valueless operators and rejects a stray value", () => {
		expect(parseProperty("beta is_set")).toEqual({
			key: "beta",
			operator: "is_set",
			type: "person",
		});
		expect(() => parseProperty("beta is_set x")).toThrow(/no value/);
	});

	it("rejects between with a two-condition hint", () => {
		expect(() => parseProperty("age between 1")).toThrow(/two conditions/);
	});

	it("rejects unknown operators", () => {
		expect(() => parseProperty("age frobnicate 1")).toThrow(/Unknown operator/);
	});
});

describe("parseVariant", () => {
	it("parses key:percent[:name]", () => {
		expect(parseVariant("control:50")).toEqual({ key: "control", rollout_percentage: 50 });
		expect(parseVariant("test:50:My Test")).toEqual({
			key: "test",
			rollout_percentage: 50,
			name: "My Test",
		});
	});

	it("rejects out-of-range percentages", () => {
		expect(() => parseVariant("x:150")).toThrow(/0-100/);
	});
});

describe("setRollout", () => {
	it("creates an all-users group when none exist", () => {
		const f = setRollout({ groups: [] }, 30);
		expect(f.groups).toEqual([{ properties: [], rollout_percentage: 30 }]);
	});

	it("sets the lone group's rollout without a selector", () => {
		const f = setRollout({ groups: [{ properties: [], rollout_percentage: 0 }] }, 75);
		expect(f.groups[0].rollout_percentage).toBe(75);
	});

	it("requires a selector when conditions are ambiguous", () => {
		const f: FlagFilters = {
			groups: [
				{
					properties: [{ key: "a", operator: "exact", type: "person", value: ["x"] }],
					rollout_percentage: 0,
				},
				{ properties: [], rollout_percentage: 0 },
			],
		};
		expect(() => setRollout(f, 50)).toThrow(/--condition/);
	});

	it("selects the all-users group by selector and leaves siblings untouched", () => {
		const f: FlagFilters = {
			groups: [
				{
					properties: [{ key: "a", operator: "exact", type: "person", value: ["x"] }],
					rollout_percentage: 10,
				},
				{ properties: [], rollout_percentage: 0 },
			],
		};
		setRollout(f, 50, "all");
		expect(f.groups[0].rollout_percentage).toBe(10);
		expect(f.groups[1].rollout_percentage).toBe(50);
	});
});

describe("upsertTargetGroup", () => {
	const prop = { key: "plan", operator: "exact", type: "person" as const, value: ["pro"] };

	it("appends a condition in add mode", () => {
		const f = upsertTargetGroup({ groups: [] }, { properties: [prop], rollout: 100, mode: "add" });
		expect(f.groups).toHaveLength(1);
		expect(f.groups[0].rollout_percentage).toBe(100);
	});

	it("replaceAll nukes existing groups", () => {
		const f: FlagFilters = { groups: [{ properties: [], rollout_percentage: 5 }] };
		upsertTargetGroup(f, { properties: [prop], rollout: 100, mode: "replaceAll" });
		expect(f.groups).toHaveLength(1);
		expect(f.groups[0].properties[0].key).toBe("plan");
	});

	it("sets aggregation index when provided", () => {
		const f = upsertTargetGroup(
			{ groups: [] },
			{
				properties: [
					{ key: "name", operator: "exact", type: "group", value: ["acme"], group_type_index: 1 },
				],
				mode: "add",
				aggregation: 1,
			},
		);
		expect(f.aggregation_group_type_index).toBe(1);
	});
});

describe("setAggregation", () => {
	it("refuses to revert to person while group properties remain", () => {
		const f: FlagFilters = {
			groups: [
				{
					properties: [
						{ key: "name", operator: "exact", type: "group", value: ["acme"], group_type_index: 0 },
					],
					rollout_percentage: 100,
				},
			],
			aggregation_group_type_index: 0,
		};
		expect(() => setAggregation(f, null)).toThrow(/person aggregation/);
	});
});

describe("setMultivariate / clearMultivariate", () => {
	it("requires variant percentages to sum to 100", () => {
		expect(() =>
			setMultivariate({ groups: [] }, [parseVariant("a:40"), parseVariant("b:40")]),
		).toThrow(/sum/);
	});

	it("rejects a payload referencing a removed variant", () => {
		const f: FlagFilters = { groups: [], payloads: { gone: 1 } };
		expect(() => setMultivariate(f, [parseVariant("a:100")])).toThrow(/not in the variant set/);
	});

	it("rejects a group variant override pointing at a removed variant", () => {
		const f: FlagFilters = {
			groups: [{ properties: [], rollout_percentage: 100, variant: "old" }],
		};
		expect(() => setMultivariate(f, [parseVariant("a:100")])).toThrow(/removed variant/);
	});

	it("clear reverts to boolean and strips dangling references", () => {
		const f: FlagFilters = {
			groups: [{ properties: [], rollout_percentage: 100, variant: "test" }],
			multivariate: { variants: [parseVariant("control:50"), parseVariant("test:50")] },
			payloads: { test: 1, true: 2 },
		};
		clearMultivariate(f);
		expect(f.multivariate).toBeNull();
		expect(f.payloads).toEqual({ true: 2 });
		expect(f.groups[0].variant).toBeNull();
	});
});

describe("buildFilters", () => {
	it("builds a single group at the given rollout", () => {
		expect(buildFilters({ rollout: 25 })).toEqual({
			groups: [{ properties: [], rollout_percentage: 25 }],
		});
	});

	it("attaches variants via setMultivariate", () => {
		const f = buildFilters({ variants: [parseVariant("a:50"), parseVariant("b:50")] });
		expect(f.multivariate?.variants).toHaveLength(2);
	});
});

describe("setDeep", () => {
	it("sets an existing scalar leaf", () => {
		const root: Record<string, unknown> = { filters: { groups: [{ rollout_percentage: 0 }] } };
		setDeep(root, "filters.groups[0].rollout_percentage", 50);
		expect((root.filters as FlagFilters).groups[0].rollout_percentage).toBe(50);
	});

	it("refuses out-of-range array indices", () => {
		const root: Record<string, unknown> = { groups: [] };
		expect(() => setDeep(root, "groups[0]", 1)).toThrow(/out of range/);
	});

	it("refuses to auto-vivify missing objects", () => {
		const root: Record<string, unknown> = {};
		expect(() => setDeep(root, "a.b", 1)).toThrow(/does not exist/);
	});
});

describe("classifyDotPath", () => {
	it("routes filters.* to filters", () => {
		expect(classifyDotPath("filters.groups[0].rollout_percentage")).toBe("filters");
	});

	it("routes a writable field to top-level", () => {
		expect(classifyDotPath("evaluation_runtime")).toBe("top-level");
	});

	it("rejects read-only fields", () => {
		expect(() => classifyDotPath("id")).toThrow(/read-only/);
	});

	it("rejects unknown fields", () => {
		expect(() => classifyDotPath("nonsense")).toThrow(/not a known writable/);
	});
});

describe("parsePayload / summarizeCondition", () => {
	it("parses key=json payloads", () => {
		expect(parsePayload('test={"a":1}')).toEqual({ key: "test", value: { a: 1 } });
	});

	it("summarizes a condition", () => {
		expect(
			summarizeCondition({
				properties: [{ key: "plan", operator: "exact", type: "person", value: ["pro"] }],
				rollout_percentage: 50,
			}),
		).toBe('plan exact ["pro"] (50%)');
	});
});
