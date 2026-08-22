import * as React from "react";
import tokens from "../.gen/tokens.json";
import { Shell, Section, Caption } from "../shell";

type Token = { name: string; light: string; dark?: string };
const GROUPS = tokens as Array<{ label: string; items: Token[] }>;

export default function ColorsCard() {
  const total = GROUPS.reduce((n, g) => n + g.items.length, 0);
  return (
    <Shell
      title="Кольорові токени"
      lede={<>{total} токенів зі <code>src/index.css</code>, згрупованих за змістом. Під кожним — значення для світлої і (стрілкою) темної теми. Бренд перефарбовується однією ручкою <code>--brand-h</code>.</>}
    >
      {GROUPS.map((g) => (
        <Section key={g.label} title={g.label} hint={`${g.items.length} шт.`}>
          <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
            {g.items.map((t) => (
              <div key={t.name}>
                <div className="h-9 w-full rounded-lg border border-border" style={{ background: `hsl(var(${t.name}))` }} />
                <p className="mt-1 truncate text-3xs font-medium">{t.name}</p>
                <p className="text-3xs tabular-nums text-muted-foreground">
                  {t.light}{t.dark && t.dark !== t.light ? ` → ${t.dark}` : ""}
                </p>
              </div>
            ))}
          </div>
        </Section>
      ))}
      <Caption>Плашки зліва й справа — ті самі змінні в різних темах: це не дві палітри, а одна з двома значеннями.</Caption>
    </Shell>
  );
}
