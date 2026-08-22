import * as React from "react";
import { Toaster } from "tosho-crm";
import { toast } from "sonner";
import { Button } from "tosho-crm";
import { Cell } from "./_shared";

export function Live() {
  React.useEffect(() => {
    const t = setTimeout(() => toast.success("Курс валют оновлено"), 120);
    return () => clearTimeout(t);
  }, []);
  return (
    <Cell>
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" size="sm" onClick={() => toast.success("Прорахунок створено")}>Успіх</Button>
        <Button variant="secondary" size="sm" onClick={() => toast.error("Не вдалось зберегти")}>Помилка</Button>
        <Button variant="secondary" size="sm" onClick={() => toast("Усі сповіщення прочитані")}>Нейтральний</Button>
      </div>
      <p className="mt-3 text-3xs text-muted-foreground">
        <code>Toaster</code> монтується один раз глобально; повідомлення шлють через <code>toast</code> із <code>sonner</code>.
      </p>
      <Toaster />
    </Cell>
  );
}
