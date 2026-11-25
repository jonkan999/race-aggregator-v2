// Decide whether a built URL path is shadowed by a redirect in vercel.json.
// Routes before `{ handle: 'filesystem' }` run ahead of the static files, so a built page whose path
// matches one of them is never served (the visitor / crawler is redirected). Such paths must not be
// listed in the sitemap. Routes after the filesystem handle only catch unbuilt paths and are ignored.

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

export function compileRedirectMatchers(vercelJson) {
  const routes = Array.isArray(vercelJson?.routes) ? vercelJson.routes : [];
  const fsIndex = routes.findIndex((route) => route && route.handle === 'filesystem');
  const preFilesystem = fsIndex === -1 ? routes : routes.slice(0, fsIndex);
  const matchers = [];
  for (const route of preFilesystem) {
    if (!route || typeof route.src !== 'string' || !REDIRECT_STATUSES.has(route.status)) continue;
    try {
      matchers.push(new RegExp(route.src));
    } catch {
      // Ignore a malformed regex rather than failing the build; Vercel validates routes at deploy time.
    }
  }
  return matchers;
}

/** True when `routePath` (e.g. `/loppsidor/foo/`) is redirected before the filesystem is consulted. */
export function isRedirectSource(routePath, matchers) {
  const variants = routePath.endsWith('/') && routePath.length > 1
    ? [routePath, routePath.slice(0, -1)]
    : [routePath, `${routePath}/`];
  return matchers.some((matcher) => variants.some((variant) => matcher.test(variant)));
}
