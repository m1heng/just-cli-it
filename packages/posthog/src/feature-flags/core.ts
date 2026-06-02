/**
 * The privileged, impure layer: the SINGLE mutating writer plus the key->id and
 * group-type resolvers. Everything that touches the network for feature flags
 * goes through here, so read-modify-write integrity lives in exactly one place.
 */

import { type OutputFormat, formatOutput } from "@jcit/core";
import { consola } from "consola";
import type { createPostHogClient } from "../client";
import type { FeatureFlag, FlagFilters } from "./filters";
import { validateFilters, validateTopLevel } from "./validation";

type PostHogClient = ReturnType<typeof createPostHogClient>;

interface GroupType {
	group_type: string;
	group_type_index: number;
}

export interface FlagCtx {
	client: PostHogClient;
	projectId: string;
	format: OutputFormat;
	_groupTypes?: GroupType[];
}

const base = (ctx: FlagCtx) => `/api/projects/${ctx.projectId}/feature_flags/`;
const flagPath = (ctx: FlagCtx, id: number) => `${base(ctx)}${id}/`;

export async function getFlag(ctx: FlagCtx, id: number): Promise<FeatureFlag> {
	return ctx.client<FeatureFlag>(flagPath(ctx, id));
}

/** Resolve a flag reference to its numeric id. The positional ref is ALWAYS a key; ids come via --id. */
export async function resolveFlagRef(
	ctx: FlagCtx,
	ref: { key?: string; id?: number | string },
): Promise<number> {
	if (ref.id != null) {
		const n = Number(ref.id);
		if (!Number.isInteger(n)) throw new Error(`--id must be an integer (got "${ref.id}").`);
		return n;
	}
	const key = ref.key;
	if (!key) throw new Error("Provide a flag <key> or --id <n>.");

	const limit = 100;
	let offset = 0;
	while (true) {
		const qs = new URLSearchParams({ limit: String(limit), offset: String(offset) });
		const page = await ctx.client<{ results?: FeatureFlag[]; next?: string | null }>(
			`${base(ctx)}?${qs}`,
		);
		const matches = (page.results ?? []).filter((f) => f.key === key);
		if (matches.length > 1) throw new Error(`Unexpected: multiple flags share key "${key}".`);
		if (matches.length === 1) return matches[0].id;
		if (!page.next) break;
		offset += limit;
	}
	throw new Error(`No flag with key "${key}". Run: posthog-cli-it feature-flags list`);
}

export async function listGroupTypes(ctx: FlagCtx): Promise<GroupType[]> {
	if (!ctx._groupTypes) {
		ctx._groupTypes = await ctx.client<GroupType[]>(`/api/projects/${ctx.projectId}/groups_types/`);
	}
	return ctx._groupTypes;
}

/** Resolve a group-type name (e.g. "organization") to its positional index. Never hardcode 0. */
export async function resolveGroupTypeIndex(ctx: FlagCtx, name: string): Promise<number> {
	const types = await listGroupTypes(ctx);
	const found = types.find((t) => t.group_type === name);
	if (!found) {
		const avail = types.map((t) => t.group_type).join(", ") || "(none)";
		throw new Error(
			`Unknown group type "${name}". Available: ${avail}. See: posthog-cli-it feature-flags group-types`,
		);
	}
	return found.group_type_index;
}

function sortKeys(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(sortKeys);
	if (value && typeof value === "object") {
		const out: Record<string, unknown> = {};
		for (const k of Object.keys(value as Record<string, unknown>).sort()) {
			out[k] = sortKeys((value as Record<string, unknown>)[k]);
		}
		return out;
	}
	return value;
}

const stable = (value: unknown) => JSON.stringify(sortKeys(value), null, 2);

/** A labeled before/after view of the filters object, for --dry-run (written to stderr). */
export function diffFilters(before: unknown, after: unknown): string {
	return `--- current filters\n${stable(before)}\n+++ new filters\n${stable(after)}`;
}

function mapApiError(error: unknown): Error {
	const data = (error as { data?: unknown })?.data;
	if (data && typeof data === "object") {
		const detail =
			(data as { detail?: unknown; message?: unknown }).detail ??
			(data as { message?: unknown }).message;
		if (detail) return new Error(String(detail));
	}
	return error instanceof Error ? error : new Error(String(error));
}

export interface MutationOpts {
	mutateFilters?: (filters: FlagFilters, flag: FeatureFlag) => FlagFilters;
	topLevel?: Record<string, unknown>;
	summary: string;
	dryRun?: boolean;
	yes?: boolean;
}

/**
 * The ONLY function that issues a mutating feature-flag request. Body assembly is
 * explicit: { ...topLevel, ...(mutateFilters ? { filters } : {}) }. Filters-editing
 * verbs run their transform on a clone of the COMPLETE GET'd filters and always send
 * the whole filters back; topLevel-only verbs (enable/disable/delete) never include a
 * filters key so PostHog's top-level shallow merge leaves targeting untouched.
 */
export async function applyFlagMutation(
	ctx: FlagCtx,
	flagId: number,
	opts: MutationOpts,
): Promise<void> {
	const url = flagPath(ctx, flagId);
	const flag = await getFlag(ctx, flagId);
	const before = flag.filters;
	const top = opts.topLevel ?? {};
	validateTopLevel(top);
	let after: FlagFilters | undefined;
	if (opts.mutateFilters) {
		after = opts.mutateFilters(structuredClone(flag.filters ?? { groups: [] }), flag);
		validateFilters(after);
	}
	const body = { ...top, ...(opts.mutateFilters ? { filters: after } : {}) };
	if (Object.keys(body).length === 0) throw new Error("Nothing to update.");

	const diff = after ? diffFilters(before ?? { groups: [] }, after) : undefined;
	if (
		!(await passesGate(
			ctx,
			{ method: "PATCH", url, body },
			{ summary: opts.summary, dryRun: opts.dryRun, yes: opts.yes, diff },
		))
	) {
		return;
	}

	let result: unknown;
	try {
		result = await ctx.client(url, { method: "PATCH", body });
	} catch (error) {
		throw mapApiError(error);
	}
	if (result === null || result === undefined || result === "") return;
	formatOutput(result, ctx.format);
}

/**
 * The shared dry-run / confirmation / fail-closed gate for EVERY mutating command.
 * Returns false when the caller should stop (dry-run printed, or aborted).
 */
async function passesGate(
	ctx: FlagCtx,
	payload: { method: string; url: string; body?: Record<string, unknown> },
	opts: { summary: string; dryRun?: boolean; yes?: boolean; diff?: string },
): Promise<boolean> {
	if (opts.dryRun) {
		if (opts.diff) process.stderr.write(`${opts.diff}\n`);
		process.stderr.write(`DRY RUN — ${opts.summary}\n`);
		formatOutput(payload, ctx.format);
		return false;
	}
	const autoYes = opts.yes || !!process.env.CI || !!process.env.POSTHOG_YES;
	if (!autoYes) {
		if (!process.stdin.isTTY) {
			throw new Error(
				"refusing to mutate without a TTY; pass --yes to confirm in non-interactive contexts.",
			);
		}
		const ok = await consola.prompt(`${opts.summary} Continue?`, { type: "confirm" });
		if (!ok) {
			consola.info("Aborted.");
			return false;
		}
	}
	return true;
}

/** Create a flag (POST). Separate from applyFlagMutation since there is no existing flag to read. */
export async function createFlag(
	ctx: FlagCtx,
	body: Record<string, unknown>,
	opts: { dryRun?: boolean; yes?: boolean },
): Promise<void> {
	const url = base(ctx);
	const summary = `Create flag "${String(body.key)}".`;
	if (
		!(await passesGate(
			ctx,
			{ method: "POST", url, body },
			{ summary, dryRun: opts.dryRun, yes: opts.yes },
		))
	) {
		return;
	}
	let result: unknown;
	try {
		result = await ctx.client(url, { method: "POST", body });
	} catch (error) {
		throw mapApiError(error);
	}
	formatOutput(result, ctx.format);
}
