import { createElement } from "react";

import { ENTITY_PROP } from "@/components/app/headers/EntityHeader";
import { quoteTypeIcon, quoteTypeLabel } from "@/features/quotes/quotes-page/config";

type QuoteTypeBadgeProps = {
  quoteType?: string | null;
};

/**
 * Значок типу прорахунку («Мерч», «Друк» тощо) з іконкою.
 *
 * Іконку малюємо через `createElement`, а не як `<Icon />`. Правило
 * `react-hooks/static-components` шукає велику літеру в JSX, присвоєну під час
 * рендеру, і не вміє відрізнити «створили компонент на льоту» (справжня вада —
 * стан скидається щорендеру) від «дістали готовий зі сталого словника
 * QUOTE_TYPE_OPTIONS». `createElement` прямо каже: тип компонента тут
 * динамічний і взятий ззовні.
 *
 * Заглушкою це не лікується: БУДЬ-який `eslint-disable` правила react-hooks
 * змушує React Compiler відмовитись від цілого файлу, а разом із ним замовкають
 * і решта перевірок. Саме цю сліпоту REQ-109 і знімав, тож повертати її заради
 * одного значка немає сенсу. Поки картка була невидима для лінту, цього ніхто
 * не бачив; щойно вона прозріла — вилізло.
 *
 * Той самий шаблон повторюється тричі в QuotesPage — коли дійде черга робити
 * зрячим і її, звідси є що взяти.
 */
export function QuoteTypeBadge({ quoteType }: QuoteTypeBadgeProps) {
  const Icon = quoteTypeIcon(quoteType);
  // Чип властивості в шапці картки (хвиля Б3) — та сама форма, що й решта рядка.
  return (
    <span className={ENTITY_PROP}>
      {Icon ? createElement(Icon, { className: "h-3.5 w-3.5 text-muted-foreground" }) : null}
      {quoteTypeLabel(quoteType)}
    </span>
  );
}
