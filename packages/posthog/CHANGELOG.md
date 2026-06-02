# @jcit/posthog

## 0.2.0

### Minor Changes

- e573cc8: Add a comprehensive `feature-flags` command group. Beyond the previous list/get/toggle/create, the CLI can now
  manage targeting end to end: `rollout`, `target` (person/group/cohort/flag conditions, per-org targeting via
  `--group-type`), `variants`, `payload`, `enable`/`disable`, soft `delete`/`restore`, `copy`, a
  low-level `set` escape hatch (whole-filters JSON or scalar dot-paths), and `conditions`/`history`/`dependents`/
  `group-types` diagnostics.

  All mutations go through a single read-modify-write writer (PostHog replaces `filters` wholesale, so partial
  edits would clobber targeting), validate locally before any network call, and share `--dry-run`/`--yes` with
  TTY-gated, fail-closed confirmation. Flags are addressed by key (numeric ids via `--id`); the deprecated
  `toggle` now validates `--active` strictly and delegates to `enable`/`disable`.

## 0.1.1

### Patch Changes

- Updated dependencies [65bc814]
  - @jcit/core@0.1.1
