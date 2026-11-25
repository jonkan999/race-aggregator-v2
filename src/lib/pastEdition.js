// "Next date not announced yet" note for race pages whose latest edition has already taken place.

/** Keyed by the market language code (`country_language_code`); `en` is used for the /en/ pages. */
export const NEXT_DATE_NOT_ANNOUNCED = {
  en: 'The next date has not been announced yet.',
  sv: 'Nästa datum har inte meddelats ännu.',
  no: 'Neste dato er ikke kunngjort ennå.',
  da: 'Næste dato er endnu ikke offentliggjort.',
  fi: 'Seuraavaa päivämäärää ei ole vielä ilmoitettu.',
  de: 'Der nächste Termin steht noch nicht fest.',
  nl: 'De volgende datum is nog niet bekendgemaakt.',
  pl: 'Kolejny termin nie został jeszcze ogłoszony.',
  cs: 'Další termín zatím nebyl oznámen.',
  sk: 'Ďalší termín zatiaľ nebol oznámený.',
  hu: 'A következő időpontot még nem hirdették meg.',
  ro: 'Următoarea dată nu a fost anunțată încă.',
  bg: 'Следващата дата все още не е обявена.',
  el: 'Η επόμενη ημερομηνία δεν έχει ανακοινωθεί ακόμη.',
  sr: 'Sledeći datum još nije objavljen.',
  et: 'Järgmist kuupäeva ei ole veel teatatud.',
  lt: 'Kita data dar nepaskelbta.',
  lv: 'Nākamais datums vēl nav paziņots.',
};

export function nextDateNotAnnouncedText(languageCode) {
  return NEXT_DATE_NOT_ANNOUNCED[String(languageCode ?? '').toLowerCase()] ?? NEXT_DATE_NOT_ANNOUNCED.en;
}

/** True when every shown date ended before `todayIso`: the page describes an edition that already took place. */
export function isPastEdition(dateEntries, todayIso) {
  const entries = Array.isArray(dateEntries) ? dateEntries : [];
  if (entries.length === 0 || !todayIso) return false;
  return entries.every((entry) => {
    const end = entry?.endIso || entry?.startIso;
    return Boolean(end) && end < todayIso;
  });
}
