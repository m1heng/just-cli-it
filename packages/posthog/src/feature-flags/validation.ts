/**
 * Pure validation of a feature flag's `filters` and writable top-level body.
 * Runs BEFORE any network call so a malformed mutation never leaves the CLI.
 */

import { type FlagFilters, OPERATORS } from "./filters";

const VALUELESS = new Set(["is_set", "is_not_set"]);
const EVALUATION_RUNTIMES = new Set(["server", "client", "all"]);

function isRecord(v: unknown): v is Record<string, unknown> {
	return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Assert the full filters object is well-formed and internally consistent. Throws on the first problem. */
export function validateFilters(filters: FlagFilters): void {
	if (!isRecord(filters)) throw new Error("filters must be an object.");
	const groups = filters.groups;
	if (!Array.isArray(groups)) throw new Error("filters.groups must be an array.");

	const aggIndex = filters.aggregation_group_type_index;
	if (aggIndex != null && (!Number.isInteger(aggIndex) || aggIndex < 0)) {
		throw new Error("filters.aggregation_group_type_index must be a non-negative integer or null.");
	}

	const variants = filters.multivariate?.variants;
	const variantKeys = new Set<string>();
	if (filters.multivariate != null) {
		if (!Array.isArray(variants))
			throw new Error("filters.multivariate.variants must be an array.");
		let sum = 0;
		for (const v of variants) {
			if (!isRecord(v) || typeof v.key !== "string") {
				throw new Error("Each variant needs a string key.");
			}
			if (!Number.isInteger(v.rollout_percentage)) {
				throw new Error(`Variant "${v.key}" rollout_percentage must be an integer.`);
			}
			sum += v.rollout_percentage as number;
			variantKeys.add(v.key);
		}
		if (sum !== 100) throw new Error(`Variant percentages must sum to 100 (got ${sum}).`);
	}

	groups.forEach((group, gi) => {
		if (!isRecord(group))
			throw new Error(`filters.groups[${gi}] must be an object (no null holes).`);
		const rp = group.rollout_percentage;
		if (rp != null && (!Number.isInteger(rp) || (rp as number) < 0 || (rp as number) > 100)) {
			throw new Error(`filters.groups[${gi}].rollout_percentage must be an integer 0-100 or null.`);
		}
		const properties = group.properties ?? [];
		if (!Array.isArray(properties))
			throw new Error(`filters.groups[${gi}].properties must be an array.`);
		for (const p of properties) {
			if (!isRecord(p) || typeof p.key !== "string") {
				throw new Error(`A property in group ${gi} is missing a string key.`);
			}
			// A missing operator is valid (PostHog defaults to exact). PostHog also supports more
			// operators than the CLI lets users type (semver_*, *_multi, …), so unknown operators
			// are trusted to the server rather than rejected — otherwise editing an unrelated field
			// on an existing flag would fail locally. We only enforce arity for operators we know.
			if (p.operator !== undefined) {
				if (typeof p.operator !== "string") {
					throw new Error(`Property "${p.key}" operator must be a string.`);
				}
				if (VALUELESS.has(p.operator)) {
					if (p.value !== undefined) {
						throw new Error(`Property "${p.key}" (${p.operator}) must not carry a value.`);
					}
				} else if ((OPERATORS as readonly string[]).includes(p.operator) && p.value === undefined) {
					throw new Error(`Property "${p.key}" (${p.operator}) requires a value.`);
				}
			}
			// person/group/cohort mutual exclusion vs aggregation
			if (aggIndex != null) {
				if (p.type !== "group") {
					throw new Error(
						`Group-aggregated flag may only use group properties; "${p.key}" is type "${String(p.type)}".`,
					);
				}
				if (p.group_type_index !== aggIndex) {
					throw new Error(
						`Property "${p.key}" group_type_index (${String(p.group_type_index)}) must match aggregation index ${aggIndex}.`,
					);
				}
			} else if (p.type === "group") {
				throw new Error(
					`Property "${p.key}" is a group property but the flag is not group-aggregated (set --group-type).`,
				);
			}
		}
		// per-group variant override must reference an existing variant
		const variant = group.variant;
		if (variant != null && variant !== "") {
			if (!filters.multivariate) {
				throw new Error(`Group ${gi} sets variant "${variant}" but the flag has no variants.`);
			}
			if (!variantKeys.has(variant as string)) {
				throw new Error(`Group ${gi} references unknown variant "${variant}".`);
			}
		}
	});

	// payload keys must reference a variant key (multivariate) or "true" (boolean)
	for (const k of Object.keys(filters.payloads ?? {})) {
		if (filters.multivariate) {
			if (!variantKeys.has(k)) throw new Error(`Payload key "${k}" is not a defined variant.`);
		} else if (k !== "true") {
			throw new Error(`Payload key "${k}" is invalid for a boolean flag (use "true").`);
		}
	}
}

/** Validate the writable top-level fields of a mutation body (cross-field rules PostHog enforces server-side). */
export function validateTopLevel(body: Record<string, unknown>): void {
	if (
		body.evaluation_runtime !== undefined &&
		!EVALUATION_RUNTIMES.has(String(body.evaluation_runtime))
	) {
		throw new Error(
			`evaluation_runtime must be one of ${[...EVALUATION_RUNTIMES].join(", ")} (got "${String(body.evaluation_runtime)}").`,
		);
	}
	if (body.has_encrypted_payloads === true && body.is_remote_configuration !== true) {
		throw new Error("has_encrypted_payloads=true requires is_remote_configuration=true.");
	}
}
