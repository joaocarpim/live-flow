#!/usr/bin/env node
// Em desenvolvimento roda o código-fonte .ts direto (Node 22.18+); instalado, usa dist/.
import { existsSync } from 'node:fs';
const dist = new URL('../dist/cli.js', import.meta.url);
await import(existsSync(dist) ? dist.href : new URL('../src/cli.ts', import.meta.url).href);
