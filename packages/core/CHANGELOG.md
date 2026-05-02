# @jcit/core

## 0.1.1

### Patch Changes

- 65bc814: Improve table/text output for nested values and flatten SigNoz v5 query results for time-series, scalar, and raw log responses.

## 0.1.0

### Minor Changes

- d3da773: Initial release

  - `@jcit/core`: Shared CLI infrastructure — API client, credential manager (system keychain), error handler, output formatter, CLI app builder
  - `@jcit/signoz`: CLI for SigNoz observability platform — auth, query (PromQL/SQL/file), alerts, services commands
