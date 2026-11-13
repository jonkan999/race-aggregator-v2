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

test('DK København county slug is a one-off 308 onto Hovedstaden, not a generated route', () => {
  const configs = loadRedirectConfigs(path.join(repoRoot, 'config/redirects'));
  const dk = configs.find((config) => config.id === 'dk-kobenhavn');
  assert.ok(dk, 'expected config/redirects/dk-kobenhavn.json');
  assert.equal(dk.market, 'dk');
  assert.deepEqual(dk.redirects, [
    {
      source: '/lobekalender/kobenhavn/:path*',
      destination: '/lobekalender/hovedstaden/:path*',
      permanent: true,
    },
  ]);
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

test('DK county path-star 308 preserves nested browse suffixes', () => {
  const route = redirectToRoute({
    source: '/lobekalender/kobenhavn/:path*',
    destination: '/lobekalender/hovedstaden/:path*',
    permanent: true,
  });
  assert.equal(route.status, 308);
  assert.equal(route.headers.Location, '/lobekalender/hovedstaden/$1');
  assert.match('/lobekalender/kobenhavn', new RegExp(route.src));
  assert.match('/lobekalender/kobenhavn/', new RegExp(route.src));
  assert.match('/lobekalender/kobenhavn/landsvej/', new RegExp(route.src));
  assert.doesNotMatch('/lobekalender/kobenhavn-east', new RegExp(route.src));
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

test('fallbackRoutes go after the filesystem handle and collapse :path* sources', async () => {
  const { mergeVercelConfig, redirectToRoute } = await import('../scripts/merge-vercel-redirects.mjs');
  const collapse = redirectToRoute({ source: '/old/x/:path*', destination: '/list/' });
  assert.equal(collapse.src, '^/old/x(?:/(.*))?$');
  assert.equal(collapse.headers.Location, '/list/');
  const base = { routes: [{ src: '/(.*)', mitigate: { action: 'deny' } }, { handle: 'filesystem' }, { src: '^/stale$', headers: { Location: '/' }, status: 308 }] };
  const cfg = [{ id: 'x', redirects: [], fallbackRoutes: [{ src: '^/a/(.+)/[^/]+/?$', destination: '/a/$1/' }] }];
  const merged = mergeVercelConfig(base, cfg);
  const fs = merged.routes.findIndex((r) => r.handle === 'filesystem');
  assert.equal(merged.routes.filter((r) => r.handle === 'filesystem').length, 1);
  assert.deepEqual(merged.routes.slice(fs + 1), [{ src: '^/a/(.+)/[^/]+/?$', headers: { Location: '/a/$1/' }, status: 308 }]);
  assert.deepEqual(mergeVercelConfig(merged, cfg), merged);
});

test('market filter keeps only that market redirects plus unscoped ones', async () => {
  const { filterConfigsForMarket } = await import('../scripts/merge-vercel-redirects.mjs');
  const configs = [
    { id: 'global', market: '', redirects: [{ source: '/a', destination: '/b' }], fallbackRoutes: [] },
    { id: 'de-only', market: 'de', redirects: [{ source: '/x', destination: '/y' }], fallbackRoutes: [{ src: '^/z$', destination: '/' }] },
    {
      id: 'merged',
      market: '',
      redirects: [
        { source: '/loppsidor/a/:path*', destination: '/loppsidor/b/:path*', market: 'se' },
        { source: '/lopsider/c/:path*', destination: '/lopsider/d/:path*', market: 'no' },
      ],
      fallbackRoutes: [],
    },
  ];
  const se = filterConfigsForMarket(configs, 'SE');
  assert.deepEqual(se.map((c) => c.id), ['global', 'merged']);
  assert.deepEqual(se.find((c) => c.id === 'merged').redirects.map((r) => r.market), ['se']);
  assert.equal(filterConfigsForMarket(configs, '').length, 3);
});

test('real config stays under the Vercel 2048 route limit for every market', async () => {
  const { filterConfigsForMarket } = await import('../scripts/merge-vercel-redirects.mjs');
  const vercelJson = JSON.parse(fs.readFileSync(path.join(repoRoot, 'vercel.json'), 'utf8'));
  const all = loadRedirectConfigs(path.join(repoRoot, 'config/redirects'));
  const markets = JSON.parse(fs.readFileSync(path.join(repoRoot, 'config/deploy-markets.json'), 'utf8'));
  const codes = (Array.isArray(markets) ? markets : markets.markets ?? Object.keys(markets)).map((m) =>
    typeof m === 'string' ? m : m.marketCode ?? m.code,
  );
  assert.ok(codes.length > 0);
  for (const code of codes) {
    const merged = mergeVercelConfig(vercelJson, filterConfigsForMarket(all, code));
    const total = merged.routes.length + merged.redirects.length;
    assert.ok(total < 2048, `${code}: ${total} routes`);
  }
});
