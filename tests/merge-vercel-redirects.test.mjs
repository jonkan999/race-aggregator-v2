import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  loadRedirectConfigs,
  mergeVercelConfig,
  mergeVercelRedirects,
  redirectToRoute,
} from '../scripts/merge-vercel-redirects.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const UNICODE_FOLDER = 'bėgimo_puslapiai';
const ASCII_FOLDER = 'begimo_puslapiai';

test('LT redirect file is a one-off 308, not a generate-market-routes output', () => {
  const configs = loadRedirectConfigs(path.join(repoRoot, 'config/redirects'));
  const lt = configs.find((config) => config.id === 'lt-begimo-puslapiai');
  assert.ok(lt, 'expected config/redirects/lt-begimo-puslapiai.json');
  assert.equal(lt.market, 'lt');
  assert.deepEqual(
    lt.redirects.map((redirect) => redirect.source),
    [`/${UNICODE_FOLDER}/:path*`, `/b%C4%97gimo_puslapiai/:path*`],
  );
  assert.ok(lt.redirects.every((redirect) => redirect.destination === `/${ASCII_FOLDER}/:path*`));
  assert.ok(lt.redirects.every((redirect) => redirect.permanent === true));
});

test('path-star redirects become 308 routes that preserve the rest of the path', () => {
  const route = redirectToRoute({
    source: `/${UNICODE_FOLDER}/:path*`,
    destination: `/${ASCII_FOLDER}/:path*`,
    permanent: true,
  });
  assert.equal(route.status, 308);
  assert.equal(route.headers.Location, `/${ASCII_FOLDER}/$1`);
  assert.match('/bėgimo_puslapiai/vilniaus_maratonas/', new RegExp(route.src));
  assert.match('/bėgimo_puslapiai', new RegExp(route.src));
});

test('merge prepends managed 308s and keeps the WAF deny route', () => {
  const wafRoute = {
    src: '/(.*)',
    has: [{ type: 'header', key: 'x-vercel-ip-country', value: { inc: ['BR'] } }],
    mitigate: { action: 'deny' },
  };
  const merged = mergeVercelConfig(
    { framework: 'astro', routes: [wafRoute] },
    [
      {
        id: 'lt-begimo-puslapiai',
        market: 'lt',
        redirects: [
          {
            source: `/${UNICODE_FOLDER}/:path*`,
            destination: `/${ASCII_FOLDER}/:path*`,
            permanent: true,
          },
        ],
      },
    ],
  );

  assert.equal(merged.redirects.length, 1);
  assert.equal(merged.routes[0].status, 308);
  assert.deepEqual(merged.routes.at(-1), wafRoute);
});

test('generate-market-routes.mjs does not own vercel.json or the LT redirect file', () => {
  const generator = fs.readFileSync(path.join(repoRoot, 'scripts/generate-market-routes.mjs'), 'utf8');
  assert.equal(generator.includes('vercel.json'), false);
  assert.equal(generator.includes('config/redirects'), false);
  assert.equal(generator.includes('merge-vercel-redirects'), false);
});

test('merge is idempotent and does not drop existing WAF routes', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lt-redirects-'));
  const vercelPath = path.join(tempDir, 'vercel.json');
  const redirectsDir = path.join(tempDir, 'redirects');
  fs.mkdirSync(redirectsDir);
  fs.writeFileSync(
    vercelPath,
    `${JSON.stringify(
      {
        framework: 'astro',
        routes: [
          {
            src: '/(.*)',
            mitigate: { action: 'deny' },
          },
        ],
      },
      null,
      2,
    )}\n`,
  );
  fs.copyFileSync(
    path.join(repoRoot, 'config/redirects/lt-begimo-puslapiai.json'),
    path.join(redirectsDir, 'lt-begimo-puslapiai.json'),
  );

  const first = mergeVercelRedirects({ vercelPath, redirectsDir });
  const second = mergeVercelRedirects({ vercelPath, redirectsDir });
  const parsed = JSON.parse(fs.readFileSync(vercelPath, 'utf8'));

  assert.equal(first.changed, true);
  assert.equal(second.changed, false);
  assert.equal(parsed.redirects.length, 2);
  assert.equal(parsed.routes.filter((route) => route.status === 308).length, 2);
  assert.equal(parsed.routes.at(-1).mitigate.action, 'deny');
});
