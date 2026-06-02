/**
 * Pure, I/O-free feature-flag `filters` model and transforms.
 *
 * SSOT for all targeting knowledge. Every transform takes a filters object it
 * OWNS (the caller passes a structuredClone) and returns it after mutation, so
 * the privileged writer in core.ts can always PATCH the WHOLE filters back —
 * PostHog replaces the `filters` key wholesale, never deep-merges.
 */

export type PropertyType = "person" | "group" | "cohort" | "flag";

export interface PropertyFilter {
	key: string;
	operator: string;
	type: PropertyType;
	value?: unknown;
	group_type_index?: number;
}

export interface FlagGroup {
	properties: PropertyFilter[];
	rollout_percentage: number | null;
	variant?: string | null;
}

export interface MultivariateVariant {
	key: string;
	rollout_percentage: number;
	name?: string;
}

export interface FlagFilters {
	groups: FlagGroup[];
	multivariate?: { variants: MultivariateVariant[] } | null;
	payloads?: Record<string, unknown>;
	aggregation_group_type_index?: number | null;
	// Unknown fields (holdout, super_groups, …) are preserved across edits.
	[key: string]: unknown;
}

export interface FeatureFlag {
	id: number;
	key: string;
	active: boolean;
	filters: FlagFilters;
	name?: string;
	deleted?: boolean;
	[key: string]: unknown;
}

/** Operator whitelist, aligned 1:1 with PostHog PropertyOperator (minus between/not_between). */
export const OPERATORS = [
	"exact",
	"is_not",
	"icontains",
	"not_icontains",
	"regex",
	"not_regex",
	"gt",
	"gte",
	"lt",
	"lte",
	"is_set",
	"is_not_set",
	"is_date_exact",
	"is_date_before",
	"is_date_after",
	"in",
	"not_in",
	"flag_evaluates_to",
] as const;

const PROPERTY_TYPES: PropertyType[] = ["person", "group", "cohort", "flag"];
const VALUELESS = new Set(["is_set", "is_not_set"]);
const ARRAY_VALUE = new Set(["exact", "is_not", "in", "not_in"]);

function coerceNumber(raw: string): unknown {
	return raw !== "" && !Number.isNaN(Number(raw)) ? Number(raw) : raw;
}

function coerceBool(raw: string): unknown {
	if (raw === "true") return true;
	if (raw === "false") return false;
	return raw;
}

/**
 * Shape a property value to what the PostHog API expects, by operator and type:
 * cohort membership is a scalar cohort id; exact/is_not/in/not_in are string lists;
 * flag_evaluates_to compares a variant key or boolean; everything else (comparisons,
 * contains, regex, dates) stays a scalar string (PostHog validates these as strings).
 */
function shapeValue(operator: string, type: PropertyType, raw: string): unknown {
	if (type === "cohort") return coerceNumber(raw);
	if (ARRAY_VALUE.has(operator)) return raw.split(",").map((s) => s.trim());
	if (operator === "flag_evaluates_to") return coerceBool(raw);
	return raw;
}

function assertRollout(pct: number): void {
	if (!Number.isInteger(pct) || pct < 0 || pct > 100) {
		throw new Error(`Rollout percentage must be an integer 0-100 (got ${pct}).`);
	}
}

/**
 * Parse a `--property` spec into a PropertyFilter.
 * Grammar: `key[:type] operator [value]`  or the shorthand `key[:type]=value` (exact).
 * When groupTypeIndex is provided, the property is forced to type=group and stamped.
 */
export function parseProperty(
	spec: string,
	opts: { groupTypeIndex?: number | null } = {},
): PropertyFilter {
	const trimmed = spec.trim();
	let keyspec: string;
	let operator: string;
	let valueStr: string | undefined;

	const ws = trimmed.search(/\s/);
	const eq = trimmed.indexOf("=");
	if (eq !== -1 && (ws === -1 || eq < ws)) {
		// Shorthand key[:type]=value (value may contain whitespace), e.g. 'company=Acme Inc'.
		keyspec = trimmed.slice(0, eq);
		operator = "exact";
		valueStr = trimmed.slice(eq + 1);
	} else if (ws !== -1) {
		const parts = trimmed.split(/\s+/);
		keyspec = parts[0];
		operator = parts[1];
		valueStr = parts.length > 2 ? parts.slice(2).join(" ") : undefined;
	} else {
		throw new Error(`Invalid --property "${spec}". Use 'key operator value' or 'key=value'.`);
	}

	if (operator === "min") operator = "gte";
	if (operator === "max") operator = "lte";
	if (operator === "between" || operator === "not_between") {
		throw new Error(
			`Operator "${operator}" is unsupported. Use two conditions: 'key gte X' and 'key lte Y'.`,
		);
	}
	if (!(OPERATORS as readonly string[]).includes(operator)) {
		throw new Error(`Unknown operator "${operator}". Valid: ${OPERATORS.join(", ")}.`);
	}

	let key = keyspec;
	let explicitType: string | undefined;
	const colon = keyspec.indexOf(":");
	if (colon !== -1) {
		key = keyspec.slice(0, colon);
		explicitType = keyspec.slice(colon + 1);
	}
	if (!key) throw new Error(`Invalid --property "${spec}": missing property key.`);

	let type: PropertyType;
	if (opts.groupTypeIndex != null) {
		type = "group";
	} else if (explicitType) {
		if (!PROPERTY_TYPES.includes(explicitType as PropertyType)) {
			throw new Error(
				`Unknown property type "${explicitType}". Valid: ${PROPERTY_TYPES.join(", ")}.`,
			);
		}
		type = explicitType as PropertyType;
	} else {
		type = "person";
	}

	// PostHog feature flags only accept in/not_in for cohort membership; person/group
	// multi-value matches use exact/is_not with a comma-separated value.
	if ((operator === "in" || operator === "not_in") && type !== "cohort") {
		throw new Error(
			`Operator "${operator}" is only valid for cohort properties. For multiple values use 'key=a,b' (exact).`,
		);
	}

	const valueless = VALUELESS.has(operator);
	if (valueless && valueStr) throw new Error(`Operator "${operator}" takes no value.`);
	if (!valueless && (valueStr === undefined || valueStr === "")) {
		throw new Error(`Operator "${operator}" requires a value (in --property "${spec}").`);
	}

	const prop: PropertyFilter = { key, operator, type };
	if (!valueless && valueStr !== undefined) {
		prop.value = shapeValue(operator, type, valueStr);
	}
	if (type === "group" && opts.groupTypeIndex != null) {
		prop.group_type_index = opts.groupTypeIndex;
	}
	return prop;
}

/** Parse a `--variant key:percent[:name]` spec. */
export function parseVariant(spec: string): MultivariateVariant {
	const parts = spec.split(":");
	if (parts.length < 2) throw new Error(`Invalid --variant "${spec}". Use key:percent[:name].`);
	const key = parts[0];
	if (!key) throw new Error(`Invalid --variant "${spec}": missing key.`);
	const pct = Number(parts[1]);
	if (!Number.isInteger(pct) || pct < 0 || pct > 100) {
		throw new Error(`Variant "${key}" percentage must be an integer 0-100 (got "${parts[1]}").`);
	}
	const variant: MultivariateVariant = { key, rollout_percentage: pct };
	if (parts.length > 2) variant.name = parts.slice(2).join(":");
	return variant;
}

/** Parse a JSON value (object/array/string/number/bool/null) for payloads and --set. */
export function parseJsonValue(raw: string): unknown {
	try {
		return JSON.parse(raw);
	} catch {
		throw new Error(`Invalid JSON value: ${raw}`);
	}
}

/** Parse a `--payload key=json` spec. */
export function parsePayload(spec: string): { key: string; value: unknown } {
	const eq = spec.indexOf("=");
	if (eq === -1) throw new Error(`Invalid --payload "${spec}". Use key=<json>.`);
	const key = spec.slice(0, eq);
	if (!key) throw new Error(`Invalid --payload "${spec}": missing variant key.`);
	return { key, value: parseJsonValue(spec.slice(eq + 1)) };
}

/** Build a fresh filters object for `create`. */
export function buildFilters(opts: {
	rollout?: number;
	targets?: PropertyFilter[];
	groupTypeIndex?: number | null;
	variants?: MultivariateVariant[];
	payloads?: Record<string, unknown>;
}): FlagFilters {
	const rollout = opts.rollout ?? 0;
	assertRollout(rollout);
	const filters: FlagFilters = {
		groups: [{ properties: opts.targets ?? [], rollout_percentage: rollout }],
	};
	if (opts.groupTypeIndex != null) filters.aggregation_group_type_index = opts.groupTypeIndex;
	if (opts.variants?.length) {
		return setMultivariate(filters, opts.variants, opts.payloads);
	}
	if (opts.payloads && Object.keys(opts.payloads).length) filters.payloads = opts.payloads;
	return filters;
}

/** Locate the single group a selector refers to. Returns -1 when none exists (caller may create). */
function selectGroupIndex(groups: FlagGroup[], selector: string | undefined): number {
	if (selector === undefined) {
		if (groups.length === 0) return -1;
		if (groups.length === 1) return 0;
		throw new Error("Multiple conditions exist; pass --condition <all|propertyKey> to choose one.");
	}
	const matches: number[] = [];
	if (selector === "all") {
		groups.forEach((g, i) => {
			if ((g.properties ?? []).length === 0) matches.push(i);
		});
	} else {
		const want = selector.split("+").sort().join("+");
		groups.forEach((g, i) => {
			const got = (g.properties ?? [])
				.map((p) => p.key)
				.sort()
				.join("+");
			if (got === want) matches.push(i);
		});
	}
	if (matches.length === 0) {
		if (selector === "all") return -1;
		throw new Error(`No condition matches --condition "${selector}".`);
	}
	if (matches.length > 1) {
		throw new Error(`--condition "${selector}" matches multiple conditions; cannot disambiguate.`);
	}
	return matches[0];
}

/** Set a rollout percentage on the selected group (or the lone/all-users group). */
export function setRollout(filters: FlagFilters, pct: number, selector?: string): FlagFilters {
	assertRollout(pct);
	if (!filters.groups) filters.groups = [];
	const idx = selectGroupIndex(filters.groups, selector);
	if (idx === -1) filters.groups.push({ properties: [], rollout_percentage: pct });
	else filters.groups[idx].rollout_percentage = pct;
	return filters;
}

export type TargetMode = "add" | "replace" | "clear" | "replaceAll";

/** Add / replace / clear a release-condition group. */
export function upsertTargetGroup(
	filters: FlagFilters,
	opts: {
		properties?: PropertyFilter[];
		rollout?: number;
		mode: TargetMode;
		selector?: string;
		aggregation?: number | null;
	},
): FlagFilters {
	if (!filters.groups) filters.groups = [];
	if (opts.aggregation !== undefined) filters.aggregation_group_type_index = opts.aggregation;
	const rollout = opts.rollout ?? 100;
	assertRollout(rollout);
	const group: FlagGroup = { properties: opts.properties ?? [], rollout_percentage: rollout };

	switch (opts.mode) {
		case "replaceAll":
			filters.groups = [group];
			break;
		case "add":
			filters.groups.push(group);
			break;
		case "replace": {
			const i = selectGroupIndex(filters.groups, opts.selector);
			if (i === -1) throw new Error("No condition matched for --replace.");
			filters.groups[i] = group;
			break;
		}
		case "clear": {
			const i = selectGroupIndex(filters.groups, opts.selector);
			if (i === -1) throw new Error("No condition matched for --clear.");
			filters.groups.splice(i, 1);
			break;
		}
	}
	return filters;
}

/** Set the group aggregation index (null = per-person). Asserts no leftover group props when reverting. */
export function setAggregation(filters: FlagFilters, index: number | null): FlagFilters {
	if (index === null) {
		const hasGroupProps = (filters.groups ?? []).some((g) =>
			(g.properties ?? []).some((p) => p.type === "group"),
		);
		if (hasGroupProps) {
			throw new Error(
				"Cannot revert to person aggregation while group conditions remain. Clear them first (target --clear).",
			);
		}
	}
	filters.aggregation_group_type_index = index;
	return filters;
}

/** Replace the multivariate variant set, reconciling payloads and per-group overrides. */
export function setMultivariate(
	filters: FlagFilters,
	variants: MultivariateVariant[],
	payloads?: Record<string, unknown>,
): FlagFilters {
	const sum = variants.reduce((s, v) => s + v.rollout_percentage, 0);
	if (sum !== 100) {
		throw new Error(`Variant percentages must sum to exactly 100 (got ${sum}).`);
	}
	const keys = new Set(variants.map((v) => v.key));
	if (keys.size !== variants.length) throw new Error("Duplicate variant keys.");
	filters.multivariate = { variants };
	if (payloads) filters.payloads = { ...(filters.payloads ?? {}), ...payloads };
	for (const k of Object.keys(filters.payloads ?? {})) {
		if (!keys.has(k)) {
			throw new Error(`Payload references variant "${k}" which is not in the variant set.`);
		}
	}
	for (const g of filters.groups ?? []) {
		if (g.variant && !keys.has(g.variant)) {
			throw new Error(`A condition references removed variant "${g.variant}".`);
		}
	}
	return filters;
}

/** Remove the multivariate block, reverting to a boolean flag and cleaning dangling references. */
export function clearMultivariate(filters: FlagFilters): FlagFilters {
	filters.multivariate = null;
	if (filters.payloads) {
		for (const k of Object.keys(filters.payloads)) {
			if (k !== "true") delete filters.payloads[k];
		}
	}
	for (const g of filters.groups ?? []) {
		if (g.variant) g.variant = null;
	}
	return filters;
}

/** Set a payload for a variant key (or "true" for boolean flags). */
export function setPayload(filters: FlagFilters, variantKey: string, value: unknown): FlagFilters {
	filters.payloads = { ...(filters.payloads ?? {}), [variantKey]: value };
	return filters;
}

/** Remove a payload. */
export function removePayload(filters: FlagFilters, variantKey: string): FlagFilters {
	if (filters.payloads) delete filters.payloads[variantKey];
	return filters;
}

/** Human one-line summary of a flag's targeting (the inverse of the build* verbs). */
export function describeFilters(flag: FeatureFlag): string {
	const f = flag.filters ?? ({ groups: [] } as FlagFilters);
	const parts = [`Active: ${flag.active ? "yes" : "no"}`];
	if (f.aggregation_group_type_index != null) {
		parts.push(`Match by: group #${f.aggregation_group_type_index}`);
	}
	const groups = f.groups ?? [];
	parts.push(groups.length ? groups.map(summarizeCondition).join(" OR ") : "No conditions");
	if (f.multivariate?.variants?.length) {
		parts.push(
			`Variants: ${f.multivariate.variants.map((v) => `${v.key} ${v.rollout_percentage}%`).join(", ")}`,
		);
	}
	return parts.join(" | ");
}

/** Human summary of a single release-condition group. */
export function summarizeCondition(group: FlagGroup): string {
	const props =
		(group.properties ?? [])
			.map((p) => {
				if (VALUELESS.has(p.operator)) return `${p.key} ${p.operator}`;
				return `${p.key} ${p.operator} ${JSON.stringify(p.value)}`;
			})
			.join(" AND ") || "all users";
	const pct = group.rollout_percentage == null ? "100%" : `${group.rollout_percentage}%`;
	return `${props} (${pct})`;
}

const READONLY_TOP_LEVEL = new Set([
	"id",
	"key",
	"created_at",
	"created_by",
	"is_simple_flag",
	"experiment_set",
	"version",
]);

const WRITABLE_TOP_LEVEL = new Set([
	"name",
	"active",
	"deleted",
	"evaluation_runtime",
	"ensure_experience_continuity",
	"is_remote_configuration",
	"has_encrypted_payloads",
	"rollback_conditions",
	"bucketing_identifier",
]);

/** Whether a `--set` dotpath targets the filters object or a writable top-level field. */
export function classifyDotPath(path: string): "filters" | "top-level" {
	const head = path.split(".")[0].split("[")[0];
	if (head === "filters") return "filters";
	if (READONLY_TOP_LEVEL.has(head)) {
		throw new Error(`Field "${head}" is read-only and cannot be set.`);
	}
	if (!WRITABLE_TOP_LEVEL.has(head)) {
		throw new Error(
			`Field "${head}" is not a known writable field. Writable: ${[...WRITABLE_TOP_LEVEL].join(", ")}, or filters.*`,
		);
	}
	return "top-level";
}

type PathSegment = { kind: "key"; key: string } | { kind: "index"; index: number };

function parseDotPath(path: string): PathSegment[] {
	const segments: PathSegment[] = [];
	for (const part of path.split(".")) {
		const m = part.match(/^([^[\]]*)((?:\[\d+\])*)$/);
		if (!m) throw new Error(`Invalid path segment "${part}".`);
		if (m[1]) segments.push({ kind: "key", key: m[1] });
		const indices = m[2].match(/\d+/g) ?? [];
		for (const idx of indices) segments.push({ kind: "index", index: Number(idx) });
	}
	return segments;
}

/**
 * Set a scalar leaf at a dot/bracket path on an existing object. Refuses to
 * auto-vivify intermediate containers, refuses out-of-range / hole-creating
 * array indices, and only writes scalar leaves.
 */
export function setDeep(root: Record<string, unknown>, path: string, value: unknown): void {
	const segments = parseDotPath(path);
	if (segments.length === 0) throw new Error("Empty path.");
	let cursor: unknown = root;
	for (let i = 0; i < segments.length - 1; i++) {
		const seg = segments[i];
		if (seg.kind === "key") {
			if (typeof cursor !== "object" || cursor === null || Array.isArray(cursor)) {
				throw new Error(`Cannot descend into "${seg.key}": parent is not an object.`);
			}
			const next = (cursor as Record<string, unknown>)[seg.key];
			if (next === undefined) throw new Error(`Path "${path}" does not exist (no "${seg.key}").`);
			cursor = next;
		} else {
			if (!Array.isArray(cursor)) throw new Error("Cannot index: parent is not an array.");
			if (seg.index < 0 || seg.index >= cursor.length) {
				throw new Error(`Array index ${seg.index} is out of range (length ${cursor.length}).`);
			}
			cursor = cursor[seg.index];
		}
	}
	const last = segments[segments.length - 1];
	if (last.kind === "key") {
		if (typeof cursor !== "object" || cursor === null || Array.isArray(cursor)) {
			throw new Error(`Cannot set "${last.key}": parent is not an object.`);
		}
		(cursor as Record<string, unknown>)[last.key] = value;
	} else {
		if (!Array.isArray(cursor)) throw new Error("Cannot set index: parent is not an array.");
		if (last.index < 0 || last.index >= cursor.length) {
			throw new Error(`Array index ${last.index} is out of range (length ${cursor.length}).`);
		}
		cursor[last.index] = value;
	}
}
