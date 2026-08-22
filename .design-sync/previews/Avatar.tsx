import * as React from "react";
import { AvatarBase, EntityAvatar } from "tosho-crm";
import { Cell } from "./_shared";

export function People() {
  return (
    <Cell>
      <div className="flex flex-wrap items-end gap-4">
        {[20, 28, 36, 48].map((s) => (
          <div key={s} className="grid justify-items-center gap-1.5">
            <AvatarBase name="Іван Савчук" fallback="ІС" size={s} className="border-border/60" />
            <span className="text-3xs text-muted-foreground tabular-nums">{s}px</span>
          </div>
        ))}
      </div>
      <p className="mt-3 text-3xs text-muted-foreground">
        Для людей — <code>AvatarBase</code>: тон береться з імені, тож та сама людина завжди того самого кольору.
      </p>
    </Cell>
  );
}

export function Customers() {
  return (
    <Cell>
      <div className="flex flex-wrap items-center gap-4">
        <EntityAvatar name="FAYNA TEAM" fallback="FT" size={40} />
        <EntityAvatar name="ТОВ «Приклад»" fallback="ТП" size={40} />
        <EntityAvatar name="ПП «Ліга Спорт»" fallback="ЛС" size={40} />
      </div>
      <p className="mt-3 text-3xs text-muted-foreground">
        Для замовників — <code>EntityAvatar</code>: підставляє логотип, а без нього — ініціали в тоні назви.
      </p>
    </Cell>
  );
}
