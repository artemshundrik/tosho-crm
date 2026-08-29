/**
 * Гейт дизайн-системи для oxlint.
 *
 * НАВІЩО ОКРЕМИЙ ПЛАГІН. Обидва правила раніше жили в `eslint.config.js` як
 * `no-restricted-syntax` із селекторами по AST. Такого правила в oxlint немає
 * (звірено 29.08.2026 на 1.80.0 — воно єдине з чотирьох незакритих, яке нам
 * справді потрібне), тож селектор переїхав сюди майже дослівно.
 *
 * ЧОМУ НЕ GREP, ЯК У РЕШТІ СКРИПТІВ `check-*`. Спокуса була, і вона хибна:
 * у `src/lib/badgeCatalog.ts` вісім разів трапляється `text-[10px]`/`text-[11px]`
 * у полі `className` ЗВИЧАЙНОГО ОБ'ЄКТА — це довідник значків, а не розмітка.
 * Пошук по рядках дав би вісім хибних спрацювань і був би вимкнений першого ж
 * дня. Тому лічильник глибини по `JSXAttribute[name.name="className"]`: рахуємо
 * тільки те, що справді лежить усередині атрибута розмітки.
 *
 * ЩО САМЕ ЛОВИТЬ. Те саме, що ловив селектор ESLint, — не лише прямий рядок,
 * а й усе, що всередині атрибута: `cn('flex', on && 'text-[11px]')` і шаблонні
 * рядки `` `p-1 ${on ? 'border-[#abc]' : ''}` ``. Перевірено на пробнику з усіма
 * чотирма формами.
 *
 * Обидва патерни вичищені до нуля; правила існують, щоб вони не повернулись.
 */

const HARDCODED_COLOUR = /-\[#[0-9a-fA-F]{3,8}\]/;
const MICRO_TYPE = /text-\[(9|10|11)px\]/;

const HARDCODED_COLOUR_MESSAGE =
  "Хардкод кольору в className. Візьми семантичний токен (bg-warning-soft, " +
  "text-info-foreground, bg-ai-accent…) або заведи новий у index.css + " +
  "tailwind.config.js — інакше колір не адаптується до темної теми.";

const MICRO_TYPE_MESSAGE =
  "Для мікро-типографіки є токени: text-3xs (10px) і text-2xs (11px). Розмір у " +
  "пікселях повертає нас до п’яти різних «майже однакових» кеглів.";

/**
 * Правило = патерн + текст. Обидва ходять однаково: тримають лічильник
 * вкладеності в `className` і зазирають у кожен рядковий літерал усередині.
 */
function classNameRule(pattern, message) {
  return {
    create(context) {
      let insideClassName = 0;

      const check = (node, value) => {
        if (insideClassName === 0) return;
        if (typeof value !== "string") return;
        if (!pattern.test(value)) return;
        context.report({ message, node });
      };

      return {
        JSXAttribute(node) {
          if (node.name && node.name.name === "className") insideClassName++;
        },
        "JSXAttribute:exit"(node) {
          if (node.name && node.name.name === "className") insideClassName--;
        },
        Literal(node) {
          check(node, node.value);
        },
        TemplateElement(node) {
          check(node, node.value && node.value.cooked);
        },
      };
    },
  };
}

export default {
  meta: { name: "ds" },
  rules: {
    "no-hardcoded-colour": classNameRule(HARDCODED_COLOUR, HARDCODED_COLOUR_MESSAGE),
    "no-micro-type-px": classNameRule(MICRO_TYPE, MICRO_TYPE_MESSAGE),
  },
};
