#!/usr/bin/env node
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadLocalEnvFiles } from './lib/load-env.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
loadLocalEnvFiles(root);
const snapshotDir = path.join(root, '.cache', 'race-list-build-snapshots');

function runNodeScript(scriptPath, args = [], extraEnv = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [scriptPath, ...args], {
      cwd: root,
      stdio: 'inherit',
      env: { ...process.env, ...extraEnv },
    });

    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${path.basename(scriptPath)} exited with code ${code ?? 1}`));
    });
    child.on('error', reject);
  });
}

function runAstroBuild(extraEnv = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['./node_modules/astro/astro.js', 'build'], {
      cwd: root,
      stdio: 'inherit',
      env: { ...process.env, ...extraEnv },
    });

    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`astro build exited with code ${code ?? 1}`));
    });
    child.on('error', reject);
  });
}

async function main() {
  fs.rmSync(snapshotDir, { recursive: true, force: true });
  fs.mkdirSync(snapshotDir, { recursive: true });

  try {
    await runNodeScript('./scripts/export-race-list-snapshots.mjs', process.argv.slice(2), {
      RACE_LIST_BUILD_SNAPSHOT_DIR: snapshotDir,
    });

    await runNodeScript('./scripts/build-browse-seo-cache.mjs', process.argv.slice(2), {
      RACE_LIST_BUILD_SNAPSHOT_DIR: snapshotDir,
      BROWSE_SEO_PROVIDER:
        process.env.BROWSE_SEO_PROVIDER ?? (process.env.OPENAI_API_KEY ? 'openai' : 'template'),
    });

    await runAstroBuild({
      RACE_LIST_BUILD_SNAPSHOT_DIR: snapshotDir,
    });

    await runNodeScript('./scripts/generate-sitemap.mjs');
  } finally {
    fs.rmSync(snapshotDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
