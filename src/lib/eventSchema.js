// Pure builder for the schema.org Event JSON-LD of a race page (plain JS so node --test can import it).
import { parsePriceRange, truncateAtWord } from './seoMeta.js';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** "09:30", "9.30", "09:00:00" -> "09:30:00"; anything else -> null. */
export function startTimeToIso(value) {
  const match = String(value ?? '').match(/^\s*(\d{1,2})[:.](\d{2})(?::\d{2})?\s*$/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return `${String(hours).padStart(2, '0')}:${match[2]}:00`;
}

function validCoordinate(latitude, longitude) {
  const lat = Number(latitude);
  const lng = Number(longitude);
  if (latitude == null || longitude == null || latitude === '' || longitude === '') return null;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  if (lat === 0 && lng === 0) return null;
  return { latitude: Math.round(lat * 1e5) / 1e5, longitude: Math.round(lng * 1e5) / 1e5 };
}

function httpUrl(value) {
  const text = String(value ?? '').trim();
  return /^https?:\/\/\S+$/i.test(text) ? text : undefined;
}

/**
 * An edition that already took place is not an upcoming event: no eventStatus and no offers are
 * published for it, only its (past) dates. eventStatus is only asserted when the date is confirmed. An estimated (next-year guess) date
 * is not a scheduled event, so no status is claimed. schema.org defines EventScheduled as
 * "taking place or has taken place on the startDate", so it is correct for past confirmed dates.
 */
export function eventStatusFor({ isEstimated, isPast = false }) {
  return isEstimated || isPast ? undefined : 'https://schema.org/EventScheduled';
}

export function buildEventSchema(input) {
  const {
    name,
    description,
    startIso,
    endIso,
    startTime,
    isEstimated = false,
    isPast = false,
    locationName,
    locality,
    region,
    countryCode,
    latitude,
    longitude,
    images = [],
    organizerName,
    organizerUrl,
    offers = [],
    priceRange,
    currency,
    offerUrl,
    todayIso,
    url,
  } = input;

  const isoStart = ISO_DATE.test(String(startIso ?? '')) ? startIso : undefined;
  const isoEnd = ISO_DATE.test(String(endIso ?? '')) ? endIso : isoStart;
  const time = isoStart && isoEnd === isoStart ? startTimeToIso(startTime) : null;
  const geo = validCoordinate(latitude, longitude);
  const upcoming = Boolean(isoEnd && todayIso && isoEnd >= todayIso);

  let schemaOffers = offers.length > 0 && !isPast ? offers : undefined;
  if (!schemaOffers && !isEstimated && !isPast && upcoming) {
    const range = parsePriceRange(priceRange);
    if (range) {
      schemaOffers =
        range.low === range.high
          ? [{ '@type': 'Offer', price: range.low, priceCurrency: currency, availability: 'https://schema.org/InStock', url: offerUrl }]
          : [{ '@type': 'AggregateOffer', lowPrice: range.low, highPrice: range.high, priceCurrency: currency, url: offerUrl }];
    }
  }

  const address =
    locality || region || countryCode
      ? {
          '@type': 'PostalAddress',
          addressLocality: locality || undefined,
          addressRegion: region || undefined,
          addressCountry: countryCode || undefined,
        }
      : undefined;

  return {
    '@context': 'https://schema.org',
    '@type': 'Event',
    name,
    description: description ? truncateAtWord(description, 600) : undefined,
    startDate: isoStart ? (time ? `${isoStart}T${time}` : isoStart) : undefined,
    endDate: isoEnd ? (time && isoEnd === isoStart ? undefined : isoEnd) : undefined,
    eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
    eventStatus: eventStatusFor({ isEstimated, isPast }),
    image: images.length > 0 ? images : undefined,
    location: {
      '@type': 'Place',
      name: locationName || locality || region || undefined,
      address,
      geo: geo ? { '@type': 'GeoCoordinates', ...geo } : undefined,
    },
    organizer: organizerName
      ? { '@type': 'Organization', name: organizerName, url: httpUrl(organizerUrl) }
      : undefined,
    offers: schemaOffers,
    url,
  };
}
