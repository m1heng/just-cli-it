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
| `--sql <query>` | ClickHouse SQL query |
| `-f, --file <path>` | Load full query_range JSON body from file |

Time range and output options:

| Flag | Default | Description |
|------|---------|-------------|
| `--since <duration>` | `1h` | Start time — relative duration (`1h`, `30m`, `7d`) or ISO date |
| `--until <time>` | `now` | End time — `now`, relative duration, or ISO date |
| `--step <seconds>` | `60` | Step interval for PromQL time series |
| `--format <format>` | `json` | Output: `json`, `table`, or `text` |

#### Examples

```bash
# PromQL: request rate over the last hour
signoz query --promql 'rate(http_requests_total[5m])' --since 1h

# ClickHouse SQL: count logs from the last 24 hours
signoz query --sql 'SELECT count() FROM signoz_logs.distributed_logs' --since 24h

# Load a saved query from file with custom time range
signoz query -f my-query.json --since 7d --until 1d

# Table output for quick scan
signoz query --promql 'up' --format table

# Query from a specific start date to now
signoz query --promql 'process_cpu_seconds_total' --since 2024-01-15T00:00:00Z
```

#### File format for `-f`

The JSON file should follow the SigNoz v5 `query_range` body format. The `start` and `end` fields are overridden by `--since`/`--until`:

```json
{
  "compositeQuery": {
    "queries": [
      {
        "type": "promql",
        "spec": { "name": "A", "query": "rate(http_requests_total[5m])", "step": 60 }
      }
    ]
  }
}
```

### alerts — List alert rules

```bash
signoz alerts                  # Human-readable text output
signoz alerts --format json    # Machine-readable JSON
```

### services — List services

```bash
signoz services                # Human-readable text output
signoz services --format json  # Machine-readable JSON
```

## API Endpoints

The CLI talks to these SigNoz API endpoints:

| Command | Method | Endpoint |
|---------|--------|----------|
| `query` | POST | `/api/v5/query_range` |
| `alerts` | GET | `/api/v1/rules` |
| `services` | GET | `/api/v1/services/list` |

Default base URL: `http://localhost:3301` (SigNoz local dev).

## Auth Header

SigNoz uses a custom auth header `SIGNOZ-API-KEY` (not `Authorization: Bearer`). This is handled automatically by the CLI.

## Duration Format

Relative durations for `--since` and `--until`:

| Unit | Example | Meaning |
|------|---------|---------|
| `s` | `30s` | 30 seconds ago |
| `m` | `15m` | 15 minutes ago |
| `h` | `2h` | 2 hours ago |
| `d` | `7d` | 7 days ago |

ISO 8601 dates are also accepted: `2024-01-15T00:00:00Z`.

## Troubleshooting

| Error | Fix |
|-------|-----|
| "No API token configured" | Run `signoz auth login` or set `SIGNOZ_TOKEN` |
| Connection refused | Check that SigNoz is running at the configured URL |
| 401 Unauthorized | Verify your API token is valid |
