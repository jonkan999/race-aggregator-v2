import { getSupabaseBrowserClient } from './supabase';

export type UploadedRaceImage = {
  path: string;
  publicUrl: string;
};

export type RaceSubmissionInsert = {
  id: string;
  siteKey: string;
  siteName: string;
  countryCode: string;
  locale: string;
  submitterEmail: string;
  name: string;
  raceType: string;
  startDate: string;
  endDate?: string;
  isMultiDay: boolean;
  startTime?: string;
  latitude: number;
  longitude: number;
  locationName: string;
  distances: string[];
  organizerName?: string;
  organizerWebsite?: string;
  priceRange?: string;
  summary: string;
  additionalInformation?: string;
  imagePaths: string[];
};

function slugPart(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'image';
}

export async function findPotentialDuplicateRace(args: {
  countryCode: string;
  locale: string;
  name: string;
  startDate: string;
}): Promise<boolean> {
  const { countryCode, locale, name, startDate } = args;
  const normalizedName = name.trim().toLowerCase();
  const compactDate = startDate.replaceAll('-', '');
  const supabase = getSupabaseBrowserClient();

  const { data, error } = await supabase
    .from('races')
    .select('id, race_dates, race_translations(locale, name)')
    .eq('country_code', countryCode)
    .eq('published', true);

  if (error) throw error;

  return (data ?? []).some((row: any) => {
    const matchesDate = Array.isArray(row.race_dates)
      ? row.race_dates.some((value: unknown) => String(value ?? '') === compactDate)
      : false;
    if (!matchesDate) return false;

    const translatedName = Array.isArray(row.race_translations)
      ? row.race_translations.find((entry: any) => entry?.locale === locale)?.name ??
        row.race_translations.find((entry: any) => entry?.locale === 'native')?.name ??
        row.race_translations[0]?.name
      : '';

    return String(translatedName ?? '').trim().toLowerCase() === normalizedName;
  });
}

export async function uploadRaceSubmissionImages(args: {
  siteKey: string;
  countryCode: string;
  submissionId: string;
  images: Array<{ fileName: string; blob: Blob }>;
}): Promise<UploadedRaceImage[]> {
  const { siteKey, countryCode, submissionId, images } = args;
  const supabase = getSupabaseBrowserClient();
  const uploaded: UploadedRaceImage[] = [];

  for (let index = 0; index < images.length; index += 1) {
    const image = images[index];
    const ext = image.fileName.toLowerCase().endsWith('.webp') ? 'webp' : 'webp';
    const fileName = `${String(index + 1).padStart(2, '0')}-${slugPart(image.fileName)}.${ext}`;
    const path = `${slugPart(siteKey)}/${countryCode}/${submissionId}/${fileName}`;
    const { error } = await supabase.storage
      .from('race-submissions')
      .upload(path, image.blob, {
        cacheControl: '3600',
        contentType: 'image/webp',
        upsert: false,
      });

    if (error) throw error;

    const { data: publicData } = supabase.storage.from('race-submissions').getPublicUrl(path);
    uploaded.push({
      path,
      publicUrl: publicData.publicUrl,
    });
  }

  return uploaded;
}

export async function createRaceSubmission(entry: RaceSubmissionInsert): Promise<void> {
  const supabase = getSupabaseBrowserClient();
  const { error } = await supabase.from('race_submissions').insert({
    id: entry.id,
    site_key: entry.siteKey,
    site_name: entry.siteName,
    country_code: entry.countryCode,
    locale: entry.locale,
    submitter_email: entry.submitterEmail,
    name: entry.name,
    race_type: entry.raceType,
    start_date: entry.startDate,
    end_date: entry.endDate || null,
    is_multi_day: entry.isMultiDay,
    start_time: entry.startTime || null,
    latitude: entry.latitude,
    longitude: entry.longitude,
    location_name: entry.locationName,
    distances: entry.distances,
    organizer_name: entry.organizerName || null,
    organizer_website: entry.organizerWebsite || null,
    price_range: entry.priceRange || null,
    summary: entry.summary,
    additional_information: entry.additionalInformation || null,
    image_paths: entry.imagePaths,
  });

  if (error) throw error;
}
