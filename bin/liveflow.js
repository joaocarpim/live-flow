#!/usr/bin/env node
// Repositório clonado (tem src/): roda o TypeScript direto (Node 22.18+), sempre o código atual.
// Pacote instalado (só dist/): roda o JavaScript compilado no "prepare".
import { existsSync } from 'node:fs';
const fonte = new URL('../src/cli.ts', import.meta.url);
const compilado = new URL('../dist/cli.js', import.meta.url);
const dentroDeNodeModules = fonte.pathname.includes('/node_modules/');
await import((existsSync(fonte) && !dentroDeNodeModules) || !existsSync(compilado) ? fonte.href : compilado.href);
