# just-cli-it

CLI-ify everything — turn any API/service into a powerful CLI tool.

## Packages

| Package | Description |
|---------|-------------|
| `@jcit/core` | Shared utilities: API client, credential manager, output formatting |
| `@jcit/signoz` | CLI for SigNoz observability platform |

## Development

```bash
# Install dependencies
pnpm install

# Build all packages
pnpm build

# Dev mode (stub linking, no watch needed)
pnpm dev

# Run tests
pnpm test

# Lint & format
pnpm lint:fix
```

## Adding a new CLI tool

1. Create `packages/<name>/` with `package.json`, `build.config.ts`, `tsconfig.json`
2. Add `@jcit/core` as a dependency (`workspace:*`)
3. Use `defineCliApp()` from core to scaffold the CLI entry point
4. Use `createApiClient()` for HTTP calls, `credential` for secure credential management

## Credential Management

Credentials are stored in the **system keychain** (macOS Keychain / Linux secret-service), never as plaintext files.

Resolution priority: **CLI flag > environment variable > system keychain**

```bash
# Interactive login — stores credentials in system keychain
npx @jcit/signoz auth login

# Or pass directly via flags
npx @jcit/signoz alerts --token xxx --url https://signoz.example.com/api/v3

# Or via environment variables
SIGNOZ_TOKEN=xxx npx @jcit/signoz alerts

# Remove stored credentials
npx @jcit/signoz auth logout
```

## Release

```bash
pnpm changeset        # Create a changeset
pnpm version-packages # Bump versions
pnpm release          # Build & publish
```

## License

MIT
