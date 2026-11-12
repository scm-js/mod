import { defineConfig } from 'tsdown';

export default defineConfig({
    // The reader, and the adapter for a mod on a disk (`@scm-js/mod/node`, Node only: it reads with node:fs).
    entry: ['src/index.ts', 'src/node.ts'],
    format: ['esm', 'cjs'],
    // The reader uses no Node built-ins, so the same output runs in Node, browsers, Deno and Bun.
    platform: 'neutral',
    target: 'es2022',
    outDir: 'dist',
    // Pinned extensions, so `exports` cannot drift: .cjs = CommonJS, .mjs = ESM.
    outExtensions: ({ format }) =>
        format === 'cjs' ? { js: '.cjs', dts: '.d.cts' } : { js: '.mjs', dts: '.d.mts' },
    external: ['mopaq', /^node:/],
    dts: true,
    sourcemap: true,
    clean: true,
    treeshake: true,
});
