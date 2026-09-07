import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';
import {
  asciiAliasRacePageFolder,
  preserveRacePageFolderName,
  transliterateForSlug,
} from '../src/lib/slugifyShared.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const UNICODE_LT_FOLDER = 'bėgimo_puslapiai';
const ASCII_LT_FOLDER = 'begimo_puslapiai';

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

test('preserveRacePageFolderName keeps ė and underscores when given Unicode', () => {
  assert.equal(preserveRacePageFolderName(` ${UNICODE_LT_FOLDER} `), UNICODE_LT_FOLDER);
  assert.equal(preserveRacePageFolderName(UNICODE_LT_FOLDER.normalize('NFD')), UNICODE_LT_FOLDER);
  assert.notEqual(preserveRacePageFolderName(UNICODE_LT_FOLDER), ASCII_LT_FOLDER);
  assert.notEqual(preserveRacePageFolderName(UNICODE_LT_FOLDER), 'begimo-puslapiai');
});

test('slugify would destroy an LT race-detail folder', () => {
  assert.equal(slugify(UNICODE_LT_FOLDER, 'lt'), 'begimopuslapiai');
  assert.equal(slugify(ASCII_LT_FOLDER, 'lt'), 'begimopuslapiai');
});

test('ASCII alias folds Unicode but is not a generic slugify policy', () => {
  assert.equal(asciiAliasRacePageFolder(UNICODE_LT_FOLDER), ASCII_LT_FOLDER);
  assert.equal(asciiAliasRacePageFolder(ASCII_LT_FOLDER), '');
  assert.equal(asciiAliasRacePageFolder('jooksulehed'), '');
  assert.equal(asciiAliasRacePageFolder('strony_biegow'), '');
});

test('LT YAML canonical race folder is ASCII begimo_puslapiai', () => {
  const native = yaml.load(fs.readFileSync(path.join(repoRoot, 'data/countries/lt/index.yaml'), 'utf8'));
  const manifest = JSON.parse(fs.readFileSync(path.join(repoRoot, 'scripts/.generated-market-routes.json'), 'utf8'));
  assert.equal(localRacePageFolder(native, 'native'), ASCII_LT_FOLDER);
  assert.equal(isRacePageFolderMatch(native, 'native', ASCII_LT_FOLDER), true);
  assert.equal(isRacePageFolderMatch(native, 'native', UNICODE_LT_FOLDER), false);
  assert.equal(fs.existsSync(path.join(repoRoot, 'src/pages', UNICODE_LT_FOLDER)), false);
  assert.equal(fs.existsSync(path.join(repoRoot, 'src/pages', ASCII_LT_FOLDER, '[domain]', 'index.astro')), true);
  assert.equal(
    manifest.files.some((filePath) => filePath.includes(UNICODE_LT_FOLDER)),
    false,
  );
});

test('folder match still accepts a Unicode canonical plus ASCII alias', () => {
  const content = { race_page_folder_name: UNICODE_LT_FOLDER };
  assert.equal(localRacePageFolder(content, 'native'), UNICODE_LT_FOLDER);
  assert.equal(isRacePageFolderMatch(content, 'native', UNICODE_LT_FOLDER), true);
  assert.equal(isRacePageFolderMatch(content, 'native', ASCII_LT_FOLDER), true);
  assert.equal(isRacePageFolderMatch(content, 'native', 'loppsidor'), false);
  assert.equal(isRacePageFolderMatch({ race_page_folder_name: 'jooksulehed' }, 'native', UNICODE_LT_FOLDER), false);
});
