import { ChevronDown } from "lucide-react";

export type QuoteItemSpecSection = {
  title: string;
  fields: Array<{ label: string; value: string }>;
};

/**
 * Специфікація товару в картці прорахунку — ОДИН вигляд на поліграфію й мерч
 * (REQ-175#p36).
 *
 * Було два різні: поліграфія показувала згортку з коробками, а мерч — плашку
 * «ВИШИВКА · Місце не вказано · 100×30 мм» капсом. Дані ті самі (секція з
 * парами підпис—значення), тож і вигляд один: тихий підпис групи, під ним рядки
 * підпис → значення. Ні капсу, ні коробок, ні рисок під заголовком групи —
 * групу тримає відступ між колонками.
 *
 * ЗГОРТКА ЗʼЯВЛЯЄТЬСЯ ЛИШЕ ТАМ, ДЕ Є ЩО ЗГОРТАТИ. Блокнот має одинадцять
 * параметрів у двох секціях — там вона доречна. Куртка має один рядок про
 * нанесення, і «Специфікація · 1 параметр» над ним була б утричі більша за сам
 * факт.
 */
const COLLAPSIBLE_FROM = 5;

export function QuoteItemSpec({ sections }: { sections: QuoteItemSpecSection[] }) {
  if (sections.length === 0) return null;

  const fieldCount = sections.reduce((total, section) => total + section.fields.length, 0);

  const grid = (
    <div className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
      {sections.map((section) => (
        <div key={section.title}>
          <div className="mb-2 text-xs text-muted-foreground">{section.title}</div>
          {section.fields.map((field) => (
            <div
              key={`${section.title}:${field.label}`}
              className="flex items-baseline justify-between gap-4 py-1 text-sm"
            >
              <span className="min-w-0 text-muted-foreground">{field.label}</span>
              <span className="min-w-0 text-right font-medium tabular-nums text-foreground">{field.value}</span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );

  if (fieldCount < COLLAPSIBLE_FROM) {
    return <div className="mt-4 border-t border-border/50 pt-3">{grid}</div>;
  }

  return (
    <details open className="group mt-4">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 border-t border-border/50 pt-3 [&::-webkit-details-marker]:hidden">
        <span className="text-sm font-semibold text-foreground">Специфікація</span>
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className="tabular-nums">{fieldCount}</span> параметрів
          <ChevronDown className="h-4 w-4 shrink-0 transition-transform group-open:rotate-180" />
        </span>
      </summary>
      <div className="mt-3">{grid}</div>
    </details>
  );
}
