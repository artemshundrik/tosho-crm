import * as React from "react";
import { TagsInput } from "tosho-crm";
import { Stack } from "./_shared";

const KNOWN = ["футболки", "худі", "кепки", "шопери", "бейджі", "листівки"];

export function Basic() {
  const [v, setV] = React.useState("футболки, худі, кепки");
  return (
    <Stack>
      <TagsInput value={v} onValueChange={setV} options={KNOWN} placeholder="Додати мітку…" />
      <p className="text-3xs text-muted-foreground">
        Значення — рядок через кому (той самий формат, що в базі), не масив. <code>options</code> обовʼязковий: це список уже відомих міток для підказки.
      </p>
    </Stack>
  );
}
