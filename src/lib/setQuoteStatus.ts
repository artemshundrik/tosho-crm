import { supabase } from "@/lib/supabaseClient";
import type { Database } from "@/lib/database.types";

/**
 * ЗМІНА СТАТУСУ ПРОРАХУНКУ — І ЧЕСНА ВІДПОВІДЬ, ЧИ ВІН СПРАВДІ ЗМІНИВСЯ.
 *
 * ЩО ЛАМАЛОСЯ. 25.08.2026 о 09:52 власнику прилетіло ЧОТИРИ однакові
 * «Прорахунок затверджено» — при ОДНОМУ рядку в `quote_status_history`. 07.08 —
 * дві копії. За 60 днів це два випадки на 224 переходи.
 *
 * ЧОМУ ІСТОРІЯ МОВЧАЛА, А БОТ КРИЧАВ. Холостий перехід (статус уже такий) база
 * ковтає мовчки й правильно: тригери історії та штампів мають
 * `when (old.status is distinct from new.status)`. А застосунок про це не
 * дізнавався — функція повертала `void`, тож «змінив» і «нічого не змінив»
 * виглядали однаково, і сповіщення йшло після КОЖНОГО виклику.
 *
 * ЧОМУ НЕ ВИСТАЧАЛО НАЯВНИХ РУБЕЖІВ. Їх було два, і обидва діряві:
 *   1. перевірка на сторінці («кинули туди, де й було») дивиться у власний стан
 *      вкладки — ні сусідньої вкладки, ні іншої людини вона не бачить;
 *   2. перевірка в `notifyQuoteInitiatorOnStatusChange` спрацьовує, лише коли їй
 *      передали `fromStatus`, а дошка й повернення з «Скасованих» його не
 *      передають — там вона просто не працює.
 * Обидва рубежі стоять ПЕРЕД записом, тож між перевіркою й записом лишається
 * щілина. Це та сама помилка, яку 31.08 виправляли на дошці дизайну.
 *
 * ЯК ТЕПЕР. Вирішує сам запис: `tosho.set_quote_status` міняє рядок з умовою
 * `status is distinct from p_new_status` і повертає `found`. Подробиці й заміри —
 * у scripts/quote-status-rpc-reports-change.sql.
 *
 * ЧОМУ ОКРЕМИЙ МОДУЛЬ. `toshoApi.ts` під ратчетом розміру, аця функція обросла
 * поясненням, яке дорожче за неї саму. Заразом її стало видно тестам: у файлі з
 * двома тисячами рядків і живим клієнтом Supabase її не перевіриш.
 */
export async function setQuoteStatus(params: {
  quoteId: string;
  status: string;
  note?: string;
}): Promise<boolean> {
  const nextStatus = params.status as Database["tosho"]["Enums"]["quote_status"];
  try {
    const { data, error } = await supabase.schema("tosho").rpc("set_quote_status", {
      p_quote_id: params.quoteId,
      p_new_status: nextStatus,
      p_note: params.note ?? undefined,
    });
    if (error) throw error;
    // `!== false`, а не `=== true`: стара версія функції повертала void, тобто
    // null. Поки міграція не доїхала на прод, вважаємо, що зміна сталась —
    // зайве сповіщення дешевше за проґавлене.
    return data !== false;
  } catch (error: unknown) {
    const message =
      typeof error === "object" && error && typeof (error as { message?: unknown }).message === "string"
        ? ((error as { message: string }).message)
        : "";
    if (!message.includes("set_quote_status")) throw error;

    // Запасний шлях (RPC немає) теж мусить відрізняти холостий перехід, інакше
    // дірка просто переїжджає сюди. Умова — у самому записі.
    const { data: rows, error: updateError } = await supabase
      .schema("tosho")
      .from("quotes")
      .update({ status: nextStatus })
      .eq("id", params.quoteId)
      .neq("status", nextStatus)
      .select("id");
    if (updateError) throw updateError;
    return (rows ?? []).length > 0;
  }
}
