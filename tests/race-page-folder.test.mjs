import assert from 'node:assert/strict';
import test from 'node:test';
import {
  asciiAliasRacePageFolder,
  preserveRacePageFolderName,
  transliterateForSlug,
} from '../src/lib/slugifyShared.js';

const LT_FOLDER = 'bėgimo_puslapiai';

function slugify(input, countryCode) {
  let s = transliterateForSlug(input, countryCode);
  s = s.normalize('NFKD').replace(/\p{M}/gu, '');
  s = s.replace(/[^a-z0-9\s-]/g, '');
  s = s.replace(/[\s-]+/g, '-').replace(/^-|-$/g, '');
  return s;
}

function localRacePageFolder(content, locale) {
  const fallback = locale === 'en' ? 'race-pages' : 'loppsidor';
  return preserveRacePageFolderName(content.race_page_folder_name) || fallback;
}

function isRacePageFolderMatch(content, locale, folderName) {
  const folder = localRacePageFolder(content, locale);
  const alias = asciiAliasRacePageFolder(folder);
  const aliases = alias ? [folder, alias] : [folder];
  return aliases.includes(preserveRacePageFolderName(folderName));
}

test('preserveRacePageFolderName keeps ė and underscores', () => {
  assert.equal(preserveRacePageFolderName(` ${LT_FOLDER} `), LT_FOLDER);
  assert.equal(preserveRacePageFolderName(LT_FOLDER.normalize('NFD')), LT_FOLDER);
  assert.notEqual(preserveRacePageFolderName(LT_FOLDER), 'begimo_puslapiai');
  assert.notEqual(preserveRacePageFolderName(LT_FOLDER), 'begimo-puslapiai');
});

test('slugify would destroy the live LT race-detail folder', () => {
  assert.equal(slugify(LT_FOLDER, 'lt'), 'begimopuslapiai');
});

test('ASCII alias is a soft-fall, not the canonical folder', () => {
  assert.equal(asciiAliasRacePageFolder(LT_FOLDER), 'begimo_puslapiai');
  assert.equal(asciiAliasRacePageFolder('jooksulehed'), '');
  assert.equal(asciiAliasRacePageFolder('strony_biegow'), '');
});

test('folder match accepts unicode canonical and ASCII alias', () => {
  const content = { race_page_folder_name: LT_FOLDER };
  assert.equal(localRacePageFolder(content, 'native'), LT_FOLDER);
  assert.equal(isRacePageFolderMatch(content, 'native', LT_FOLDER), true);
  assert.equal(isRacePageFolderMatch(content, 'native', 'begimo_puslapiai'), true);
  assert.equal(isRacePageFolderMatch(content, 'native', 'loppsidor'), false);
  assert.equal(isRacePageFolderMatch({ race_page_folder_name: 'jooksulehed' }, 'native', LT_FOLDER), false);
});
