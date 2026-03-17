# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
pnpm install              # Install dependencies
pnpm build                # Build all packages (unbuild, dependency order)
pnpm test -- --run        # Run all tests once
pnpm test -- --run packages/core/src/credential.test.ts  # Single test file
pnpm lint                 # Check lint + format
pnpm lint:fix             # Auto-fix lint + format
```

After writing code, run `codex review --uncommitted` asynchronously (timeout ≥ 300s or background).

## Architecture

pnpm monorepo. `@jcit/core` is shared CLI infrastructure; every CLI package (e.g. `@jcit/signoz`) depends on it via `"@jcit/core": "workspace:*"`.

## Repo-wide conventions

### Adding a new CLI package

1. Create `packages/<name>/` with `package.json`, `build.config.ts`, `tsconfig.json` (extend root)
2. `src/cli.ts`: call `installErrorHandler()` first → `defineCliApp({ docsUrl })` → register commands → `program.parseAsync()` (not `parse()`)
3. `src/client.ts`: service client using `credential.resolve()` for auth
4. `src/commands/*.ts`: each exports a `register*(program: Command)` function

### Command registration

Every command must:
- Accept `--url` and `--token` for auth override, `--format` for output
- Call `addExamples()` with realistic examples
- Use `cmd.error()` for validation errors

### Credential resolution

**CLI flag → env var → system keychain → null**. Auth headers are service-specific (not always Bearer).

### Help text and errors

Every CLI package has a `docsUrl`. Every subcommand has examples. Error messages are actionable — tell the user what to do. `installErrorHandler()` converts raw exceptions to human-friendly output (no stack traces).

## CI/CD

- **CI** (`.github/workflows/ci.yml`): runs on PRs and push to main — lint → build → test. Auto-cancels superseded runs.
- **Release** (`.github/workflows/release.yml`): runs on push to main — changesets/action creates "Version Packages" PR when changesets exist, publishes to npm when merged. Requires `NPM_TOKEN` secret in repo settings.
- Release uses npm provenance (`NPM_CONFIG_PROVENANCE=true`).
- `pnpm version-packages` runs `changeset version` then `pnpm install --no-frozen-lockfile` to sync lockfile.

## Build

unbuild, ESM-only. CLI packages list `src/index` + `src/cli` as entries. `#!/usr/bin/env node` on `src/cli.ts`.

## Style

Biome: tabs, 100-char lines, auto-sorted imports. TypeScript strict + `verbatimModuleSyntax`. Tests colocated as `*.test.ts`.
