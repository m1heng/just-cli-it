# @jcit/signoz

## 0.2.1

### Patch Changes

- Fix --format table rendering [Object] for nested query results

  Flatten v5 query_range series into one row per data point with label columns + ts + value, so table output is human-readable.

## 0.2.0

### Minor Changes

- Add SQL time variable injection, metrics discovery command, and DRY common options

  - SQL queries now support `{{start_ms}}`, `{{end_ms}}`, `{{start_ns}}`, `{{end_ns}}`, `{{start_s}}`, `{{end_s}}` template variables, replaced from `--since`/`--until` before sending
  - New `signoz metrics` command lists available metrics with temporality, type, and PromQL compatibility
  - Extract `--format`/`--url`/`--token` into shared `addCommonOptions()` helper; unify `--format` default to `json`; hide `--url`/`--token` from help
  - Fix PromQL payload: add `schemaVersion: "v1"` and `stats: false` to match SigNoz frontend format
  - Warn when PromQL returns empty results (Delta temporality not supported)
  - Inject `schemaVersion` into file-mode queries when missing

## 0.1.3

### Patch Changes

- 5a703b0: Switch query command back to v5 API with correct payload format (requestType, compositeQuery.queries envelopes, millisecond timestamps)

## 0.1.2

### Patch Changes

- 8f38687: Fix query command: switch to v3 API with correct compositeQuery format and nanosecond timestamps

## 0.1.1

### Patch Changes

- cd40176: Fix misleading --since/--until flag semantics, add --step validation for PromQL, read version from package.json, add requestType to v5 request body, and rewrite SKILL.md with comprehensive ClickHouse SQL reference

## 0.1.0

### Minor Changes

- d3da773: Initial release

  - `@jcit/core`: Shared CLI infrastructure — API client, credential manager (system keychain), error handler, output formatter, CLI app builder
  - `@jcit/signoz`: CLI for SigNoz observability platform — auth, query (PromQL/SQL/file), alerts, services commands

### Patch Changes

- Updated dependencies [d3da773]
  - @jcit/core@0.1.0
