/**
 * «Поставляється в шести різних кольорах.» — числом СЛОВОМ (відгук власника
 * 07.10.2026). Речення дописує код, а не мовна модель: кількість кольорів він
 * знає точно, а модель — ні.
 */

const UNITS = ["", "одному", "двох", "трьох", "чотирьох", "п'яти", "шести", "семи", "восьми", "дев'яти"];
const TEENS = [
  "десяти",
  "одинадцяти",
  "дванадцяти",
  "тринадцяти",
  "чотирнадцяти",
  "п'ятнадцяти",
  "шістнадцяти",
  "сімнадцяти",
  "вісімнадцяти",
  "дев'ятнадцяти",
];
const TENS = ["", "", "двадцяти", "тридцяти", "сорока", "п'ятдесяти", "шістдесяти", "сімдесяти", "вісімдесяти", "дев'яноста"];

/** Числівник у місцевому відмінку, 1–99; поза межами — null. */
export function locativeNumeral(n: number): string | null {
  if (!Number.isInteger(n) || n < 1 || n > 99) return null;
  if (n < 10) return UNITS[n];
  if (n < 20) return TEENS[n - 10];
  const tens = TENS[Math.floor(n / 10)];
  const unit = n % 10;
  return unit ? `${tens} ${UNITS[unit]}` : tens;
}

/**
 * Речення про кількість кольорів; для одного кольору — null (нема про що).
 *
 * «у восьми», а не «в восьми»: перед «в»/«ф» милозвучність вимагає «у».
 * «у двадцяти одному різному кольорі» — після «одному» іменник в однині.
 */
export function colorsSentence(count: number): string | null {
  if (!Number.isInteger(count) || count < 2) return null;
  const word = locativeNumeral(count);
  if (!word) return `Поставляється в ${count} різних кольорах.`;
  const preposition = /^[вф]/.test(word) ? "у" : "в";
  const singular = count % 10 === 1 && count % 100 !== 11;
  return singular
    ? `Поставляється ${preposition} ${word} різному кольорі.`
    : `Поставляється ${preposition} ${word} різних кольорах.`;
}
