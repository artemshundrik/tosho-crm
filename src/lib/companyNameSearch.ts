const CYRILLIC_TO_LATIN_MAP: Record<string, string> = {
  а: "a",
  б: "b",
  в: "v",
  г: "g",
  ґ: "g",
  д: "d",
  е: "e",
  є: "e",
  ж: "zh",
  з: "z",
  и: "i",
  і: "i",
  ї: "i",
  й: "i",
  к: "k",
  л: "l",
  м: "m",
  н: "n",
  о: "o",
  п: "p",
  р: "r",
  с: "s",
  т: "t",
  у: "u",
  ф: "f",
  х: "h",
  ц: "ts",
  ч: "ch",
  ш: "sh",
  щ: "sh",
  ь: "",
  ъ: "",
  ю: "u",
  я: "a",
  ё: "e",
};

const LATIN_TO_CYRILLIC_SEQUENCES: Array<[string, string]> = [
  ["shch", "щ"],
  ["sch", "щ"],
  ["zh", "ж"],
  ["kh", "х"],
  ["ts", "ц"],
  ["ch", "ч"],
  ["sh", "ш"],
  ["yu", "ю"],
  ["ju", "ю"],
  ["ya", "я"],
  ["ja", "я"],
  ["yo", "йо"],
  ["jo", "йо"],
  ["ye", "є"],
  ["je", "є"],
  ["yi", "ї"],
  ["ji", "ї"],
];

const LATIN_TO_CYRILLIC_CHAR_MAP: Record<string, string> = {
  a: "а",
  b: "б",
  c: "к",
  d: "д",
  e: "е",
  f: "ф",
  g: "г",
  h: "х",
  i: "і",
  j: "й",
  k: "к",
  l: "л",
  m: "м",
  n: "н",
  o: "о",
  p: "п",
  q: "к",
  r: "р",
  s: "с",
  t: "т",
  u: "у",
  v: "в",
  w: "в",
  x: "кс",
  y: "і",
  z: "з",
};

const stripToWords = (value?: string | null) =>
  (value ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[`"'’«»]/g, "")
    .replace(/[&/\\+]+/g, " ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

const transliterateCyrillicToLatin = (value: string) =>
  Array.from(value)
    .map((char) => CYRILLIC_TO_LATIN_MAP[char] ?? char)
    .join("");

const transliterateLatinToCyrillic = (value: string) => {
  let next = value;
  for (const [from, to] of LATIN_TO_CYRILLIC_SEQUENCES) {
    next = next.replaceAll(from, to);
  }
  return Array.from(next)
    .map((char) => LATIN_TO_CYRILLIC_CHAR_MAP[char] ?? char)
    .join("");
};

const toPhoneticLatin = (value: string) => {
  const latin = transliterateCyrillicToLatin(stripToWords(value))
    .replace(/ph/g, "f")
    .replace(/ck/g, "k")
    .replace(/qu/g, "ku")
    .replace(/w/g, "v")
    .replace(/x/g, "ks")
    .replace(/q/g, "k")
    .replace(/c/g, "k")
    .replace(/zh/g, "z")
    .replace(/sh/g, "s")
    .replace(/ch/g, "c")
    .replace(/ts/g, "c")
    .replace(/yu/g, "u")
    .replace(/ya/g, "a")
    .replace(/yo/g, "o")
    .replace(/ye/g, "e")
    .replace(/yi/g, "i")
    .replace(/[^\p{L}\p{N} ]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

  return latin.replace(/(.)\1+/g, "$1");
};

const toCompact = (value: string) => value.replace(/\s+/g, "");

const toConsonantSkeleton = (value: string) => toCompact(value).replace(/[aeiouy]/g, "");

export const normalizeCompanyName = (value?: string | null) => stripToWords(value);

export const normalizeCompanyNameLooseKey = (value?: string | null) => toPhoneticLatin(value ?? "");

export const normalizeCompanyNameCompactKey = (value?: string | null) =>
  toCompact(normalizeCompanyNameLooseKey(value));

export const normalizeCompanyNameSkeletonKey = (value?: string | null) =>
  toConsonantSkeleton(normalizeCompanyNameLooseKey(value));

export const areCompanyNamesEquivalent = (left?: string | null, right?: string | null) => {
  const leftCompact = normalizeCompanyNameCompactKey(left);
  const rightCompact = normalizeCompanyNameCompactKey(right);
  if (!leftCompact || !rightCompact) return false;
  if (leftCompact === rightCompact) return true;
  return normalizeCompanyNameSkeletonKey(left) === normalizeCompanyNameSkeletonKey(right);
};

export const buildCompanySearchVariants = (value?: string | null) => {
  const raw = stripToWords(value);
  if (!raw) return [];

  const latin = transliterateCyrillicToLatin(raw);
  const phoneticLatin = toPhoneticLatin(raw);
  const phoneticCyrillic = transliterateLatinToCyrillic(phoneticLatin);
  const latinWithSoftC = phoneticLatin.replace(/k(?=[aeiou])/g, "c");
  const compactLatin = toCompact(phoneticLatin);
  const compactCyrillic = toCompact(phoneticCyrillic);
  const rawWords = raw.split(" ").filter((item) => item.length >= 3);
  const latinWords = latin.split(" ").filter((item) => item.length >= 3);
  const phoneticLatinWords = phoneticLatin.split(" ").filter((item) => item.length >= 3);
  const phoneticCyrillicWords = phoneticCyrillic.split(" ").filter((item) => item.length >= 3);
  const softCWords = phoneticLatinWords.map((item) => item.replace(/k(?=[aeiou])/g, "c"));

  return Array.from(
    new Set(
      [
        raw,
        latin,
        phoneticLatin,
        phoneticCyrillic,
        latinWithSoftC,
        compactLatin,
        compactCyrillic,
        ...rawWords,
        ...latinWords,
        ...phoneticLatinWords,
        ...phoneticCyrillicWords,
        ...softCWords,
      ]
        .map((item) => item.trim())
        .filter((item) => item.length >= 2)
    )
  ).slice(0, 7);
};

export const scoreCompanyNameMatch = (query: string, candidates: Array<string | null | undefined>) => {
  const queryNormalized = normalizeCompanyName(query);
  const queryCompact = normalizeCompanyNameCompactKey(query);
  const querySkeleton = normalizeCompanyNameSkeletonKey(query);
  if (!queryNormalized || !queryCompact) return 0;

  return candidates.reduce((best, candidate) => {
    const candidateNormalized = normalizeCompanyName(candidate);
    const candidateCompact = normalizeCompanyNameCompactKey(candidate);
    const candidateSkeleton = normalizeCompanyNameSkeletonKey(candidate);
    if (!candidateNormalized || !candidateCompact) return best;
    if (candidateCompact === queryCompact) return Math.max(best, 120);
    if (candidateSkeleton && candidateSkeleton === querySkeleton && querySkeleton.length >= 3) return Math.max(best, 110);
    if (candidateCompact.startsWith(queryCompact)) return Math.max(best, 96);
    if (candidateNormalized.startsWith(queryNormalized)) return Math.max(best, 92);
    if (candidateCompact.includes(queryCompact) || queryCompact.includes(candidateCompact)) return Math.max(best, 84);
    if (candidateSkeleton && querySkeleton.length >= 3 && candidateSkeleton.includes(querySkeleton)) return Math.max(best, 76);
    if (candidateNormalized.includes(queryNormalized)) return Math.max(best, 72);
    return best;
  }, 0);
};

export const matchesCompanyNameSearch = (query: string, candidates: Array<string | null | undefined>) =>
  scoreCompanyNameMatch(query, candidates) > 0;
