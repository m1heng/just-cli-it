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
- `POST /api/v5/query_range` — unified query (PromQL, ClickHouse SQL, builder). Timestamps in epoch **milliseconds**. Request body uses `schemaVersion: "v1"` + `requestType` + `compositeQuery.queries` array of `{type, spec}` envelopes. Server rejects unknown fields.
- `GET /api/v1/rules` — alert rules
- `GET /api/v1/services/list` — services

PromQL limitations: **Delta-temporality metrics return empty results** — the PromQL engine only supports Cumulative and Gauge. SigNoz internal metrics (`signoz_calls_total`, `signoz_latency.*`) are Delta. OTel dot-separated names require `{__name__="..."}` syntax. Check temporality via `distributed_metadata` table.

ClickHouse SQL notes: `--sql` supports time variable injection — `{{start_ms}}`/`{{end_ms}}` (ms), `{{start_ns}}`/`{{end_ns}}` (ns), `{{start_s}}`/`{{end_s}}` (s) are replaced from `--since`/`--until` before sending. Use `--request-type raw --format table` for raw log rows; default SQL request type remains `time_series`. Tables: `signoz_logs.distributed_logs_v2` (timestamp in nanoseconds), `signoz_traces.distributed_signoz_index_v3` (DateTime64(9), quote values), `signoz_metrics.distributed_samples_v4` (unix_milli). Always include `ts_bucket_start` filter for logs/traces.

## Commands

| Command | Status |
|---------|--------|
| `auth login/logout` | Done |
| `query` (--promql / --sql / -f) | Done |
| `metrics` (list with temporality) | Done |
| `alerts` (list) | Scaffold |
| `services` (list) | Scaffold |

## Common options

`--format`, `--url`, `--token` are defined once in `src/options.ts` via `addCommonOptions(cmd)`. All commands share this — don't add these options manually.

## Adding a new command

1. Create `src/commands/<name>.ts` exporting `register<Name>(program: Command)`
2. Call `addCommonOptions(cmd)` for `--format`/`--url`/`--token`
3. Use `createSignozClient({ url: opts.url, token: opts.token })` for API calls
4. Call `addExamples()` on the command
5. Register in `src/cli.ts`
