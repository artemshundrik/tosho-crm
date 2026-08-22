import * as React from "react";
import { Shell, Section, Caption } from "../shell";

const TOKENS = [
  ["shadow-menu", "меню, поповери, селекти, підказки, рукописні випадні списки"],
  ["shadow-elevated-lg", "модальні вікна"],
  ["shadow-elevated-panel", "бічні панелі"],
  ["shadow-elevated-preview", "збільшене зображення з дошки"],
  ["shadow-overlay", "тости"],
] as const;

export default function ElevationCard() {
  return (
    <Shell
      title="Глибина"
      lede="Правило одне: тінь має лише те, що спливає над сторінкою. Усе, що лежить у потоці — картки, кнопки, поля — піднімається межею й фоном."
    >
      <Section title="П'ять токенів, усі в роботі" hint="застосовані на справжніх поверхнях у картці «Спливні шари»">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {TOKENS.map(([cls, use]) => (
            <div key={cls} className={`${cls} rounded-xl border border-border/50 bg-card px-3 py-3`}>
              <p className="text-3xs font-medium">{cls}</p>
              <p className="text-3xs text-muted-foreground">{use}</p>
            </div>
          ))}
        </div>
      </Section>
      <Section title="Поверхня в потоці" hint="та сама картка без тіні — так виглядає все, що не спливає">
        <div className="rounded-xl border border-border/50 bg-card px-3 py-3">
          <p className="text-3xs font-medium">без тіні</p>
          <p className="text-3xs text-muted-foreground">межа /50 + фон картки</p>
        </div>
        <Caption>
          До 22.08.2026 тіні глушило глобальне правило, і в коді жило 336 класів, які нічого не малювали. Правило прибрано, класи вичищено, токени з іменами in-flow поверхонь (card, elevated-sm, elevated-md) видалено, щоб не спокушали.
        </Caption>
      </Section>
    </Shell>
  );
}
