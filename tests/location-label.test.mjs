import assert from 'node:assert/strict';
import test from 'node:test';
import { stripDomesticCountry } from '../src/lib/locationLabel.js';

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
