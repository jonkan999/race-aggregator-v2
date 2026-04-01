#!/usr/bin/env node
import { spawn } from 'node:child_process';

const child = spawn(process.execPath, ['./scripts/build-browse-seo-cache.mjs', ...process.argv.slice(2)], {
  cwd: process.cwd(),
  stdio: 'inherit',
  env: process.env,
});

child.on('exit', (code) => process.exit(code ?? 1));
child.on('error', (error) => {
  console.error(error);
  process.exit(1);
});
