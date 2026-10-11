import { build } from 'esbuild';
import { mkdir } from 'node:fs/promises';
await mkdir('dist',{recursive:true});
await build({entryPoints:['apps/cli/src/index.ts'],outfile:'dist/cli.mjs',bundle:true,platform:'node',target:'node24',format:'esm',packages:'external',sourcemap:true});
