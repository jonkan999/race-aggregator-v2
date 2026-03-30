import { useEffect, useRef, useState } from 'react';

export type HighlightedRaceEntry = {
  id: string;
  href: string;
  name: string;
  dateLabel: string;
  regionLabel: string;
  typeLabel: string;
  distanceLabels: string[];
  imageSrc: string;
  imageAlt: string;
};

export default function HighlightedRacesStrip(props: {
  title: string;
  cta: string;
  entries: HighlightedRaceEntry[];
}) {
  const { title, cta, entries } = props;
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(entries.length > 1);

  useEffect(() => {
    const node = scrollerRef.current;
    if (!node) return undefined;

    const update = () => {
      const maxLeft = node.scrollWidth - node.clientWidth - 1;
      setCanScrollLeft(node.scrollLeft > 4);
      setCanScrollRight(node.scrollLeft < maxLeft);
    };

    update();
    node.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    return () => {
      node.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, [entries.length]);

  if (entries.length === 0) return null;

  const scrollByCards = (direction: -1 | 1) => {
    const node = scrollerRef.current;
    if (!node) return;
    const amount = Math.round(node.clientWidth * 0.82) * direction;
    node.scrollBy({ left: amount, behavior: 'smooth' });
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

      <div className="race-card-big-container right-scroller" ref={scrollerRef}>
        {entries.map((entry) => (
          <a key={entry.id} href={entry.href} className="race-card-big race-card">
            <div className="race-card-big-upper-box background-container">
              <img
                src={entry.imageSrc}
                alt={entry.imageAlt}
                className="background-img selected-race-card-img"
                loading="lazy"
                decoding="async"
              />
              <div className="overlay soft" />
              <div className="race-card-content">
                <div className="race-info-top">
                  <div className="race-date">{entry.dateLabel}</div>
                  <div className="race-location">{entry.regionLabel}</div>
                </div>
                <div className="race-info-bottom">
                  {entry.typeLabel ? <div className="race-type">{entry.typeLabel}</div> : null}
                  {entry.distanceLabels.length > 0 ? (
                    <div className="race-distances">
                      <div className="distance-container">
                        {entry.distanceLabels.slice(0, 4).map((label) => (
                          <div key={`${entry.id}-${label}`} className="distance-item">
                            <span className="race-distance">{label}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
            <div className="race-card-bottom">
              <h3 className="race-name">{entry.name}</h3>
              <div className="cta-button">
                <div className="more-info-button">{cta}</div>
              </div>
            </div>
          </a>
        ))}
      </div>
    </section>
  );
}
