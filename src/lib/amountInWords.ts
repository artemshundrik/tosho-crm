/**
 * Сума прописом українською — для рядка «Всього найменувань…» у рахунку.
 *
 * У фінансовому документі це не косметика: сума прописом і є тим, що юридично
 * читають при звірці, тож відмінювання має бути правильним. Три пастки, через
 * які тут стільки таблиць:
 *   1. Гривня жіночого роду («одна гривня», «дві гривні»), а долар — чоловічого
 *      («один долар»). Тисяча теж жіночого, а мільйон чоловічого, тому рід
 *      залежить не від суми, а від розряду.
 *   2. Числа на 11-14 не підкоряються правилу останньої цифри: «одинадцять
 *      гривень», а не «одинадцять гривня».
 *   3. Копійки рахуємо через Math.round від сотих, інакше 1.996 дасть 99 копійок
 *      замість переносу в гривні.
 *
 * Модуль чистий (без React і мережі) і покритий тестами — див. amountInWords.test.ts.
 */

export type AmountCurrency = "UAH" | "USD" | "EUR";

type Gender = "f" | "m";

/** Три форми іменника при числівнику: 1 / 2-4 / 5+. */
type NounForms = { one: string; few: string; many: string };

type CurrencyWords = {
  major: NounForms & { gender: Gender };
  minor: NounForms;
};

const CURRENCY_WORDS: Record<AmountCurrency, CurrencyWords> = {
  UAH: {
    major: { one: "гривня", few: "гривні", many: "гривень", gender: "f" },
    minor: { one: "копійка", few: "копійки", many: "копійок" },
  },
  USD: {
    major: { one: "долар", few: "долари", many: "доларів", gender: "m" },
    minor: { one: "цент", few: "центи", many: "центів" },
  },
  EUR: {
    // Євро не відмінюється — усі три форми однакові.
    major: { one: "євро", few: "євро", many: "євро", gender: "m" },
    minor: { one: "цент", few: "центи", many: "центів" },
  },
};

const UNITS_MASCULINE = [
  "", "один", "два", "три", "чотири", "п'ять", "шість", "сім", "вісім", "дев'ять",
  "десять", "одинадцять", "дванадцять", "тринадцять", "чотирнадцять",
  "п'ятнадцять", "шістнадцять", "сімнадцять", "вісімнадцять", "дев'ятнадцять",
];

// Від чоловічого роду відрізняються лише одиниця й двійка.
const UNITS_FEMININE = UNITS_MASCULINE.map((word, index) =>
  index === 1 ? "одна" : index === 2 ? "дві" : word
);

const TENS = [
  "", "", "двадцять", "тридцять", "сорок", "п'ятдесят",
  "шістдесят", "сімдесят", "вісімдесят", "дев'яносто",
];

const HUNDREDS = [
  "", "сто", "двісті", "триста", "чотириста",
  "п'ятсот", "шістсот", "сімсот", "вісімсот", "дев'ятсот",
];

/** Розряди понад одиниці. Рід тут свій і на валюту не зважає. */
const SCALES: Array<NounForms & { gender: Gender }> = [
  { one: "тисяча", few: "тисячі", many: "тисяч", gender: "f" },
  { one: "мільйон", few: "мільйони", many: "мільйонів", gender: "m" },
  { one: "мільярд", few: "мільярди", many: "мільярдів", gender: "m" },
  { one: "трильйон", few: "трильйони", many: "трильйонів", gender: "m" },
];

/** Форма іменника за числом: 1 → one, 2-4 → few, решта → many (з винятком 11-14). */
const pluralForm = (count: number, forms: NounForms): string => {
  const mod100 = count % 100;
  const mod10 = count % 10;
  if (mod10 === 1 && mod100 !== 11) return forms.one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return forms.few;
  return forms.many;
};

/** Група з трьох цифр (1-999) словами. */
const groupToWords = (group: number, gender: Gender): string[] => {
  const units = gender === "f" ? UNITS_FEMININE : UNITS_MASCULINE;
  const words: string[] = [];
  const hundreds = Math.floor(group / 100);
  const rest = group % 100;
  if (hundreds) words.push(HUNDREDS[hundreds]);
  if (rest < 20) {
    if (rest) words.push(units[rest]);
  } else {
    words.push(TENS[Math.floor(rest / 10)]);
    const unit = rest % 10;
    if (unit) words.push(units[unit]);
  }
  return words;
};

/** Ціла частина словами, з назвами розрядів. */
const wholeToWords = (whole: number, majorGender: Gender): string[] => {
  if (whole === 0) return ["нуль"];

  // Ріжемо на групи по три цифри, від молодших до старших.
  const groups: number[] = [];
  let rest = whole;
  while (rest > 0) {
    groups.push(rest % 1000);
    rest = Math.floor(rest / 1000);
  }

  const words: string[] = [];
  for (let index = groups.length - 1; index >= 0; index -= 1) {
    const group = groups[index];
    if (group === 0) continue;
    const scale = index > 0 ? SCALES[index - 1] : null;
    words.push(...groupToWords(group, scale?.gender ?? majorGender));
    if (scale) words.push(pluralForm(group, scale));
  }
  return words;
};

const capitalize = (value: string) => (value ? value[0].toUpperCase() + value.slice(1) : value);

/**
 * «Сто сімдесят чотири тисячі дев'ятсот шістдесят гривень 00 копійок».
 * Гривні — словами, копійки — цифрами (як у стандартному рахунку 1С/BAS),
 * але слово «копійка» все одно відмінюється за їх кількістю.
 */
export function amountInWords(value: number, currency: AmountCurrency = "UAH"): string {
  const words = CURRENCY_WORDS[currency];
  const negative = value < 0;
  const totalMinor = Math.round(Math.abs(value) * 100);
  const whole = Math.floor(totalMinor / 100);
  const fraction = totalMinor % 100;

  const parts = [
    ...wholeToWords(whole, words.major.gender),
    pluralForm(whole, words.major),
    String(fraction).padStart(2, "0"),
    pluralForm(fraction, words.minor),
  ];

  const phrase = capitalize(parts.join(" "));
  return negative ? `Мінус ${phrase[0].toLowerCase()}${phrase.slice(1)}` : phrase;
}
