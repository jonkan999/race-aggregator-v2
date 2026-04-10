import fs from 'node:fs';
import path from 'node:path';

export function loadLocalEnvFiles(rootDir, candidates = ['.env', '.env.local', '.env.development']) {
  for (const name of candidates) {
    const fullPath = path.join(rootDir, name);
    if (!fs.existsSync(fullPath)) continue;
    const lines = fs.readFileSync(fullPath, 'utf8').split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIndex = trimmed.indexOf('=');
      if (eqIndex <= 0) continue;
      const key = trimmed.slice(0, eqIndex).trim();
      const rawValue = trimmed.slice(eqIndex + 1).trim();
      if (!key || process.env[key] != null) continue;
      process.env[key] = rawValue.replace(/^['"]|['"]$/g, '');
    }
  }
}
