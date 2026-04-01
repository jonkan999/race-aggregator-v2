import { useEffect, useRef, useState } from 'react';

export type HighlightedRaceEntry = {
  id: string;
  href: string;
  name: string;
  dateLabel: string;
  dateIso?: string;
  topLocation: {
    label: string;
    flagCode: string | null;
  };
  typeLabel: string;
  distanceLabels: string[];
  summary?: string;
  imageSrc: string;
  imageAlt: string;
};

export default function HighlightedRacesStrip(props: {
  title: string;
  topTitle?: string;
  cta: string;
  entries: HighlightedRaceEntry[];
}) {
  const { title, topTitle = '', cta, entries } = props;
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(entries.length > 1);

  useEffect(() => {
    const node = scrollerRef.current;
    if (!node) return undefined;

    let frame = 0;
    const update = () => {
      const maxLeft = node.scrollWidth - node.clientWidth - 1;
      setCanScrollLeft(node.scrollLeft > 4);
      setCanScrollRight(node.scrollLeft < maxLeft);
      setSelectedIndex(nearestHighlightedSlideIndex(node));
    };

    const scheduleUpdate = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(update);
    };

    scheduleUpdate();
    node.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', scheduleUpdate);
    const observer =
      typeof ResizeObserver === 'undefined'
        ? null
        : new ResizeObserver(() => {
            scheduleUpdate();
          });
    observer?.observe(node);
    Array.from(node.children).forEach((child) => observer?.observe(child));

    const timeoutId = window.setTimeout(scheduleUpdate, 180);
    return () => {
      node.removeEventListener('scroll', update);
      window.removeEventListener('resize', scheduleUpdate);
      observer?.disconnect();
      window.clearTimeout(timeoutId);
      cancelAnimationFrame(frame);
    };
  }, [entries.length]);

  useEffect(() => {
    if (selectedIndex < entries.length) return;
    setSelectedIndex(Math.max(entries.length - 1, 0));
  }, [entries.length, selectedIndex]);

  if (entries.length === 0) return null;

  const scrollToIndex = (index: number) => {
    const node = scrollerRef.current;
    if (!node) return;
    const slides = Array.from(node.querySelectorAll<HTMLElement>('.selected-races-slide'));
    const next = slides[index];
    if (!next) return;
    setSelectedIndex(index);
    setCanScrollLeft(index > 0);
    setCanScrollRight(index < entries.length - 1);
    node.scrollTo({ left: next.offsetLeft, behavior: 'smooth' });
  };

  const scrollByCards = (direction: -1 | 1) => {
    const nextIndex = Math.max(0, Math.min(entries.length - 1, selectedIndex + direction));
    scrollToIndex(nextIndex);
  };

  return (
    <section className="section section-selected-races" aria-label={title}>
      <div className="section-header-container">
        <h2 className="section-header">{title}</h2>
        <div className="selected-races-controls" aria-hidden={entries.length <= 1}>
          <button
            type="button"
            className="selected-races-control"
            onClick={() => scrollByCards(-1)}
            disabled={!canScrollLeft}
          >
            <svg className="icon" aria-hidden="true">
              <use
                href="/icons/svg-sprite.svg#chevron-back-outline"
                xlinkHref="/icons/svg-sprite.svg#chevron-back-outline"
              />
            </svg>
          </button>
          <button
            type="button"
            className="selected-races-control"
            onClick={() => scrollByCards(1)}
            disabled={!canScrollRight}
          >
            <svg className="icon" aria-hidden="true">
              <use
                href="/icons/svg-sprite.svg#chevron-forward-outline"
                xlinkHref="/icons/svg-sprite.svg#chevron-forward-outline"
              />
            </svg>
          </button>
        </div>
      </div>

      <div
        className="race-card-big-container"
        ref={scrollerRef}
        onScroll={(event) => {
          const nextIndex = nearestHighlightedSlideIndex(event.currentTarget);
          if (nextIndex !== selectedIndex) {
            setSelectedIndex(nextIndex);
          }
        }}
      >
        {entries.map((entry) => (
          <div key={entry.id} className="selected-races-slide">
            <a href={entry.href} className="race-card-big race-card">
              <div className="race-card-big-upper-box background-container">
                <img
                  src={entry.imageSrc}
                  alt={entry.imageAlt}
                  className="background-img selected-race-card-img"
                  loading="lazy"
                  decoding="async"
                />
                <div className="selected-race-card-overlay" />
                <div className="race-card-content">
                  <div className="race-info-top">
                    {entry.dateIso ? (
                      <time className="race-date" dateTime={entry.dateIso}>
                        {entry.dateLabel}
                      </time>
                    ) : (
                      <div className="race-date">{entry.dateLabel}</div>
                    )}
                    <div className="race-location">
                      {entry.topLocation.flagCode ? (
                        <svg className="language-flag" aria-label={entry.topLocation.flagCode}>
                          <use
                            href={`/icons/svg-sprite.svg#flag-${entry.topLocation.flagCode}`}
                            xlinkHref={`/icons/svg-sprite.svg#flag-${entry.topLocation.flagCode}`}
                          />
                        </svg>
                      ) : null}
                      {entry.topLocation.label}
                    </div>
                  </div>

                  <div className="race-card-bottom">
                    {topTitle ? <p className="selected-race-card-kicker">{topTitle}</p> : null}
                    <h3 className="race-name">{entry.name}</h3>

                    {entry.typeLabel || entry.distanceLabels.length > 0 ? (
                      <div className="race-distances">
                        <div className="distance-container">
                          {entry.typeLabel ? <span className="race-type">{entry.typeLabel}</span> : null}
                          {entry.distanceLabels.slice(0, 4).map((label) => (
                            <span key={`${entry.id}-${label}`} className="race-distance">
                              {label}
                            </span>
                          ))}
                        </div>
                      </div>
                    ) : null}

                    {entry.summary ? <p className="selected-race-card-summary">{entry.summary}</p> : null}

                    {cta ? (
                      <div className="cta-button">
                        <span className="more-info-button">{cta}</span>
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            </a>
          </div>
        ))}
      </div>
    </section>
  );
}

function nearestHighlightedSlideIndex(track: HTMLDivElement): number {
  const slides = Array.from(track.querySelectorAll<HTMLElement>('.selected-races-slide'));
  if (slides.length === 0) return 0;

  const viewportAnchor = track.scrollLeft + track.clientWidth * 0.42;
  let nearestIndex = 0;
  let nearestDistance = Number.POSITIVE_INFINITY;

  slides.forEach((slide, index) => {
    const slideAnchor = slide.offsetLeft + slide.clientWidth * 0.42;
    const distance = Math.abs(slideAnchor - viewportAnchor);
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearestIndex = index;
    }
  });

  return nearestIndex;
}
