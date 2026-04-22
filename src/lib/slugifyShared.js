/**
 * Shared transliteration helpers for slug generation.
 *
 * Most European Latin-script languages work with Unicode normalization alone.
 * The maps below focus on:
 * - letters that do not decompose cleanly with NFKD (`ß`, `æ`, `ø`, `ł`, ...)
 * - non-Latin scripts used by major European languages (Greek, Cyrillic)
 * - a few country overrides where we intentionally preserve legacy slug shapes
 */

const PRE_NORMALIZATION_COMMON_REPLACEMENTS = {
  // Characters that would lose transliteration detail if we stripped marks first.
  'й': 'y',
  'ё': 'yo',
  'ї': 'yi',
};

const POST_NORMALIZATION_COMMON_REPLACEMENTS = {
  // Pan-European Latin-script letters that do not normalize the way we want.
  'ß': 'ss',
  'æ': 'ae',
  'œ': 'oe',
  'ø': 'o',
  'ð': 'd',
  'þ': 'th',
  'đ': 'd',
  'ħ': 'h',
  'ı': 'i',
  'ĳ': 'ij',
  'ĸ': 'k',
  'ŀ': 'l',
  'ł': 'l',
  'ŉ': 'n',
  'ſ': 's',
  'ƒ': 'f',
  'ə': 'e',
  'l·l': 'll',

  // Greek
  'α': 'a',
  'β': 'v',
  'γ': 'g',
  'δ': 'd',
  'ε': 'e',
  'ζ': 'z',
  'η': 'i',
  'θ': 'th',
  'ι': 'i',
  'κ': 'k',
  'λ': 'l',
  'μ': 'm',
  'ν': 'n',
  'ξ': 'x',
  'ο': 'o',
  'π': 'p',
  'ρ': 'r',
  'σ': 's',
  'ς': 's',
  'τ': 't',
  'υ': 'y',
  'φ': 'f',
  'χ': 'ch',
  'ψ': 'ps',
  'ω': 'o',

  // Cyrillic coverage for the main European languages using the script.
  'а': 'a',
  'б': 'b',
  'в': 'v',
  'г': 'g',
  'д': 'd',
  'е': 'e',
  'ж': 'zh',
  'з': 'z',
  'и': 'i',
  'к': 'k',
  'л': 'l',
  'м': 'm',
  'н': 'n',
  'о': 'o',
  'п': 'p',
  'р': 'r',
  'с': 's',
  'т': 't',
  'у': 'u',
  'ф': 'f',
  'х': 'kh',
  'ц': 'ts',
  'ч': 'ch',
  'ш': 'sh',
  'щ': 'shch',
  'ъ': 'a',
  'ы': 'y',
  'ь': '',
  'э': 'e',
  'ю': 'yu',
  'я': 'ya',
  'і': 'i',
  'є': 'ye',
  'ґ': 'g',
  'ў': 'u',
  'ђ': 'dj',
  'ј': 'j',
  'љ': 'lj',
  'њ': 'nj',
  'ћ': 'c',
  'џ': 'dz',
  'ќ': 'kj',
  'ѓ': 'gj',
  'ѕ': 'dz',
};

const COUNTRY_OVERRIDES = {
  se: {
    'å': 'a',
    'ä': 'a',
    'ö': 'o',
  },
  no: {
    'å': 'a',
    'æ': 'a',
    'ø': 'o',
  },
  dk: {
    'å': 'a',
    'æ': 'a',
    'ø': 'o',
  },
  fi: {
    'å': 'a',
    'ä': 'a',
    'ö': 'o',
  },
  de: {
    'ä': 'ae',
    'ö': 'oe',
    'ü': 'ue',
    'ß': 'ss',
  },
  bg: {
    'й': 'y',
    'х': 'h',
    'щ': 'sht',
    'ь': 'y',
  },
};

function replacementEntries(replacements) {
  return Object.entries(replacements).sort(([left], [right]) => right.length - left.length);
}

function applyReplacements(input, replacements) {
  let output = input;
  for (const [from, to] of replacementEntries(replacements)) {
    output = output.replaceAll(from, to);
  }
  return output;
}

export function transliterateForSlug(input, countryCode) {
  const normalizedInput = String(input ?? '').toLowerCase();
  const country = String(countryCode ?? '').toLowerCase();
  const countryOverrides = COUNTRY_OVERRIDES[country] ?? {};
  const countryAdjusted = applyReplacements(normalizedInput, countryOverrides);
  const preNormalized = applyReplacements(
    countryAdjusted,
    PRE_NORMALIZATION_COMMON_REPLACEMENTS,
  );
  const accentStripped = preNormalized.normalize('NFKD').replace(/\p{M}/gu, '');
  return applyReplacements(accentStripped, POST_NORMALIZATION_COMMON_REPLACEMENTS);
}
