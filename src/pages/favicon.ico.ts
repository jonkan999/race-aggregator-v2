import type { APIRoute } from 'astro';

/** Avoid `[country]` catching GET /favicon.ico in dev and static preview. */
export const GET: APIRoute = () =>
  new Response(null, { status: 302, headers: { Location: '/favicon.svg' } });
