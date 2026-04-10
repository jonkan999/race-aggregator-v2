import { readTrainingPlansJson } from '../../../lib/trainingPlans';

export const prerender = true;

export function getStaticPaths() {
  return [{ params: { locale: 'native' } }, { params: { locale: 'en' } }];
}

export async function GET({ params }: { params: { locale?: string } }) {
  const localeParam = params.locale === 'en' ? 'en' : 'native';
  const country = (process.env.MARKET_CODE ?? 'se').trim().toLowerCase();
  const payload = readTrainingPlansJson(country, localeParam);
  if (payload == null) {
    return new Response(JSON.stringify({ error: 'Training plans data not found' }), {
      status: 404,
      headers: { 'content-type': 'application/json; charset=utf-8' },
    });
  }

  return new Response(payload, {
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}
