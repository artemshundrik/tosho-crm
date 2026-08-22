import * as React from "react";
import { IconInput } from "tosho-crm";
import { Search, Link2 } from "lucide-react";
import { Stack } from "./_shared";

export function Basic() {
  return (
    <Stack>
      <IconInput icon={Search} iconLabel="Пошук" placeholder="Пошук за назвою…" />
      <IconInput icon={Link2} iconLabel="Посилання" defaultValue="https://tosho.pro" />
      <p className="text-3xs text-muted-foreground">
        <code>icon</code> — це сам компонент (<code>icon={"{Search}"}</code>), не готовий вузол; <code>iconLabel</code> обовʼязковий для читача з екрана.
      </p>
    </Stack>
  );
}
