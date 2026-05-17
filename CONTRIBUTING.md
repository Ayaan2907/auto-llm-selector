# Contributing to auto-llm-selector

Thanks for helping improve this project. This guide is for anyone **cloning the repo**: code changes, tests, docs, or issue reproductions.

If you only want to **use the published package** in your app, start with the [README](README.md) section **Use in your application**. To **see the router end-to-end** without publishing locally, run `pnpm try` (interactive wizard) or `pnpm try --prompt "..." --preset coding --non-interactive` (scriptable smoke run).

## Prerequisites

- **Node.js** 16 or newer (see `engines` in `package.json`).
- **pnpm** — this repo pins a version in `packageManager`. Install from [pnpm.io](https://pnpm.io/installation).
- An **OpenRouter API key** for flows that call OpenRouter or load embeddings (e.g. `pnpm try`, integration-style checks).

npm works for consuming the package from npm; **development in this repo expects pnpm** for a reproducible lockfile.

## First-time setup

```bash
git clone https://github.com/Ayaan2907/auto-llm-selector.git
cd auto-llm-selector
pnpm install
```

### Native TensorFlow addon (`@tensorflow/tfjs-node`)

Semantic features depend on `@tensorflow/tfjs-node`. If `pnpm install` skipped optional build scripts, you may see errors about `tfjs_binding.node` when you run tests or `pnpm try`.

- Try allowing installs with scripts (e.g. `pnpm approve-builds` when prompted), or follow the [Troubleshooting](README.md#troubleshooting) section in the README.
- On some platforms you may need a rebuild or a Node version that matches a published prebuild for `tfjs-node`.

## Commands

| Command                                     | Purpose                                                                                                                                   |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm run test:install`                     | Fresh `pnpm install`, then build, tests, typecheck, and lint (good after cloning or before a merge).                                      |
| `pnpm run verify`                           | Same checks when dependencies are already installed.                                                                                      |
| `pnpm test`                                 | Runs `pretest` (build) then unit tests under `test/`.                                                                                     |
| `pnpm run build`                            | Builds `dist/` via tsup.                                                                                                                  |
| `pnpm run typecheck`                        | TypeScript `--noEmit`.                                                                                                                    |
| `pnpm run lint` / `pnpm run lint:fix`       | ESLint on `src/`.                                                                                                                         |
| `pnpm run format` / `pnpm run format:check` | Prettier.                                                                                                                                 |
| `pnpm run dev`                              | Watch mode for the library build.                                                                                                         |
| `pnpm run try`                              | Interactive CLI against working-tree `src/` (no build). Add `--non-interactive --prompt "..." --preset coding` for scriptable smoke runs. |

npm equivalents for consumers: `npm install`, `npm run build`, etc., match the script names in `package.json` when you are not using pnpm workspaces.

## Where to change things

| Area                              | Typical paths                                         |
| --------------------------------- | ----------------------------------------------------- |
| Routing and selection             | `src/router.ts`                                       |
| Prompt classification             | `src/classifier.ts`, `src/lib/semantic-classifier.ts` |
| Model scoring and profiles        | `src/lib/model-profiler.ts`                           |
| Hard filters and property mapping | `src/routing/`                                        |
| OpenRouter catalog and caches     | `src/cache.ts`, `src/http/`                           |
| Analytics                         | `src/analytics/`                                      |
| Input validation                  | `src/validation/`                                     |
| CLI                               | `src/cli/`                                            |
| Unit tests                        | `test/`                                               |
| Public API docs                   | `docs/api-reference.md`, `docs/how-it-works.md`       |

## Pull requests

- Keep diffs **focused** on one concern when possible.
- Add or update **tests** when behavior of routing, filters, or public contracts changes.
- Update **README / docs** when user-visible defaults, config fields, or semantics change.
- **Never commit** API keys, tokens, or `.env` files with secrets.

## Links

- [README — use in your app & demo](README.md)
- [API reference](docs/api-reference.md)
- [How it works (design)](docs/how-it-works.md)
