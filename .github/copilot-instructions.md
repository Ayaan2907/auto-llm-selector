# Auto LLM Selector

Auto LLM Selector is a TypeScript Node.js library that intelligently routes prompts to the optimal Large Language Model (LLM) based on task classification and performance requirements. It uses machine learning to analyze prompts and recommend the best model from 80+ available options through OpenRouter API.

Always reference these instructions first and fallback to search or bash commands only when you encounter unexpected information that does not match the info here.

## Working Effectively

### Bootstrap and Build

- **Install pnpm globally**: `npm install -g pnpm@10.12.1` (required package manager)
- **Install dependencies**: `pnpm install --no-frozen-lockfile` -- takes 20-25 seconds. If you get lockfile errors, always use `--no-frozen-lockfile`.
- **Build the project**: `pnpm build` -- takes 3 seconds. NEVER CANCEL.
- **Run type checking**: `pnpm typecheck` -- takes 2 seconds.
- **Run linting**: `pnpm lint` -- takes 2 seconds.
- **Format code**: `pnpm format` -- takes 1 second.
- **Check formatting**: `pnpm format:check` -- takes 1 second.

### TensorFlow Dependencies (CRITICAL)

**WARNING**: TensorFlow.js native addon (`@tensorflow/tfjs-node`) fails to build in sandboxed environments due to network restrictions downloading libtensorflow binaries. This is a known limitation.

- **TensorFlow rebuild command**: `npm rebuild @tensorflow/tfjs-node --build-addon-from-source` -- FAILS in sandboxed environments due to firewall limitations downloading from storage.googleapis.com.
- **Alternative**: The library will still work for model profiling and selection logic without TensorFlow, but semantic classification will be limited to keyword-based classification only.
- **For development**: Use `pnpm install` normally. If TensorFlow fails to build, document this limitation.

### Testing

- **Run tests**: `pnpm test` -- Currently no test files exist, so this command will fail with "Could not find test files".
- **Test configuration**: Uses Node.js built-in test runner with tsx for TypeScript support.
- **Sample application**: `npx tsx sample.ts` -- requires OpenRouter API key. Will fail without TensorFlow in sandboxed environments.

### Development Workflow

- **Development mode**: `pnpm dev` -- runs tsup in watch mode for continuous building.
- **Pre-commit hooks**: Husky runs `lint-staged` automatically on commit, which formats and lints staged files.
- **Clean build**: `pnpm clean && pnpm build` -- removes dist folder and rebuilds.

## Validation

### NEVER CANCEL Commands

- **Build**: `pnpm build` -- 3 seconds, NEVER CANCEL
- **Install**: `pnpm install` -- 20-25 seconds, NEVER CANCEL
- **Lint**: `pnpm lint` -- 2 seconds, NEVER CANCEL
- **Typecheck**: `pnpm typecheck` -- 2 seconds, NEVER CANCEL

### Required Manual Validation

After making changes to the codebase:

1. **Always run the build pipeline**:

   ```bash
   pnpm build
   pnpm lint
   pnpm format:check
   pnpm typecheck
   ```

2. **Test sample application** (if OpenRouter API key available):

   ```bash
   export OPEN_ROUTER_API_KEY="your-key"
   npx tsx sample.ts
   ```

3. **Validate build output**: Check that `dist/` folder contains proper ESM modules and TypeScript declarations.

### Expected Functionality

- **Library builds successfully** with tsup producing ESM modules
- **All linting passes** with ESLint configuration
- **TypeScript compilation succeeds** with strict mode enabled
- **Sample app demonstrates** prompt classification and model recommendation (with valid API key)
- **Export validation**: All types and classes properly exported from main index

## Common Tasks

### Repository Structure

```
/home/runner/work/auto-llm-selector/auto-llm-selector/
├── .github/workflows/publish.yml   # CI/CD pipeline
├── src/                           # TypeScript source
│   ├── index.ts                  # Main exports
│   ├── router.ts                 # AutoPromptRouter class
│   ├── classifier.ts             # Prompt classification
│   ├── types.ts                  # TypeScript interfaces
│   ├── cache.ts                  # Model caching
│   └── lib/                      # ML and utility modules
├── dist/                         # Build output (generated)
├── docs/                         # API documentation
├── sample.ts                     # Example usage
├── package.json                  # Dependencies and scripts
├── tsconfig.json                 # TypeScript configuration
├── tsup.config.ts               # Build configuration
└── eslint.config.js             # Linting rules
```

### Key Scripts from package.json

```json
{
  "build": "tsup", // Build with tsup (3 seconds)
  "dev": "tsup --watch", // Development mode
  "test": "node --test --import tsx/esm test/**/*.test.ts", // No tests exist
  "lint": "eslint \"src/**/*.{js,ts}\"", // ESLint (2 seconds)
  "format": "prettier --write .", // Format code
  "typecheck": "tsc --noEmit" // Type check (2 seconds)
}
```

### Dependencies Overview

```json
{
  "dependencies": {
    "@tensorflow-models/universal-sentence-encoder": "^1.3.3", // ML classification
    "@tensorflow/tfjs-node": "^4.22.0", // TensorFlow runtime (FAILS in sandbox)
    "zod": "^4.0.17" // Schema validation
  },
  "devDependencies": {
    "typescript": "^5.9.2", // TypeScript compiler
    "tsup": "^8.5.0", // Build tool
    "eslint": "^9.33.0", // Linting
    "prettier": "^3.6.2", // Code formatting
    "tsx": "^4.20.4" // TypeScript execution
  }
}
```

### Environment Variables

- **OPEN_ROUTER_API_KEY**: Required for API calls to OpenRouter. Get from https://openrouter.ai
- **NODE_ENV**: Set to "development" for local development

### CI/CD Pipeline

Located at `.github/workflows/publish.yml`:

- **Trigger**: Push to main branch
- **Steps**: Install pnpm → Install deps → Build → Publish to npm
- **Note**: Tests are currently skipped in CI due to missing test files

## Troubleshooting

### TensorFlow Issues

```bash
# Common error: "tfjs_binding.node can not be found"
Error: The Node.js native addon module (tfjs_binding.node) can not be found

# Solution: Document this as expected in sandboxed environments
# The library degrades gracefully to keyword-based classification
```

### Build Issues

```bash
# Lockfile outdated
pnpm install --no-frozen-lockfile

# TypeScript errors
pnpm typecheck  # Check for type issues

# Format issues
pnpm format     # Auto-fix formatting
```

### Package Manager Issues

```bash
# Always use pnpm as specified in package.json "packageManager"
npm install -g pnpm@10.12.1

# Do not use npm or yarn for dependency management
```

## Architecture Notes

### Core Components

- **AutoPromptRouter**: Main class for model selection
- **PromptClassifier**: Hybrid semantic + keyword classification
- **ModelCache**: Caches model profiles from OpenRouter API
- **SemanticEmbedder**: TensorFlow-based semantic analysis (may fail in sandbox)

### Key Files to Modify

- **router.ts**: Core routing logic and model selection
- **classifier.ts**: Prompt classification algorithms
- **types.ts**: TypeScript interfaces and type definitions
- **index.ts**: Public API exports

### Testing Strategy

- **No unit tests currently exist** - this is a limitation
- **Manual testing**: Use `sample.ts` for integration testing
- **API validation**: Requires OpenRouter API key for full testing
- **Build validation**: Always run full build pipeline before committing

### Performance Characteristics

- **Classification**: 100-300ms for hybrid semantic + keyword analysis
- **Model Selection**: 500-1500ms depending on selected LLM model
- **Model Profiles**: 80+ models cached from OpenRouter API
- **Build Time**: ~3 seconds for full TypeScript compilation
- **Install Time**: ~20-25 seconds for all dependencies

Always run `pnpm build && pnpm lint && pnpm typecheck` before committing changes to ensure code quality and consistency.
