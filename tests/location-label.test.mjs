import assert from 'node:assert/strict';
import test from 'node:test';
import { englishCountrySuffix, locationForLocale, stripDomesticCountry } from '../src/lib/locationLabel.js';

test('drops the domestic English country suffix', () => {
  assert.equal(stripDomesticCountry('Hamar, Innlandet, Norway', 'no', 'no'), 'Hamar, Innlandet');
  assert.equal(stripDomesticCountry('Odense, Denmark', 'dk'), 'Odense');
  assert.equal(stripDomesticCountry('Kraków, Polska', 'pl', 'pl'), 'Kraków');
});

test('keeps neighbouring countries, single parts and unrelated endings', () => {
  assert.equal(stripDomesticCountry('Strömstad, Sweden', 'no', 'se'), 'Strömstad, Sweden');
  assert.equal(stripDomesticCountry('Norway', 'no'), 'Norway');
  assert.equal(stripDomesticCountry('Hamar, Innlandet', 'no'), 'Hamar, Innlandet');
  assert.equal(stripDomesticCountry('', 'no'), '');
});

test('drops a localized domestic suffix (lv)', () => {
  assert.equal(stripDomesticCountry('Valmiera, Latvija', 'lv', 'lv'), 'Valmiera');
  assert.equal(stripDomesticCountry('Tallinn, Igaunija', 'lv', 'ee'), 'Tallinn, Igaunija');
});

test('english pages get English country names', () => {
  assert.equal(englishCountrySuffix('Riga, Latvija'), 'Riga, Latvia');
  assert.equal(englishCountrySuffix('Atgāzene, Riga, Latvija'), 'Atgāzene, Riga, Latvia');
  assert.equal(englishCountrySuffix('Tallinn, Igaunija'), 'Tallinn, Estonia');
  assert.equal(englishCountrySuffix('Tartu, Eesti'), 'Tartu, Estonia');
  assert.equal(englishCountrySuffix('Brno, Česko'), 'Brno, Czech Republic');
  assert.equal(englishCountrySuffix('Latvija'), 'Latvia');
  assert.equal(englishCountrySuffix('Riga, Latvia'), 'Riga, Latvia');
  assert.equal(englishCountrySuffix('Hamar, Innlandet'), 'Hamar, Innlandet');
  assert.equal(englishCountrySuffix(''), '');
  assert.equal(locationForLocale('Riga, Latvija', 'native'), 'Riga, Latvija');
  assert.equal(locationForLocale('Riga, Latvija', 'en'), 'Riga, Latvia');
});
