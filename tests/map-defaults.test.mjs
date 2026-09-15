import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const overlays = JSON.parse(fs.readFileSync(path.join(repoRoot, 'config/map-defaults.json'), 'utf8'));

test('Denmark list map overlay pulls zoom out to show the whole country', () => {
  assert.equal(overlays.dk.zoom, 5.5);
  assert.equal(overlays.dk.latitude, 56);
  assert.equal(overlays.dk.longitude, 10.5);
});
