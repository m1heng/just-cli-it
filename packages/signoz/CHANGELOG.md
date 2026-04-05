# @jcit/signoz

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
