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
- `POST /api/v5/query_range` — unified query (PromQL, ClickHouse SQL, builder)
- `GET /api/v1/rules` — alert rules
- `GET /api/v1/services/list` — services

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
