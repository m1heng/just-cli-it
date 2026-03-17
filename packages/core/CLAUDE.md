# @jcit/core

Shared CLI infrastructure. All `@jcit/*` CLI packages depend on this.

## Exports

| Export | Purpose |
|--------|---------|
| `defineCliApp()` | Create Commander program with version, docsUrl, sorted subcommands |
| `addExamples()` | Append usage examples to any command's help text |
| `installErrorHandler()` | Global uncaught/unhandled error → human-friendly message |
| `credential` | `.resolve()` / `.store()` / `.delete()` — system keychain (macOS `security`, Linux `secret-tool`) |
| `createApiClient()` | Pre-configured `ofetch` wrapper with baseURL + header merging |
| `formatOutput()` | Print data as `json` / `table` / `text` |

## Adding a new utility

Add `src/<name>.ts`, export from `src/index.ts`. Keep zero-config — consumers should not need to configure core utils beyond function arguments.

## Credential backend

macOS: `security` CLI (Keychain). Linux: `secret-tool` (libsecret). Namespace: `jcit:<service>:<key>`. If `secret-tool` is missing on Linux, `store()` throws with an install hint.

## Error handler details

`installErrorHandler()` registers `uncaughtException` + `unhandledRejection` listeners. It walks the error cause chain (max depth 5) to find error codes. Known mappings: ECONNREFUSED → connection hint, ENOTFOUND → host hint, ENOENT → file path, EACCES → permission.
