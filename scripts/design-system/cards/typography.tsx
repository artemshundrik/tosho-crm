import * as React from "react";
import { Shell, Section, Caption } from "../shell";

const SCALE = [
  ["text-3xs", "10px", "мікро-мітки, номери"],
  ["text-2xs", "11px", "підписи в таблицях"],
  ["text-xs", "12px", "вторинний текст"],
  ["text-sm", "14px", "основний інтерфейс"],
  ["text-base", "16px", "тіло"],
  ["text-lg", "18px", "заголовок картки"],
  ["text-xl", "20px", "заголовок розділу"],
  ["text-2xl", "24px", "заголовок сторінки"],
] as const;

export default function TypographyCard() {
  return (
    <Shell
      title="Типографіка"
      lede={<>Inter Variable — той самий файл, що в застосунку, вбудований у картку. Кегль тільки токеном: eslint блокує <code>text-[11px]</code> і подібні.</>}
    >
      <Section title="Шкала">
        <div className="grid">
          {SCALE.map(([cls, px, use]) => (
            <div key={cls} className="flex items-baseline gap-3 border-b border-border/40 py-1.5">
              <span className={`${cls} w-44 shrink-0 font-medium`}>Прорахунок TS-0826</span>
              <span className="w-24 shrink-0 text-3xs tabular-nums text-muted-foreground">{cls} · {px}</span>
              <span className="text-3xs text-muted-foreground">{use}</span>
            </div>
          ))}
        </div>
      </Section>
      <Section title="Ваги" hint="вага задається варіантом компонента, не окремим класом">
        <div className="flex flex-wrap gap-5 text-sm">
          <span className="font-normal">Звичайний 400</span>
          <span className="font-medium">Середній 500</span>
          <span className="font-semibold">Напівжирний 600</span>
        </div>
      </Section>
      <Section title="Цифри" hint="tabular-nums — 304 вживання в коді: суми не стрибають при перерахунку">
        <div className="grid gap-1 text-sm">
          <p className="tabular-nums">1 234,00 ₴ · 987,65 ₴ · 11 111,11 ₴ <span className="text-3xs text-muted-foreground">tabular-nums</span></p>
          <p>1 234,00 ₴ · 987,65 ₴ · 11 111,11 ₴ <span className="text-3xs text-muted-foreground">без нього</span></p>
        </div>
        <Caption>Кирилиця й латиниця — обидва сабсети вбудовані; апострофи ’ і ʼ теж.</Caption>
      </Section>
    </Shell>
  );
}
