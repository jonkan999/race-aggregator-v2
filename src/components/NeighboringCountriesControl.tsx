import { supportedFlagCode } from '../lib/raceCardDisplay';
import type { NeighboringCountryOption } from '../lib/neighboringSelection';

export default function NeighboringCountriesControl(props: {
  title: string;
  showAllLabel: string;
  countries: NeighboringCountryOption[];
  visibleCodes: string[];
  onChange?: (codes: string[]) => void;
}) {
  const { title, showAllLabel, countries, visibleCodes, onChange } = props;
  const visible = new Set(visibleCodes.map((code) => code.trim().toLowerCase()).filter(Boolean));
  const allCodes = countries.map((entry) => entry.code);
  const allChecked = allCodes.length > 0 && allCodes.every((code) => visible.has(code));
  const expanded = visible.size > 0;

  const setCodes = (codes: string[]) => {
    onChange?.(codes);
  };

  return (
    <div
      className="mapboxgl-ctrl mapboxgl-ctrl-group neighboring-countries-control"
      data-testid="neighboring-countries-control"
    >
      {title ? (
        <div className="neighboring-countries-control__header">
          <strong>{title}</strong>
        </div>
      ) : null}
      <label className="neighboring-countries-control__row" htmlFor="neighboring-toggle">
        <input
          type="checkbox"
          id="neighboring-toggle"
          checked={allChecked}
          onChange={(event) => {
            setCodes(event.target.checked ? allCodes : []);
          }}
        />
        <span>{showAllLabel}</span>
      </label>
      {expanded ? (
        <div id="neighboring-countries-container" className="neighboring-countries-control__countries">
          {countries.map((entry) => {
            const flagCode = supportedFlagCode(entry.code);
            const checked = visible.has(entry.code);
            return (
              <label
                key={entry.code}
                className="neighboring-countries-control__row"
                htmlFor={`country-${entry.code}`}
              >
                <input
                  type="checkbox"
                  id={`country-${entry.code}`}
                  data-country={entry.code}
                  checked={checked}
                  onChange={(event) => {
                    const next = new Set(visible);
                    if (event.target.checked) next.add(entry.code);
                    else next.delete(entry.code);
                    setCodes(allCodes.filter((code) => next.has(code)));
                  }}
                />
                {flagCode ? (
                  <svg className="language-flag" aria-hidden="true">
                    <use
                      href={`/icons/svg-sprite.svg#flag-${flagCode}`}
                      xlinkHref={`/icons/svg-sprite.svg#flag-${flagCode}`}
                    />
                  </svg>
                ) : null}
                <span>{entry.label}</span>
              </label>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
