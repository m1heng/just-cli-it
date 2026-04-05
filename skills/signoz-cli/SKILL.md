---
name: signoz-cli
description: Query traces, logs, and metrics from SigNoz using the signoz CLI. Use when debugging observability data, checking alert rules, listing services, or running PromQL/ClickHouse SQL queries against a SigNoz instance.
license: MIT
compatibility: Requires Node.js >= 22, macOS or Linux (uses system keychain for credential storage). Install via npm — `npm i -g @jcit/signoz`.
metadata:
  author: m1heng
  version: "0.1.0"
  repository: https://github.com/m1heng/just-cli-it
---

# signoz CLI

Query traces, logs, and metrics from [SigNoz](https://signoz.io) directly in your terminal.

## Install

```bash
npm i -g @jcit/signoz
```

## Authentication

Credentials are resolved in this order: **CLI flag → environment variable → system keychain → default**.

### Option 1: System keychain (recommended)

```bash
signoz auth login
# Interactive prompts for URL and token

signoz auth login --url https://signoz.example.com --token sk-xxx
# Non-interactive
```

Credentials are stored securely in macOS Keychain (`security`) or Linux libsecret (`secret-tool`).

### Option 2: Environment variables

```bash
export SIGNOZ_URL=https://signoz.example.com
export SIGNOZ_TOKEN=sk-xxx
```

### Option 3: Per-command flags

Every command accepts `--url` and `--token` to override credentials for that invocation.

```bash
signoz query --url https://signoz.example.com --token sk-xxx --promql 'up'
```

### Logout

```bash
signoz auth logout
```

## Commands

### query — Unified query API

Query traces, logs, and metrics. Supports three input modes (mutually exclusive):

| Flag | Description |
|------|-------------|
| `--promql <expr>` | PromQL expression |
| `--sql <query>` | ClickHouse SQL query (use `{{start_ms}}` etc. for time injection — see below) |
| `-f, --file <path>` | Load full query_range JSON body from file |

Time range, output, and auth options:

| Flag | Default | Description |
|------|---------|-------------|
| `--since <time>` | `1h` | Start time — duration ago (`1h`, `30m`, `7d`) or ISO date |
| `--until <time>` | `now` | End time — `now`, duration ago, or ISO date |
| `--step <seconds>` | `60` | Step interval in seconds (PromQL only, must be a positive number) |
| `--format <format>` | `json` | Output: `json`, `table`, or `text` |

> `--url` and `--token` flags are available on all commands for per-invocation auth override.

> **Duration = "ago"**: `--since 1h` means "1 hour ago". `--until 1d` means "1 day ago" (not "for 1 day"). So `--since 7d --until 1d` queries from 7 days ago to 1 day ago.

> **SQL time injection**: Use `{{start_ms}}`/`{{end_ms}}` (milliseconds), `{{start_ns}}`/`{{end_ns}}` (nanoseconds), or `{{start_s}}`/`{{end_s}}` (seconds) in your SQL. These are replaced with the values from `--since`/`--until` before the query is sent.

#### PromQL limitations

> **Delta-temporality metrics are not queryable via PromQL.** SigNoz's PromQL engine only supports Cumulative and Gauge metrics. Many SigNoz internal metrics (e.g. `signoz_calls_total`, `signoz_latency.*`) use Delta temporality and will return empty results. Use `--sql` for Delta metrics instead.

> **OTel dot-separated metric names** (e.g. `http.client.request.duration.bucket`) are not valid PromQL identifiers. Use the `{__name__="..."}` selector syntax instead of bare metric names.

To check a metric's temporality, use the `metrics` command (see below) or:

```bash
signoz metrics                          # List all metrics with temporality
signoz metrics | jq '.[] | select(.promql == "no")'  # Show Delta-only metrics
```

#### PromQL examples

```bash
# OTel metric with dot-separated name (Cumulative — works)
signoz query --promql '{__name__="http.client.request.duration.bucket"}' --since 1h

# Prometheus-style metric (if Cumulative)
signoz query --promql 'rate(http_requests_total[5m])' --since 1h

# Table output for quick scan
signoz query --promql '{__name__="db.client.connections.usage"}' --format table

# From a specific start date to now
signoz query --promql 'process_cpu_seconds_total' --since 2024-01-15T00:00:00Z
```

#### ClickHouse SQL examples

```bash
# Count logs from the last 24 hours — {{start_ns}}/{{end_ns}} injected from --since
signoz query --since 24h --sql "
  SELECT toStartOfInterval(fromUnixTimestamp64Nano(timestamp), INTERVAL 1 HOUR) AS ts,
         count(*) AS value
  FROM signoz_logs.distributed_logs_v2
  WHERE timestamp >= {{start_ns}} AND timestamp <= {{end_ns}}
    AND ts_bucket_start >= {{start_s}} - 1800 AND ts_bucket_start <= {{end_s}}
  GROUP BY ts ORDER BY ts
"

# Metric samples over the last hour
signoz query --since 1h --sql "
  SELECT toStartOfInterval(toDateTime(intDiv(unix_milli, 1000)), INTERVAL 1 MINUTE) AS ts,
         avg(value) AS value
  FROM signoz_metrics.distributed_samples_v4
  WHERE metric_name = 'signoz_calls_total'
    AND unix_milli >= {{start_ms}} AND unix_milli < {{end_ms}}
  GROUP BY ts ORDER BY ts
"

# Load a saved query from file with custom time range
signoz query -f my-query.json --since 7d --until 1d
```

#### File format for `-f`

The JSON file should follow the SigNoz v5 `query_range` body format. The `start` and `end` fields are overridden by `--since`/`--until`:

```json
{
  "schemaVersion": "v1",
  "requestType": "time_series",
  "compositeQuery": {
    "queries": [
      {
        "type": "promql",
        "spec": { "name": "A", "query": "rate(http_requests_total[5m])", "step": 60, "disabled": false, "stats": false }
      }
    ]
  }
}
```

### metrics — Discover available metrics

List all metrics with their temporality, type, and PromQL compatibility:

```bash
signoz metrics                          # JSON list of all metrics
signoz metrics --format table           # Quick scan as table
```

Output fields: `name`, `temporality` (Cumulative/Delta/Unspecified), `type` (Sum/Gauge/Histogram), `unit`, `promql` (yes/no).

Use this to determine which metrics can be queried via PromQL (Cumulative/Gauge only) and the exact metric name format.

### alerts — List alert rules

```bash
signoz alerts                  # JSON output (default)
signoz alerts --format table   # Table output
```

### services — List services

```bash
signoz services                # JSON output (default)
signoz services --format table # Table output
```

## API Endpoints

The CLI talks to these SigNoz API endpoints:

| Command | Method | Endpoint |
|---------|--------|----------|
| `query` | POST | `/api/v5/query_range` |
| `metrics` | POST | `/api/v5/query_range` (SQL against `distributed_metadata`) |
| `alerts` | GET | `/api/v1/rules` |
| `services` | GET | `/api/v1/services/list` |

Default base URL: `http://localhost:3301` (SigNoz local dev).

## Auth Header

SigNoz uses a custom auth header `SIGNOZ-API-KEY` (not `Authorization: Bearer`). This is handled automatically by the CLI.

## Duration Format

Relative durations for `--since` and `--until` always mean **"X ago from now"**:

| Unit | Example | Meaning |
|------|---------|---------|
| `s` | `30s` | 30 seconds ago |
| `m` | `15m` | 15 minutes ago |
| `h` | `2h` | 2 hours ago |
| `d` | `7d` | 7 days ago |

ISO 8601 dates are also accepted: `2024-01-15T00:00:00Z`.

## ClickHouse SQL Reference for SigNoz

This section documents SigNoz-specific ClickHouse SQL conventions that differ from standard SQL. **You must follow these conventions when using `--sql`.**

### Tables and Timestamp Formats

Each signal type uses different tables and timestamp formats:

| Signal | Database.Table | Timestamp Column | Format | Filter Example |
|--------|---------------|-----------------|--------|----------------|
| **Logs** | `signoz_logs.distributed_logs_v2` | `timestamp` | UInt64 **nanoseconds** | `timestamp >= 1711234567000000000` |
| **Traces** | `signoz_traces.distributed_signoz_index_v3` | `timestamp` | DateTime64(9), **must quote** | `timestamp >= '1711234567000000000'` |
| **Metrics** | `signoz_metrics.distributed_samples_v4` | `unix_milli` | Int64 **milliseconds** | `unix_milli >= 1711234567000` |

> Always use `distributed_*` tables (not local tables like `logs_v2` or `signoz_index_v3`).

### Required: `ts_bucket_start` Filter (Logs & Traces)

Logs and Traces tables have `ts_bucket_start` (UInt64, epoch **seconds**) in their primary key. **Always include it** for query performance — without it, queries may be extremely slow or time out.

```sql
WHERE timestamp >= {startNano} AND timestamp <= {endNano}
  AND ts_bucket_start >= {startSeconds - 1800} AND ts_bucket_start <= {endSeconds}
```

The `-1800` (30 min) buffer on `ts_bucket_start` ensures edge-case rows aren't missed.

### Result Column Naming Convention

SigNoz expects specific column names in ClickHouse SQL results:

| Column | Requirement |
|--------|-------------|
| Time | Must be named **`ts`**, type DateTime/DateTime64 |
| Value | Named `value`, `__result`, `__value`, `result`, or `res` (auto-detected if only one numeric column) |
| Labels | All String columns become series labels (used for groupBy) |

### Complete Query Templates

#### Logs — Count by severity (last 1 hour)

```bash
signoz query --since 1h --sql "
  SELECT toStartOfInterval(fromUnixTimestamp64Nano(timestamp), INTERVAL 1 MINUTE) AS ts,
         severity_text,
         count(*) AS value
  FROM signoz_logs.distributed_logs_v2
  WHERE timestamp >= {{start_ns}} AND timestamp <= {{end_ns}}
    AND ts_bucket_start >= {{start_s}} - 1800 AND ts_bucket_start <= {{end_s}}
  GROUP BY ts, severity_text
  ORDER BY ts
"
```

Key log columns: `severity_text` (INFO/ERROR/...), `severity_number`, `body` (message), `trace_id`, `span_id`, `scope_name`.

#### Traces — P99 latency by service (last 1 hour)

```bash
signoz query --since 1h --sql "
  SELECT toStartOfInterval(timestamp, INTERVAL 1 MINUTE) AS ts,
         resource_string_service\$\$name AS service,
         quantile(0.99)(duration_nano) / 1e6 AS value
  FROM signoz_traces.distributed_signoz_index_v3
  WHERE timestamp >= '{{start_ns}}' AND timestamp <= '{{end_ns}}'
    AND ts_bucket_start >= {{start_s}} - 1800 AND ts_bucket_start <= {{end_s}}
  GROUP BY ts, service
  ORDER BY ts
"
```

Key trace columns: `name` (span name), `kind_string`, `duration_nano` (Float64, nanoseconds), `status_code` (0=unset, 1=ok, 2=error), `has_error` (Bool), `resource_string_service$$name` (service name — note `$$` encodes `.`).

#### Metrics — Average metric value (last 1 hour)

```bash
signoz query --since 1h --sql "
  SELECT toStartOfInterval(toDateTime(intDiv(unix_milli, 1000)), INTERVAL 1 MINUTE) AS ts,
         avg(value) AS value
  FROM signoz_metrics.distributed_samples_v4
  WHERE metric_name = 'http_requests_total'
    AND unix_milli >= {{start_ms}} AND unix_milli < {{end_ms}}
  GROUP BY ts
  ORDER BY ts
"
```

### Attribute Access (Map Columns)

Non-materialized attributes are stored in Map columns, not regular columns:

```sql
-- String attributes
attributes_string['http.method']
resources_string['service.name']
scope_string['otel.library.name']

-- Numeric / Boolean attributes
attributes_number['http.status_code']
attributes_bool['error']

-- Check existence
mapContains(attributes_string, 'http.method')
```

> **`$$` encoding**: Materialized columns encode `.` as `$$`. For example, `service.name` → `resource_string_service$$name`. Use materialized columns when available for better performance.

### Additional Tables

| Database | Table | Purpose |
|----------|-------|---------|
| `signoz_logs` | `distributed_logs_v2_resource` | Log resource attributes (join via `resource_fingerprint`) |
| `signoz_traces` | `distributed_traces_v3_resource` | Trace resource attributes |
| `signoz_traces` | `distributed_top_level_operations` | Top-level operation lookup |
| `signoz_metrics` | `distributed_metadata` | Metric metadata (name, temporality, type, unit) |
| `signoz_metrics` | `distributed_time_series_v4` | Metric time series metadata (fingerprints, labels) |
| `signoz_metrics` | `distributed_samples_v4_agg_5m` | 5-minute pre-aggregated metrics |
| `signoz_metrics` | `distributed_samples_v4_agg_30m` | 30-minute pre-aggregated metrics |

Use `GLOBAL IN` (not `IN`) when joining with resource tables in distributed queries.

## Troubleshooting

| Error | Fix |
|-------|-----|
| "No API token configured" | Run `signoz auth login` or set `SIGNOZ_TOKEN` |
| Connection refused | Check that SigNoz is running at the configured URL |
| 401 Unauthorized | Verify your API token is valid |
| Query timeout | Add `ts_bucket_start` filter to your SQL WHERE clause |
| Empty results with `--sql` | Use `{{start_ms}}`/`{{end_ms}}` etc. in your SQL WHERE clause — see time injection docs above |
| PromQL returns empty / `series: null` | Metric may use Delta temporality (not supported by PromQL engine) — use `--sql` instead. Or metric uses OTel dot-separated name — use `{__name__="metric.name"}` syntax |
| invalid --step value | `--step` must be a positive number in seconds (e.g., `60`, not `1m`) |
