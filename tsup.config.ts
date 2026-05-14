import { defineConfig } from 'tsup';
import { chmod } from 'node:fs/promises';
import { resolve } from 'node:path';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    cli: 'src/cli/index.ts',
  },
  format: ['esm'],
  dts: { entry: { index: 'src/index.ts' } },
  clean: true,
  target: 'node18',
  outDir: 'dist',
  sourcemap: true,
  banner: {
    js: '#!/usr/bin/env node',
  },
  async onSuccess() {
    await chmod(resolve('dist/cli.js'), 0o755);
  },
});
