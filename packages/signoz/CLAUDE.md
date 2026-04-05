# @jcit/signoz

CLI for the SigNoz observability platform. Reference implementation for new `@jcit/*` packages.

## Auth

SigNoz uses `SIGNOZ-API-KEY` header (not Bearer). Env vars: `SIGNOZ_URL`, `SIGNOZ_TOKEN`.

```bash
signoz auth login                          # Interactive, stores in keychain
signoz query --promql 'up' --token xxx     # Flag override
SIGNOZ_TOKEN=xxx signoz alerts             # Env var override
```

## API

Base URL defaults to `http://localhost:3301` (no version prefix — different endpoints use different API versions).

Key endpoints:
- `POST /api/v3/query_range` — unified query (PromQL, ClickHouse SQL, builder). Timestamps in epoch **nanoseconds**. Request body uses `compositeQuery` with `queryType` ("promql" | "clickhouse" | "builder"), `panelType`, and query maps (`promQueries`, `chQueries`, `builderQueries`).
- `GET /api/v1/rules` — alert rules
- `GET /api/v1/services/list` — services

ClickHouse SQL notes: `--since`/`--until` do NOT inject time filters into raw SQL. Tables: `signoz_logs.distributed_logs_v2` (timestamp in nanoseconds), `signoz_traces.distributed_signoz_index_v3` (DateTime64(9), quote values), `signoz_metrics.distributed_samples_v4` (unix_milli). Always include `ts_bucket_start` filter for logs/traces.

## Commands

| Command | Status |
|---------|--------|
| `auth login/logout` | Done |
| `query` (--promql / --sql / -f) | Done |
| `alerts` (list) | Scaffold |
| `services` (list) | Scaffold |

## Adding a new command

1. Create `src/commands/<name>.ts` exporting `register<Name>(program: Command)`
2. Use `createSignozClient({ url: opts.url, token: opts.token })` for API calls
3. Call `addExamples()` on the command
4. Register in `src/cli.ts`
