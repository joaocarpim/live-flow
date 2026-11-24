// Empacota a extensão (CJS) e a CLI + executor do navegador (ESM) dentro de dist/.
import { build } from 'esbuild';
import { mkdirSync, writeFileSync } from 'node:fs';
const comum = { bundle: true, platform: 'node', target: 'node20', sourcemap: false, logLevel: 'warning' };
// dependências CommonJS (yaml) dentro de um pacote ESM precisam de require
const esm = { format: 'esm', banner: { js: "import { createRequire as __lfRequire } from 'node:module'; const require = __lfRequire(import.meta.url);" } };
await build({ ...comum, entryPoints: ['src/extensao.ts'], outfile: 'dist/extensao.js', format: 'cjs', external: ['vscode'] });
await build({ ...comum, entryPoints: ['../src/cli.ts'], outfile: 'dist/cli/cli.js', ...esm });
await build({ ...comum, entryPoints: ['../src/runtime/fluxo.ts'], outfile: 'dist/cli/runtime/fluxo.js', ...esm });
mkdirSync('dist/cli', { recursive: true });
writeFileSync('dist/cli/package.json', '{"type":"module"}\n');
console.log('ok: dist/extensao.js, dist/cli/cli.js, dist/cli/runtime/fluxo.js');
