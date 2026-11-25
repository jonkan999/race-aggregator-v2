import assert from 'node:assert/strict';
import test from 'node:test';
import { buildRaceTitle, extractCity, stripYears } from '../src/lib/raceTitle.js';
import { isPastEdition, nextDateNotAnnouncedText, NEXT_DATE_NOT_ANNOUNCED } from '../src/lib/pastEdition.js';
import { buildEventSchema } from '../src/lib/eventSchema.js';

test('title is "{name} {year}, {city}" using the start-date year', () => {
  assert.equal(buildRaceTitle({ name: 'Lerumsloppet', startIso: '2027-05-16', city: 'Lerum' }), 'Lerumsloppet 2027');
  assert.equal(buildRaceTitle({ name: 'Trail Cup', startIso: '2027-05-16', city: 'Uppsala' }), 'Trail Cup 2027, Uppsala');
});

test('a stale year in the name is replaced, never duplicated or contradictory', () => {
  assert.equal(buildRaceTitle({ name: 'Lerumsloppet 2025', startIso: '2027-05-16', city: 'Lerum' }), 'Lerumsloppet 2027');
  assert.equal(buildRaceTitle({ name: 'Trail Cup (2025)', startIso: '2027-05-16', city: 'Uppsala' }), 'Trail Cup 2027, Uppsala');
  assert.equal(buildRaceTitle({ name: 'Winter Run 2025/2026', startIso: '2027-01-10', city: '' }), 'Winter Run 2027');
  assert.equal(buildRaceTitle({ name: 'Trail Cup 2027', startIso: '2027-05-16', city: 'Uppsala' }), 'Trail Cup 2027, Uppsala');
  assert.equal(buildRaceTitle({ name: 'Winter Run 2026/2027', startIso: '2027-01-10', city: '' }), 'Winter Run 2026/2027');
});

test('names without a usable date keep the name; digits that are not years survive', () => {
  assert.equal(buildRaceTitle({ name: 'Ultra 2000 m', startIso: null, city: '' }), 'Ultra 2000 m');
  assert.equal(stripYears('Lidingöloppet 2025 (30K)'), 'Lidingöloppet (30K)');
});

test('city is skipped when already in the name (accent-insensitive, inflected)', () => {
  assert.equal(buildRaceTitle({ name: 'Półmaraton w Mikołajkach', startIso: '2027-05-15', city: 'Mikołajki' }), 'Półmaraton w Mikołajkach 2027');
  assert.equal(buildRaceTitle({ name: 'Göteborgsvarvet', startIso: '2027-05-15', city: 'Goteborg' }), 'Göteborgsvarvet 2027');
  assert.equal(buildRaceTitle({ name: 'Uppsala Halvmarathon', startIso: '2027-05-15', city: 'Uppsala' }), 'Uppsala Halvmarathon 2027');
});

test('city extraction drops country, admin areas, streets and postcodes', () => {
  const o = { countryNames: ['Sverige', 'Deutschland', 'Nederland', 'Polska'] };
  assert.equal(extractCity('OK Linné, Tallbacksvägen 68, Uppsala, Sverige', o), 'Uppsala');
  assert.equal(extractCity('Parkuddens IP, Medåker, Arboga Municipality, Sverige', o), 'Medåker');
  assert.equal(extractCity('Großer Tiergarten, 10553 Berlin, Deutschland', o), 'Berlin');
  assert.equal(extractCity('Tychy, Silesian Voivodeship, Polska', o), 'Tychy');
  assert.equal(extractCity('Eyachmühle, Dobel, Baden-Württemberg, Deutschland', o), 'Dobel');
  assert.equal(extractCity('Lumièreparkcross', o), 'Lumièreparkcross');
  assert.equal(extractCity('Stadion, 123 45 Farsta, Sverige', o), 'Farsta');
  assert.equal(extractCity('Hamnplan, 3 Strandvägen, Sverige', o), 'Hamnplan');
  assert.equal(extractCity('Gärdet, Stockholm, Sverige', { ...o, adminNames: ['Stockholms'] }), 'Stockholm');
  assert.equal(extractCity('Plac Wolności, Opole, Polska', o), 'Opole');
  assert.equal(extractCity('Iași, Iași County, România', { countryNames: ['România'], adminNames: ['Iași'] }), 'Iași');
  assert.equal(extractCity('Hluboké Mašůvky, Jihomoravský', { adminNames: ['Jihomoravský'] }), 'Hluboké Mašůvky');
  assert.equal(extractCity('Nederland', o), '');
  assert.equal(extractCity('Forngården, Trollhättan, Västra Götaland, Sverige', o), 'Trollhättan');
  assert.equal(extractCity('', o), '');
});

test('past editions are detected from the shown dates', () => {
  assert.equal(isPastEdition([{ startIso: '2026-05-01', endIso: '2026-05-01' }], '2026-11-25'), true);
  assert.equal(isPastEdition([{ startIso: '2027-05-01', endIso: '2027-05-01' }], '2026-11-25'), false);
  assert.equal(isPastEdition([], '2026-11-25'), false);
});

test('every market language has a note and unknown languages fall back to English', () => {
  for (const code of ['sv', 'no', 'da', 'fi', 'de', 'nl', 'pl', 'cs', 'sk', 'hu', 'ro', 'bg', 'el', 'sr', 'et', 'lt', 'lv', 'en']) {
    assert.ok(NEXT_DATE_NOT_ANNOUNCED[code], code);
  }
  assert.equal(nextDateNotAnnouncedText('xx'), NEXT_DATE_NOT_ANNOUNCED.en);
});

test('past events carry no eventStatus and no offers', () => {
  const schema = buildEventSchema({
    name: 'Old Run', startIso: '2025-05-01', isPast: true, todayIso: '2026-11-25',
    offers: [{ '@type': 'Offer', price: 100 }], countryCode: 'SE', url: 'https://x.se/a/',
  });
  assert.equal(schema.eventStatus, undefined);
  assert.equal(schema.offers, undefined);
  assert.equal(schema.startDate, '2025-05-01');
});
