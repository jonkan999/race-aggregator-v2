import assert from 'node:assert/strict';
import test from 'node:test';
import { compileRedirectMatchers, isRedirectSource } from '../scripts/lib/redirect-match.mjs';
import { extractLastmod } from '../scripts/generate-sitemap.mjs';

const vercel = {
  routes: [
    { src: '^/old/page/?$', headers: { Location: '/new/' }, status: 308 },
    { src: '^/legacy(?:/(.*))?$', headers: { Location: '/x/$1' }, status: 308 },
    { handle: 'filesystem' },
    { src: '^/fallback/.+$', headers: { Location: '/' }, status: 308 },
  ],
};

test('built paths shadowed by pre-filesystem redirects are detected', () => {
  const matchers = compileRedirectMatchers(vercel);
  assert.equal(isRedirectSource('/old/page/', matchers), true);
  assert.equal(isRedirectSource('/legacy/a/b/', matchers), true);
  assert.equal(isRedirectSource('/kept/', matchers), false);
});

test('fallback routes after the filesystem handle do not hide built pages', () => {
  const matchers = compileRedirectMatchers(vercel);
  assert.equal(isRedirectSource('/fallback/real-page/', matchers), false);
});

test('lastmod is read from og:updated_time as a date', () => {
  assert.equal(extractLastmod('<meta property="og:updated_time" content="2026-11-24T10:20:30.000Z">'), '2026-11-24');
  assert.equal(extractLastmod('<meta property="og:title" content="x">'), null);
});
