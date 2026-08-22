// Тема — з конфігу застосунку (спадкування, не копія). Міняється тільки
// `content`: сканувати треба примітиви та картки, а не весь src — інакше в
// кожну картку поїдуть усі утиліти застосунку (300 кБ).
//
// ГОЧА: `source(none)` і `@source` у CSS цей legacy-конфіг НЕ перекривають —
// Tailwind слухає саме `content` звідси. Тому список тут, а не в styles.css.
import base from "../../tailwind.config.js";

export default {
  ...base,
  content: [
    "../../src/components/ui/**/*.{ts,tsx}",
    "../../src/components/kanban/**/*.{ts,tsx}",
    "../../src/lib/statusTones.ts",
    "./cards/**/*.tsx",
    "./shell.tsx",
    "./main.tsx",
  ],
};
