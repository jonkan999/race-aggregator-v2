import { useEffect, useRef } from 'react';
import { recordRaceDetailPageView } from '../lib/raceDetailPageViews';

type Props = {
  siteKey: string;
  siteName: string;
  countryCode: string;
  localeCode: string;
  domainName: string;
};

export default function RaceDetailPageViewTracker({
  siteKey,
  siteName,
  countryCode,
  localeCode,
  domainName,
}: Props) {
  const hasTrackedRef = useRef(false);

  useEffect(() => {
    if (hasTrackedRef.current) return;
    hasTrackedRef.current = true;

    void recordRaceDetailPageView({
      siteKey,
      siteName,
      countryCode,
      localeCode,
      domainName,
    });
  }, [countryCode, domainName, localeCode, siteKey, siteName]);

  return null;
}
