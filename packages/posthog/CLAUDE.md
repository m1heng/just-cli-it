# @jcit/posthog

CLI for PostHog product analytics + feature flags.

## Auth

PostHog uses a Bearer personal API key. Env vars: `POSTHOG_URL`, `POSTHOG_API_KEY`, `POSTHOG_PROJECT_ID`.

```bash
posthog-cli-it auth login                                   # interactive, stores in keychain
posthog-cli-it feature-flags list --token phx_xxx --project-id 123
POSTHOG_API_KEY=phx_xxx posthog-cli-it ff list
```

Base URL defaults to `https://us.posthog.com` (private endpoints). EU is `https://eu.posthog.com`.
Required PA-key scopes: `feature_flag:read` / `feature_flag:write`, `query:read`, `person:read`,
`insight:read`, `annotation:read` / `annotation:write`.

## API notes

- `feature_flags` live under `/api/projects/{id}/` (NOT `/api/environments/`). The CLI operates on the
  project's default environment; multi-environment targeting is out of scope. A single `flagPath()` helper
  isolates the path so a future `/api/environments/` migration is one line.
- **PATCH replaces `filters` wholesale** (top-level fields shallow-merge; `filters` does not deep-merge).
  This is the single most important fact: any edit to `filters` MUST read-modify-write the whole object.
- `persons` / `insights` are documented under `/api/environments/{id}/` now; the project paths still work.
- The `events list` endpoint is officially deprecated (kept for back-compat); prefer `query` for ad-hoc.

## feature-flags architecture

The command group is built on ONE safe write path so a flag can never be silently corrupted:

| Module | Role |
|--------|------|
| `feature-flags/filters.ts` | Pure, I/O-free `filters` model + transforms (the targeting SSOT). Unit-tested with no HTTP. |
| `feature-flags/validation.ts` | `validateFilters` / `validateTopLevel` — run before any network call. |
| `feature-flags/core.ts` | The privileged layer: `applyFlagMutation` (the ONLY mutating writer), `resolveFlagRef`, `resolveGroupTypeIndex`, `createFlag`. |
| `commands/feature-flags.ts` | Thin commander adapters: parse opts → build a `mutateFilters` closure / `topLevel` object → call core. |

Key invariants:

- **Read-modify-write.** `applyFlagMutation` GETs the flag, runs the transform on a `structuredClone` of the
  COMPLETE filters, validates, then PATCHes the WHOLE filters back. Body assembly is explicit:
  `{ ...topLevel, ...(mutateFilters ? { filters } : {}) }`. `enable`/`disable`/`delete`/`restore` pass ONLY
  `topLevel` (e.g. `{active:true}`) and never a filters key, so targeting is structurally untouched.
- **Key-first addressing.** The positional `<flag>` is ALWAYS a key (keys can be numeric). Numeric ids use
  the explicit `--id`. `resolveFlagRef` paginates the full list and exact-matches `f.key` (no fuzzy search).
- **Never hardcode the group index.** `resolveGroupTypeIndex` resolves `aggregation_group_type_index` from
  `GET groups_types/` at runtime (cached per process). Person/group/cohort aggregation is mutually exclusive
  and enforced by `validateFilters` before sending.

## Mutation / confirmation convention (repo-novel)

Every mutating command is composed as `addCommonOptions(addMutationOptions(cmd))` (fixed order, so help blocks
never drift) which adds `--dry-run` and `--yes`.

- **`--dry-run`** runs the full read-modify-write up to but not including the PATCH, then writes the before/after
  filters diff to **stderr** (never suppressed by `--format`) and the literal `{method,url,body}` to **stdout**
  honoring `--format`. No mutation occurs.
- **Confirmation** gates on `process.stdin.isTTY` (input, not stdout, so piping to `jq` never hangs). On a TTY
  without `--yes` it prompts; declining aborts.
- **Fail-closed:** in a non-TTY context without `--yes` a mutating command ERRORS and exits non-zero — it never
  silently proceeds. `--yes` (or the `CI` / `POSTHOG_YES` env vars) is the sole non-interactive authorization.
- Validation errors are thrown from the pure modules and rendered cleanly by `installErrorHandler` (no stack).
- `validateFilters` runs on the WHOLE cloned filters; it tolerates pre-existing shapes (e.g. a property with
  an omitted operator, which PostHog treats as the default `exact`) so editing one field never rejects a
  legacy/cohort flag's unrelated conditions.

## Commands

| Command | Notes |
|---------|-------|
| `list` / `get` / `conditions` | Read-only. `get --filters-only` / `--explain`; `--all` auto-paginates. |
| `create` | Builds filters via the same `build*` helpers as the verbs (no hardcoded 0%). |
| `enable` / `disable` / `toggle` | `active` flip only. `toggle` is deprecated (delegates to enable/disable). |
| `rollout <flag> <percent>` | Set rollout % on a selected condition (`--condition`, `--enable`). |
| `target` | Add/replace/clear a release condition; `--group-type` for per-org targeting. |
| `variants` / `payload` | Multivariate variants and per-variant/boolean payloads. |
| `set` / `copy` | Escape hatch: whole-filters JSON (`--replace`) or scalar `--set` dot-paths; clone filters. |
| `delete` / `restore` | Soft-delete via `PATCH {deleted:true}` (reversible). PostHog has no hard-DELETE verb. |
| `history` / `dependents` / `group-types` | Diagnostics. |

## Honest limits (documented, not papered over)

- `super_groups` is legacy-stripped on read, so a `get --filters-only | set --file` round-trip cannot recover
  it. `holdout` lives inside `filters` and IS round-trippable.
- `set --json/--file` targets the **filters** object only. Structured top-level fields (`rollback_conditions`,
  `evaluation_contexts`) are reachable only via scalar `--set` on existing leaves.
- Optimistic concurrency (`version` / `If-Match`) is NOT enforced — the GET→PATCH window is last-writer-wins.
- `evaluation_contexts` 50-item cap is server-enforced (not validated locally).

## Adding a command

Follow the repo convention: `register<Name>(program)`, `addCommonOptions(cmd)` (+ `addMutationOptions` for
mutating commands), `createPostHogClient({ url, token })`, `addExamples()`, register in `src/cli.ts`.
