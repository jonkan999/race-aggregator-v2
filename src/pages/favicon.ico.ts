import type { APIRoute } from 'astro';

/** Keep favicon requests routed to the static asset. */
export const GET: APIRoute = () =>
  new Response(null, { status: 302, headers: { Location: '/favicon.svg' } });
