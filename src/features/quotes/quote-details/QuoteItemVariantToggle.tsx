import { useState } from "react";
import { toast } from "sonner";

import { DropdownMenuCheckboxItem } from "@/components/ui/dropdown-menu";
import { supabase } from "@/lib/supabaseClient";

/**
 * Позначка «варіант того самого виробу» в меню позиції прорахунку (REQ-267#p2).
 *
 * ЧОМУ ОКРЕМИМ ФАЙЛОМ, А НЕ ШІСТЬМА РЯДКАМИ В СТОРІНЦІ. Позначка не просто
 * перемикає стан: вона читає `metadata` з бази, домішує один ключ і пише назад.
 * Читання перед записом обов'язкове — у тому самому об'єкті живуть артикул,
 * варіант каталогу й параметри виробу, і запис зі старого знімка сторінки затер
 * би чужу правку (той самий урок, що й у `PrintSpecPanel`).
 *
 * ЩО САМЕ ЦЕ МІНЯЄ, і межі варто знати: позначені позиції прорахунку в
 * документі КП перестають складатись і показуються межами «від–до». Ні
 * підсумок картки, ні замовлення, ні дайджести на прапорець не дивляться —
 * див. `@/lib/quoteItemVariants`.
 */
export function QuoteItemVariantToggle({
  quoteItemId,
  checked,
  disabled,
  onSaved,
}: {
  quoteItemId: string;
  checked: boolean;
  disabled?: boolean;
  onSaved: () => void;
}) {
  const [saving, setSaving] = useState(false);

  const toggle = async (next: boolean) => {
    setSaving(true);
    try {
      const { data, error: readError } = await supabase
        .schema("tosho")
        .from("quote_items")
        .select("metadata")
        .eq("id", quoteItemId)
        .maybeSingle();
      if (readError) throw readError;

      const current = (data?.metadata ?? {}) as Record<string, unknown>;
      // Знятий прапорець ВИДАЛЯЄМО, а не пишемо `false`: `isVariant: false` у
      // базі виглядав би як окрема відповідь, хоча означає рівно те саме, що
      // й відсутність ключа, — і читачам довелося б розрізняти три стани там,
      // де їх два.
      const nextMetadata: Record<string, unknown> = { ...current };
      if (next) nextMetadata.isVariant = true;
      else delete nextMetadata.isVariant;

      const { error: writeError } = await supabase
        .schema("tosho")
        .from("quote_items")
        // `as never` — той самий прийом, що й у `queries.ts`: згенерований тип
        // колонки `Json` не приймає `Record<string, unknown>`, хоча jsonb
        // приймає рівно його.
        .update({ metadata: nextMetadata as never })
        .eq("id", quoteItemId);
      if (writeError) throw writeError;

      toast.success(next ? "Позицію позначено варіантом" : "Позначку варіанта знято", {
        description: next
          ? "У КП такі позиції не складаються — показується діапазон «від–до»."
          : undefined,
      });
      onSaved();
    } catch (error: unknown) {
      toast.error(
        error instanceof Error ? error.message : "Не вдалося змінити позначку варіанта"
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <DropdownMenuCheckboxItem
      checked={checked}
      disabled={disabled || saving}
      // Меню не згортаємо: менеджер позначає ТРИ позиції поспіль, і закривати
      // його після кожної означало б три зайві кліки з пошуком кнопки «⋮».
      onSelect={(event) => event.preventDefault()}
      onCheckedChange={(next) => {
        void toggle(next === true);
      }}
    >
      Варіант того самого виробу
    </DropdownMenuCheckboxItem>
  );
}
