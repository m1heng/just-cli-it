import { readFileSync } from "node:fs";
import { type OutputFormat, addExamples, formatOutput } from "@jcit/core";
import type { Command } from "commander";
import { consola } from "consola";
import { createPostHogClient, resolveProjectId } from "../client";
import {
	type FlagCtx,
	applyFlagMutation,
	createFlag,
	getFlag,
	listGroupTypes,
	resolveFlagRef,
	resolveGroupTypeIndex,
} from "../feature-flags/core";
import {
	type FlagFilters,
	type MultivariateVariant,
	type PropertyFilter,
	buildFilters,
	classifyDotPath,
	clearMultivariate,
	describeFilters,
	parseJsonValue,
	parsePayload,
	parseProperty,
	parseVariant,
	removePayload,
	setAggregation,
	setDeep,
	setMultivariate,
	setPayload,
	setRollout,
	summarizeCondition,
	upsertTargetGroup,
} from "../feature-flags/filters";
import { validateFilters } from "../feature-flags/validation";
import { addCommonOptions, addMutationOptions, collectValues } from "../options";

// --- helpers -------------------------------------------------------------

function buildCtx(opts: {
	url?: string;
	token?: string;
	projectId?: string;
	format?: string;
}): FlagCtx {
	const client = createPostHogClient({ url: opts.url, token: opts.token });
	const projectId = resolveProjectId({ projectId: opts.projectId });
	return { client, projectId, format: (opts.format as OutputFormat) ?? "json" };
}

/** Turn a positional key + --id into a flag reference. The positional is ALWAYS a key. */
function flagRef(flag: string | undefined, opts: { id?: string }): { key?: string; id?: string } {
	if (opts.id != null && flag != null) {
		throw new Error("Provide either the <flag> key or --id, not both.");
	}
	if (opts.id == null && flag == null) throw new Error("Provide a flag <key> or --id <n>.");
	return opts.id != null ? { id: opts.id } : { key: flag };
}

/** Lenient scalar parse for --set values: JSON when possible, otherwise a bare string. */
function parseScalar(raw: string): unknown {
	try {
		return JSON.parse(raw);
	} catch {
		return raw;
	}
}

async function warnDependents(ctx: FlagCtx, id: number): Promise<void> {
	try {
		const deps = await ctx.client<unknown>(
			`/api/projects/${ctx.projectId}/feature_flags/${id}/dependent_flags/`,
		);
		const list = Array.isArray(deps) ? deps : ((deps as { results?: unknown[] })?.results ?? []);
		if (list.length) {
			consola.warn(
				`This flag is depended on by ${list.length} other flag(s). This change may break them.`,
			);
		}
	} catch {
		// dependent_flags may be unavailable on older instances — skip the pre-flight warning.
	}
}

// --- registration --------------------------------------------------------

export function registerFeatureFlags(program: Command) {
	const flags = program
		.command("feature-flags")
		.alias("ff")
		.description("Manage PostHog feature flags");

	registerRead(flags);
	registerCreate(flags);
	registerState(flags);
	registerTargeting(flags);
	registerVariants(flags);
	registerEscapeHatch(flags);
	registerLifecycle(flags);
	registerDiagnostics(flags);
}

// --- read ----------------------------------------------------------------

function registerRead(flags: Command) {
	const list = flags
		.command("list")
		.description("List feature flags")
		.option("--search <term>", "Search by key or name")
		.option("--status <status>", "Filter: active | inactive | stale")
		.option("--type <type>", "Filter: boolean | multivariant | experiment | remote_config")
		.option("--tag <tag>", "Filter by tag (repeatable)", collectValues, [])
		.option("--created-by <id>", "Filter by creator user id")
		.option("--evaluation-runtime <rt>", "Filter: server | client | all")
		.option("--limit <n>", "Max results", "100")
		.option("--offset <n>", "Pagination offset")
		.option("--all", "Auto-paginate and return a flat array");
	addCommonOptions(list).action(async (opts) => {
		const ctx = buildCtx(opts);
		const params = new URLSearchParams();
		if (opts.search) params.set("search", opts.search);
		if (opts.status) {
			const map: Record<string, string> = { active: "true", inactive: "false", stale: "STALE" };
			const value = map[opts.status];
			if (!value) throw new Error("--status must be active | inactive | stale.");
			params.set("active", value);
		}
		if (opts.type) {
			// API enum is multivariant (not multivariate); accept the friendlier spelling too.
			params.set("type", opts.type === "multivariate" ? "multivariant" : opts.type);
		}
		if (opts.tag.length) params.set("tags", JSON.stringify(opts.tag)); // API expects a JSON-encoded list
		if (opts.createdBy) params.set("created_by_id", opts.createdBy);
		// The stored field value for all-runtimes is `all`; the list filter is an exact match
		// against it, so pass the value through unchanged.
		if (opts.evaluationRuntime) params.set("evaluation_runtime", opts.evaluationRuntime);

		const flagBase = `/api/projects/${ctx.projectId}/feature_flags/`;
		if (opts.all) {
			const out: unknown[] = [];
			let offset = 0;
			while (true) {
				const p = new URLSearchParams(params);
				p.set("limit", "100");
				p.set("offset", String(offset));
				const page = await ctx.client<{ results?: unknown[]; next?: string | null }>(
					`${flagBase}?${p}`,
				);
				out.push(...(page.results ?? []));
				if (!page.next) break;
				offset += 100;
			}
			formatOutput(out, ctx.format);
			return;
		}
		params.set("limit", opts.limit);
		if (opts.offset) params.set("offset", opts.offset);
		const result = await ctx.client(`${flagBase}?${params}`);
		formatOutput(result, ctx.format);
	});
	addExamples(list, [
		"posthog-cli-it feature-flags list",
		"posthog-cli-it feature-flags list --status active --search beta",
		"posthog-cli-it feature-flags list --all --format table",
	]);

	const get = flags
		.command("get")
		.description("Get a feature flag by key (or --id)")
		.argument("[flag]", "Flag key")
		.option("--id <n>", "Flag numeric id")
		.option("--filters-only", "Print only the filters object")
		.option("--explain", "Print a one-line human summary");
	addCommonOptions(get).action(async (flag, opts) => {
		const ctx = buildCtx(opts);
		const id = await resolveFlagRef(ctx, flagRef(flag, opts));
		const f = await getFlag(ctx, id);
		if (opts.explain) {
			consola.log(describeFilters(f));
			return;
		}
		formatOutput(opts.filtersOnly ? f.filters : f, ctx.format);
	});
	addExamples(get, [
		"posthog-cli-it feature-flags get my-flag",
		"posthog-cli-it feature-flags get my-flag --explain",
		"posthog-cli-it feature-flags get --id 42 --filters-only",
	]);

	const conditions = flags
		.command("conditions")
		.description("List a flag's release conditions")
		.argument("[flag]", "Flag key")
		.option("--id <n>", "Flag numeric id");
	addCommonOptions(conditions).action(async (flag, opts) => {
		const ctx = buildCtx(opts);
		const id = await resolveFlagRef(ctx, flagRef(flag, opts));
		const f = await getFlag(ctx, id);
		const groups = f.filters?.groups ?? [];
		if (ctx.format === "json") {
			formatOutput(groups, "json");
			return;
		}
		if (!groups.length) consola.log("(no conditions)");
		groups.forEach((g, i) => consola.log(`${i}. ${summarizeCondition(g)}`));
	});
	addExamples(conditions, ["posthog-cli-it feature-flags conditions my-flag"]);
}

// --- create --------------------------------------------------------------

function registerCreate(flags: Command) {
	const create = flags
		.command("create")
		.description("Create a feature flag")
		.requiredOption("--key <key>", "Flag key (unique)")
		.option("--name <name>", "Human-readable name")
		.option("--active", "Activate immediately")
		.option("--rollout <pct>", "Rollout percentage (default 0)")
		.option("--target <expr>", "Release condition property (repeatable)", collectValues, [])
		.option("--group-type <name>", "Aggregate by group type (for --target)")
		.option("--variant <key:pct[:name]>", "Multivariate variant (repeatable)", collectValues, [])
		.option("--tag <tag>", "Tag (repeatable)", collectValues, [])
		.option("--json <json>", "Whole filters object as JSON (escape hatch)")
		.option("--file <path>", "Read filters JSON from file");
	addCommonOptions(addMutationOptions(create)).action(async (opts) => {
		const ctx = buildCtx(opts);
		const useJson = opts.json || opts.file;
		if (useJson && (opts.rollout || opts.target.length || opts.variant.length || opts.groupType)) {
			throw new Error(
				"--json/--file cannot be combined with --rollout/--target/--variant/--group-type.",
			);
		}

		let filters: FlagFilters;
		if (useJson) {
			const raw = opts.file ? readFileSync(opts.file, "utf-8") : opts.json;
			filters = parseJsonValue(raw) as FlagFilters;
		} else {
			let groupTypeIndex: number | undefined;
			if (opts.groupType) groupTypeIndex = await resolveGroupTypeIndex(ctx, opts.groupType);
			const targets = opts.target.map((t: string) => parseProperty(t, { groupTypeIndex }));
			const variants = opts.variant.map((v: string) => parseVariant(v));
			filters = buildFilters({
				rollout: opts.rollout != null ? Number(opts.rollout) : 0,
				targets,
				groupTypeIndex,
				variants: variants.length ? variants : undefined,
			});
		}
		validateFilters(filters);

		const body: Record<string, unknown> = { key: opts.key, active: !!opts.active, filters };
		if (opts.name) body.name = opts.name;
		if (opts.tag.length) body.tags = opts.tag;
		await createFlag(ctx, body, { dryRun: opts.dryRun, yes: opts.yes });
	});
	addExamples(create, [
		"posthog-cli-it feature-flags create --key new-dashboard --name 'New Dashboard'",
		"posthog-cli-it feature-flags create --key beta --rollout 25 --active",
		"posthog-cli-it feature-flags create --key ab-test --variant control:50 --variant test:50",
	]);
}

// --- state (enable/disable/toggle) --------------------------------------

function registerState(flags: Command) {
	const enable = flags
		.command("enable")
		.description("Activate a flag (targeting untouched)")
		.argument("[flag]", "Flag key")
		.option("--id <n>", "Flag numeric id");
	addCommonOptions(addMutationOptions(enable)).action(async (flag, opts) => {
		const ctx = buildCtx(opts);
		const id = await resolveFlagRef(ctx, flagRef(flag, opts));
		await applyFlagMutation(ctx, id, {
			topLevel: { active: true },
			summary: `Enable flag (id ${id}).`,
			dryRun: opts.dryRun,
			yes: opts.yes,
		});
	});
	addExamples(enable, ["posthog-cli-it feature-flags enable my-flag"]);

	const disable = flags
		.command("disable")
		.description("Deactivate a flag (targeting untouched)")
		.argument("[flag]", "Flag key")
		.option("--id <n>", "Flag numeric id");
	addCommonOptions(addMutationOptions(disable)).action(async (flag, opts) => {
		const ctx = buildCtx(opts);
		const id = await resolveFlagRef(ctx, flagRef(flag, opts));
		await warnDependents(ctx, id);
		await applyFlagMutation(ctx, id, {
			topLevel: { active: false },
			summary: `Disable flag (id ${id}).`,
			dryRun: opts.dryRun,
			yes: opts.yes,
		});
	});
	addExamples(disable, ["posthog-cli-it feature-flags disable my-flag"]);

	const toggle = flags
		.command("toggle")
		.description("[deprecated] Enable/disable a flag — use enable/disable")
		.argument("[flag]", "Flag key")
		.option("--id <n>", "Flag numeric id")
		.requiredOption("--active <bool>", "true | false");
	addCommonOptions(addMutationOptions(toggle)).action(async (flag, opts) => {
		if (opts.active !== "true" && opts.active !== "false") {
			throw new Error("--active must be exactly 'true' or 'false'.");
		}
		if (opts.format !== "json") consola.warn("`toggle` is deprecated; use `enable` / `disable`.");
		const ctx = buildCtx(opts);
		const id = await resolveFlagRef(ctx, flagRef(flag, opts));
		const active = opts.active === "true";
		if (!active) await warnDependents(ctx, id);
		await applyFlagMutation(ctx, id, {
			topLevel: { active },
			summary: `Set active=${active} (id ${id}).`,
			dryRun: opts.dryRun,
			yes: opts.yes,
		});
	});
	addExamples(toggle, ["posthog-cli-it feature-flags toggle my-flag --active true"]);
}

// --- targeting (rollout/target) -----------------------------------------

function registerTargeting(flags: Command) {
	const rollout = flags
		.command("rollout")
		.description("Set a flag's rollout percentage")
		.argument("[flag]", "Flag key")
		.argument("[percent]", "Rollout percentage 0-100")
		.option("--id <n>", "Flag numeric id")
		.option("--condition <selector>", "Target condition: all | <propertyKey>")
		.option("--enable", "Also activate the flag");
	addCommonOptions(addMutationOptions(rollout)).action(async (flag, percent, opts) => {
		const ctx = buildCtx(opts);
		let ref: { key?: string; id?: string };
		let pctStr: string | undefined;
		if (opts.id != null) {
			if (percent != null)
				throw new Error("With --id, pass only the percentage: rollout <percent> --id <n>.");
			ref = { id: opts.id };
			pctStr = flag;
		} else {
			if (flag == null || percent == null)
				throw new Error("Usage: feature-flags rollout <flag> <percent>.");
			ref = { key: flag };
			pctStr = percent;
		}
		const pct = Number(pctStr);
		if (!Number.isInteger(pct))
			throw new Error(`Rollout percentage must be an integer 0-100 (got "${pctStr}").`);
		const id = await resolveFlagRef(ctx, ref);
		await applyFlagMutation(ctx, id, {
			mutateFilters: (f) => setRollout(f, pct, opts.condition),
			topLevel: opts.enable ? { active: true } : undefined,
			summary: `Set rollout to ${pct}%${opts.enable ? " and enable" : ""} (id ${id}).`,
			dryRun: opts.dryRun,
			yes: opts.yes,
		});
	});
	addExamples(rollout, [
		"posthog-cli-it feature-flags rollout my-flag 50",
		"posthog-cli-it feature-flags rollout my-flag 100 --enable",
		"posthog-cli-it feature-flags rollout 25 --id 42",
	]);

	const target = flags
		.command("target")
		.description("Add or change a release condition")
		.argument("[flag]", "Flag key")
		.option("--id <n>", "Flag numeric id")
		.option("--property <expr>", "Condition property (repeatable, AND)", collectValues, [])
		.option("--rollout <pct>", "Rollout for this condition", "100")
		.option("--group-type <name>", "Aggregate by group type, or 'none' to revert to person")
		.option("--condition <selector>", "Select an existing condition (for --replace/--clear)")
		.option("--add", "Append a new condition (default)")
		.option("--replace", "Replace the selected condition")
		.option("--clear", "Remove the selected condition")
		.option("--replace-all", "Replace ALL conditions (destructive)");
	addCommonOptions(addMutationOptions(target)).action(async (flag, opts) => {
		const ctx = buildCtx(opts);
		const id = await resolveFlagRef(ctx, flagRef(flag, opts));

		const chosen = [
			opts.replace ? "replace" : null,
			opts.clear ? "clear" : null,
			opts.replaceAll ? "replaceAll" : null,
		].filter(Boolean) as Array<"replace" | "clear" | "replaceAll">;
		if (chosen.length > 1) throw new Error("Use only one of --replace / --clear / --replace-all.");
		const mode = (chosen[0] ?? "add") as "add" | "replace" | "clear" | "replaceAll";

		if (mode === "clear") {
			await applyFlagMutation(ctx, id, {
				mutateFilters: (f) => upsertTargetGroup(f, { mode: "clear", selector: opts.condition }),
				summary: `Clear condition "${opts.condition ?? ""}" (id ${id}).`,
				dryRun: opts.dryRun,
				yes: opts.yes,
			});
			return;
		}

		let aggregation: number | null | undefined;
		let groupTypeIndex: number | undefined;
		if (opts.groupType === "none") {
			aggregation = null;
		} else if (opts.groupType) {
			groupTypeIndex = await resolveGroupTypeIndex(ctx, opts.groupType);
			aggregation = groupTypeIndex;
		}

		const properties: PropertyFilter[] = opts.property.map((p: string) =>
			parseProperty(p, { groupTypeIndex }),
		);
		if (opts.groupType === "none" && properties.length === 0) {
			await applyFlagMutation(ctx, id, {
				mutateFilters: (f) => setAggregation(f, null),
				summary: `Revert to person aggregation (id ${id}).`,
				dryRun: opts.dryRun,
				yes: opts.yes,
			});
			return;
		}
		if (properties.length === 0 && mode !== "replaceAll") {
			throw new Error("Provide at least one --property (or use --clear / --group-type none).");
		}
		const rolloutPct = Number(opts.rollout);
		await applyFlagMutation(ctx, id, {
			mutateFilters: (f) =>
				upsertTargetGroup(f, {
					properties,
					rollout: rolloutPct,
					mode,
					selector: opts.condition,
					aggregation,
				}),
			summary: `${mode} condition (${properties.map((p) => p.key).join(", ") || "all users"}) at ${rolloutPct}% (id ${id}).`,
			dryRun: opts.dryRun,
			yes: opts.yes,
		});
	});
	target.addHelpText(
		"after",
		"\nProperty grammar: 'key[:type] operator value' or 'key=value' (exact)." +
			"\n  operators: exact, is_not, icontains, not_icontains, regex, not_regex, gt, gte, lt, lte," +
			"\n             is_set, is_not_set, is_date_exact, is_date_before, is_date_after, in, not_in, flag_evaluates_to" +
			"\n  types: person (default), group, cohort, flag",
	);
	addExamples(target, [
		"posthog-cli-it feature-flags target my-flag --property 'plan=enterprise' --rollout 100",
		"posthog-cli-it feature-flags target clips --group-type organization --property 'name=acme' --rollout 100",
		"posthog-cli-it feature-flags target my-flag --property 'email icontains @acme.com'",
		"posthog-cli-it feature-flags target my-flag --condition plan --clear",
	]);
}

// --- variants & payloads -------------------------------------------------

function registerVariants(flags: Command) {
	const variants = flags
		.command("variants")
		.description("Set or clear multivariate variants")
		.argument("[flag]", "Flag key")
		.option("--id <n>", "Flag numeric id")
		.option("--variant <key:pct[:name]>", "Variant (repeatable)", collectValues, [])
		.option("--payload <key=json>", "Variant payload (repeatable)", collectValues, [])
		.option("--clear", "Remove variants (revert to boolean)");
	addCommonOptions(addMutationOptions(variants)).action(async (flag, opts) => {
		const ctx = buildCtx(opts);
		const id = await resolveFlagRef(ctx, flagRef(flag, opts));
		if (opts.clear) {
			await applyFlagMutation(ctx, id, {
				mutateFilters: (f) => clearMultivariate(f),
				summary: `Clear variants (id ${id}).`,
				dryRun: opts.dryRun,
				yes: opts.yes,
			});
			return;
		}
		if (opts.variant.length === 0)
			throw new Error("Provide --variant key:pct (repeatable) or --clear.");
		const vs: MultivariateVariant[] = opts.variant.map((v: string) => parseVariant(v));
		const payloads: Record<string, unknown> = {};
		for (const p of opts.payload) {
			const { key, value } = parsePayload(p);
			payloads[key] = value;
		}
		await applyFlagMutation(ctx, id, {
			mutateFilters: (f) =>
				setMultivariate(f, vs, Object.keys(payloads).length ? payloads : undefined),
			summary: `Set ${vs.length} variant(s) (id ${id}).`,
			dryRun: opts.dryRun,
			yes: opts.yes,
		});
	});
	addExamples(variants, [
		"posthog-cli-it feature-flags variants my-flag --variant control:50 --variant test:50",
		"posthog-cli-it feature-flags variants my-flag --clear",
	]);

	const payload = flags
		.command("payload")
		.description("Set or remove a variant/boolean payload")
		.argument("[flag]", "Flag key")
		.option("--id <n>", "Flag numeric id")
		.option("--variant <key>", "Variant key (required for multivariate; 'true' for boolean)")
		.option("--json <json>", "Payload JSON")
		.option("--file <path>", "Read payload JSON from file")
		.option("--remove", "Remove the payload");
	addCommonOptions(addMutationOptions(payload)).action(async (flag, opts) => {
		const ctx = buildCtx(opts);
		const id = await resolveFlagRef(ctx, flagRef(flag, opts));
		const f = await getFlag(ctx, id);
		const variants = f.filters?.multivariate?.variants;
		let variantKey = opts.variant;
		if (variants?.length) {
			if (!variantKey) {
				throw new Error(
					`--variant is required for a multivariate flag. Valid: ${variants.map((v) => v.key).join(", ")}.`,
				);
			}
		} else {
			variantKey = variantKey ?? "true";
		}
		if (opts.remove) {
			await applyFlagMutation(ctx, id, {
				mutateFilters: (mf) => removePayload(mf, variantKey),
				summary: `Remove payload for "${variantKey}" (id ${id}).`,
				dryRun: opts.dryRun,
				yes: opts.yes,
			});
			return;
		}
		if (!opts.json && !opts.file) throw new Error("Provide --json or --file (or --remove).");
		const raw = opts.file ? readFileSync(opts.file, "utf-8") : opts.json;
		const value = parseJsonValue(raw);
		await applyFlagMutation(ctx, id, {
			mutateFilters: (mf) => setPayload(mf, variantKey, value),
			summary: `Set payload for "${variantKey}" (id ${id}).`,
			dryRun: opts.dryRun,
			yes: opts.yes,
		});
	});
	addExamples(payload, [
		'posthog-cli-it feature-flags payload my-flag --variant test --json \'{"color":"blue"}\'',
		"posthog-cli-it feature-flags payload my-flag --remove",
	]);
}

// --- escape hatch (set / copy) ------------------------------------------

function registerEscapeHatch(flags: Command) {
	const set = flags
		.command("set")
		.description("Low-level edit: whole filters JSON or scalar dot-paths")
		.argument("[flag]", "Flag key")
		.option("--id <n>", "Flag numeric id")
		.option("--json <json>", "Whole filters object as JSON")
		.option("--file <path>", "Read filters JSON from file ('-' for stdin)")
		.option("--replace", "Required to overwrite the whole filters object")
		.option("--set <path=value>", "Set a scalar at a dot-path (repeatable)", collectValues, [])
		.option("--name <name>", "Set the flag name")
		.option("--tag <tag>", "Set tags (repeatable)", collectValues, []);
	addCommonOptions(addMutationOptions(set)).action(async (flag, opts) => {
		const ctx = buildCtx(opts);
		const id = await resolveFlagRef(ctx, flagRef(flag, opts));

		const topLevel: Record<string, unknown> = {};
		if (opts.name != null) topLevel.name = opts.name;
		if (opts.tag.length) topLevel.tags = opts.tag;

		const wholeFilters = opts.json || opts.file;
		if (wholeFilters && !opts.replace)
			throw new Error("Overwriting the whole filters object requires --replace.");
		let replacement: FlagFilters | undefined;
		if (wholeFilters) {
			const raw =
				opts.file === "-"
					? readFileSync(0, "utf-8")
					: opts.file
						? readFileSync(opts.file, "utf-8")
						: opts.json;
			replacement = parseJsonValue(raw) as FlagFilters;
		}

		const filterSets: Array<{ path: string; value: unknown }> = [];
		for (const entry of opts.set) {
			const eq = entry.indexOf("=");
			if (eq === -1) throw new Error(`Invalid --set "${entry}". Use path=value.`);
			const path = entry.slice(0, eq);
			const value = parseScalar(entry.slice(eq + 1));
			const kind = classifyDotPath(path);
			if (kind === "top-level") {
				setDeep(topLevel, path, value);
			} else {
				const rel = path.slice("filters".length).replace(/^\./, "");
				if (!rel) throw new Error("Use --json/--file to replace the whole filters object.");
				filterSets.push({ path: rel, value });
			}
		}

		const needFilters = !!wholeFilters || filterSets.length > 0;
		if (!needFilters && Object.keys(topLevel).length === 0) {
			throw new Error("Nothing to set. Use --json/--file, --set, --name, or --tag.");
		}
		const mutate = needFilters
			? (current: FlagFilters) => {
					const next = replacement ?? current;
					for (const s of filterSets) setDeep(next, s.path, s.value);
					return next;
				}
			: undefined;
		await applyFlagMutation(ctx, id, {
			mutateFilters: mutate,
			topLevel: Object.keys(topLevel).length ? topLevel : undefined,
			summary: `Apply low-level edits (id ${id}).`,
			dryRun: opts.dryRun,
			yes: opts.yes,
		});
	});
	addExamples(set, [
		"posthog-cli-it feature-flags set my-flag --set 'filters.groups[0].rollout_percentage=50'",
		"posthog-cli-it feature-flags set my-flag --set 'evaluation_runtime=\"all\"'",
		"posthog-cli-it feature-flags get my-flag --filters-only > f.json && posthog-cli-it feature-flags set my-flag --file f.json --replace",
	]);

	const copy = flags
		.command("copy")
		.description("Copy filters from one flag to another (same project)")
		.argument("[src]", "Source flag key")
		.argument("[dest]", "Destination flag key")
		.option("--src-id <n>", "Source flag numeric id")
		.option("--dest-id <n>", "Destination flag numeric id")
		.option("--replace", "Required: overwrites the destination filters");
	addCommonOptions(addMutationOptions(copy)).action(async (src, dest, opts) => {
		if (!opts.replace)
			throw new Error("copy overwrites the destination filters; pass --replace to confirm.");
		const ctx = buildCtx(opts);
		const srcId = await resolveFlagRef(ctx, src != null ? { key: src } : { id: opts.srcId });
		const destId = await resolveFlagRef(ctx, dest != null ? { key: dest } : { id: opts.destId });
		const srcFlag = await getFlag(ctx, srcId);
		if (srcFlag.filters?.aggregation_group_type_index != null) {
			consola.warn(
				"Copying a group-aggregated flag; verify the destination uses the same group type.",
			);
		}
		await applyFlagMutation(ctx, destId, {
			mutateFilters: () => structuredClone(srcFlag.filters),
			summary: `Copy filters from flag ${srcId} to ${destId} (overwrites destination).`,
			dryRun: opts.dryRun,
			yes: opts.yes,
		});
	});
	addExamples(copy, ["posthog-cli-it feature-flags copy staging-flag prod-flag --replace"]);
}

// --- lifecycle (delete/restore) -----------------------------------------

function registerLifecycle(flags: Command) {
	const del = flags
		.command("delete")
		.description("Soft-delete a flag (reversible via restore)")
		.argument("[flag]", "Flag key")
		.option("--id <n>", "Flag numeric id");
	addCommonOptions(addMutationOptions(del)).action(async (flag, opts) => {
		const ctx = buildCtx(opts);
		const id = await resolveFlagRef(ctx, flagRef(flag, opts));
		await warnDependents(ctx, id);
		// PostHog's feature-flag endpoint has no DELETE verb; deletion is a soft-delete PATCH.
		await applyFlagMutation(ctx, id, {
			topLevel: { deleted: true },
			summary: `Soft-delete flag (id ${id}); undo with: feature-flags restore --id ${id}.`,
			dryRun: opts.dryRun,
			yes: opts.yes,
		});
	});
	addExamples(del, [
		"posthog-cli-it feature-flags delete my-flag",
		"posthog-cli-it feature-flags restore --id 42",
	]);

	const restore = flags
		.command("restore")
		.description("Restore a soft-deleted flag")
		.argument("[flag]", "Flag key")
		.option("--id <n>", "Flag numeric id");
	addCommonOptions(addMutationOptions(restore)).action(async (flag, opts) => {
		const ctx = buildCtx(opts);
		let id: number;
		try {
			id = await resolveFlagRef(ctx, flagRef(flag, opts));
		} catch (error) {
			if (opts.id == null) {
				throw new Error(
					"Soft-deleted flags are not listed, so restore by key is unavailable. Pass --id <n>.",
				);
			}
			throw error;
		}
		await applyFlagMutation(ctx, id, {
			topLevel: { deleted: false },
			summary: `Restore flag (id ${id}).`,
			dryRun: opts.dryRun,
			yes: opts.yes,
		});
	});
	addExamples(restore, ["posthog-cli-it feature-flags restore --id 42"]);
}

// --- diagnostics ---------------------------------------------------------

function registerDiagnostics(flags: Command) {
	const history = flags
		.command("history")
		.description("Show a flag's change history")
		.argument("[flag]", "Flag key")
		.option("--id <n>", "Flag numeric id")
		.option("--limit <n>", "Items per page")
		.option("--page <n>", "Page number (1-based)");
	addCommonOptions(history).action(async (flag, opts) => {
		const ctx = buildCtx(opts);
		const id = await resolveFlagRef(ctx, flagRef(flag, opts));
		const params = new URLSearchParams();
		if (opts.limit) params.set("limit", opts.limit);
		if (opts.page) params.set("page", opts.page); // activity endpoint paginates by page, not offset
		const qs = params.toString();
		const result = await ctx.client(
			`/api/projects/${ctx.projectId}/feature_flags/${id}/activity/${qs ? `?${qs}` : ""}`,
		);
		formatOutput(result, ctx.format);
	});
	addExamples(history, ["posthog-cli-it feature-flags history my-flag"]);

	const dependents = flags
		.command("dependents")
		.description("List flags that depend on this flag")
		.argument("[flag]", "Flag key")
		.option("--id <n>", "Flag numeric id");
	addCommonOptions(dependents).action(async (flag, opts) => {
		const ctx = buildCtx(opts);
		const id = await resolveFlagRef(ctx, flagRef(flag, opts));
		const result = await ctx.client(
			`/api/projects/${ctx.projectId}/feature_flags/${id}/dependent_flags/`,
		);
		formatOutput(result, ctx.format);
	});
	addExamples(dependents, ["posthog-cli-it feature-flags dependents my-flag"]);

	const groupTypes = flags.command("group-types").description("List group types and their indices");
	addCommonOptions(groupTypes).action(async (opts) => {
		const ctx = buildCtx(opts);
		formatOutput(await listGroupTypes(ctx), ctx.format);
	});
	addExamples(groupTypes, ["posthog-cli-it feature-flags group-types"]);
}
