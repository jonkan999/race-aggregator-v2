import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = path.join(repoRoot, 'config/redirects');
const files = fs.readdirSync(dir).filter((f) => f.endsWith('-unpublished.json'));
const load = (f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));

test('unpublished redirect files are market-scoped permanent redirects with unique sources', () => {
  assert.ok(files.length > 0);
  for (const f of files) {
    const conf = load(f);
    const code = f.replace('-unpublished.json', '');
    assert.equal(conf.market, code, f);
    const seen = new Set();
    for (const r of conf.redirects) {
      assert.ok(r.source.startsWith('/') && r.destination.startsWith('/'), `${f}: ${r.source}`);
      assert.notEqual(r.permanent, false, `${f}: ${r.source}`);
      assert.ok(!r.market || r.market === code, `${f}: ${r.source}`);
      assert.ok(!seen.has(r.source), `${f}: duplicate ${r.source}`);
      seen.add(r.source);
    }
  }
});

test('every retired PL race page 308s on the native and /en/ paths, including the Smak Maraton series', () => {
  const conf = load('pl-unpublished.json');
  const bySlug = new Map();
  for (const r of conf.redirects) {
    const m = r.source.match(/^\/(strony_biegow|en\/race-pages)\/([^/]+)(\/|\/:path\*)?$/);
    if (!m) continue;
    const entry = bySlug.get(m[2]) ?? new Set();
    entry.add(`${m[1]}${m[3] ?? ''}`);
    bySlug.set(m[2], entry);
    if (m[1] === 'en/race-pages') assert.match(r.destination, /^\/en\//, r.source);
    else assert.doesNotMatch(r.destination, /^\/en\//, r.source);
  }
  for (const [slug, forms] of bySlug) {
    for (const f of ['strony_biegow', 'strony_biegow/', 'strony_biegow/:path*', 'en/race-pages', 'en/race-pages/', 'en/race-pages/:path*']) {
      assert.ok(forms.has(f), `${slug} lacks ${f}`);
    }
  }
  const smak = [...bySlug.keys()].filter((s) => /(^|_)smak_maraton/.test(s));
  assert.ok(smak.length >= 24, `Smak Maraton slugs redirected: ${smak.length}`);
  for (const r of conf.redirects.filter((x) => /smak_maraton/.test(x.source))) {
    assert.ok(['/kalendarz-biegow/miasta/warsaw/', '/en/race-calendar/cities/warsaw/'].includes(r.destination), r.source);
  }
});
