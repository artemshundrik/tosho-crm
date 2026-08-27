import { useCallback, useState } from "react";
import { MessageSquare } from "lucide-react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/app/ConfirmDialog";
import {
  CHANGES_GATE_HINT,
  resolveChangesGate,
  type ChangesGateInput,
  type DesignStatus,
} from "@/lib/designTaskStatus";

/**
 * «Правку ще не надіслано» — запит перед поверненням задачі дизайнеру.
 *
 * НАВІЩО. Скарга Влада 27.08.2026: менеджер пише правку, тисне «Повернути на
 * правки», задача йде дизайнеру — а правка лишається набраним текстом.
 * Дизайнер бачить статус «Правки» без жодної правки й помічає це аж тоді, коли
 * береться за роботу.
 *
 * Дірка була в тому, що до одного результату вели ДВОЄ дверей, і одні робили
 * пів справи: «Надіслати правку» надсилає правку І сама переводить у «Правки»,
 * а кнопка статусу міняла лише статус. Чернетка при цьому жива в localStorage,
 * тож втрата виглядала не як втрата: текст на місці, кнопка активна.
 *
 * ПІДТВЕРДЖЕННЯ НЕ РУЙНІВНЕ, тож і кнопка звичайна, а не червона: тут
 * пропонується зробити те, що людина й мала на увазі, а не погодитись на
 * втрату. «Повернутись до правки» лишає її у формі — та вже розгорнута під
 * діалогом і зловила курсор.
 *
 * Окремим файлом, а не рядками в картці задачі: сторінка вже 12 800 рядків, і
 * ратчет `scripts/check-file-growth.mjs` не дає їй рости далі. Правило добре:
 * діалог самодостатній і читається краще там, де його видно цілком.
 */
export function UnsentChangeRequestDialog({
  open,
  onOpenChange,
  sending,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Поки правка їде в базу — діалог не закривається й не приймає повторних натискань. */
  sending: boolean;
  onConfirm: () => void;
}) {
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Правку ще не надіслано"
      description="У ТЗ лишився набраний текст правки. Якщо повернути задачу зараз, дизайнер побачить статус «Правки» без жодної правки — саме так вона й губилась."
      confirmLabel="Надіслати правку"
      cancelLabel="Повернутись до правки"
      icon={<MessageSquare className="h-5 w-5 text-primary" />}
      loading={sending}
      onConfirm={onConfirm}
    />
  );
}


/**
 * Статуси, з яких надсилання правки САМЕ переводить задачу в «Правки».
 *
 * Живе тут, поруч із гейтом, бо саме на цьому знанні тримається орквстрація
 * нижче: з «На перевірці» й «У замовника» статус доводити не треба, з решти —
 * треба.
 */
export const CHANGE_REQUEST_AUTO_CHANGES_STATUSES = new Set<DesignStatus>(["pm_review", "client_review"]);

/**
 * Правило «не повертаємо на правки без правки» — станом і діями.
 *
 * ЧОМУ ХУКОМ, А НЕ РЯДКАМИ В КАРТЦІ ЗАДАЧІ. Правило складається з чотирьох
 * шматків: стан діалогу, розвилка, побічні дії (вкладка, форма, тост) і
 * орквстрація «надіслати, а потім за потреби довести статус». У сторінці на
 * тринадцять тисяч рядків вони розповзлись би по чотирьох далеких місцях, і
 * наступний, хто чіпатиме статуси, побачив би лише одне з них. Тут вони
 * читаються разом, а `scripts/check-file-growth.mjs` не дає їх туди повернути.
 */
/**
 * ЧОМУ `createBriefChangeRequest` ПОВЕРТАЄ `boolean`. Раніше вона нічого не
 * повертала, і це було нормально, поки її кликала сама кнопка. Тепер її кличе
 * ще й цей гейт: без відповіді «надіслалось?» ми після мовчазної відмови
 * (порожній текст, прострочений дедлайн, помилка мережі) перевели б статус так
 * само тихо, як робила стара дірка.
 *
 * ЧОМУ ГЕЙТ ЖИВЕ В `updateTaskStatus`, А НЕ НА КНОПЦІ. Дверей у «Правки»
 * четверо: вторинна кнопка смуги дій, меню статусів у «⋮», гейт естімейту і
 * канбан. Перші три сходяться в `updateTaskStatus`; канбан має власну копію —
 * так само, як гейт затвердження, і з тієї ж причини: там перехід робиться
 * перетягуванням, повз усю сторінку.
 */
export function useChangeRequestGuard(
  /** Відкрити вкладку ТЗ і форму правки: вона сама підскролиться й візьме курсор. */
  openComposer: () => void
) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [sending, setSending] = useState(false);

  /**
   * Чи треба зупинити перехід у «Правки». `true` — зупинено, статус не чіпаємо.
   *
   * Побічні дії робить сама: людина має опинитись там, де від неї чогось
   * хочуть, а не читати тост над порожнім екраном.
   */
  const blocks = useCallback(
    (gateInput: ChangesGateInput & { hasUnsentDraft: boolean }): boolean => {
      const gate = resolveChangesGate(gateInput);
      if (gate === "allow") return false;
      openComposer();
      if (gate === "ask_send_draft") setDialogOpen(true);
      else toast.error("Без правки повертати нема з чим", { description: CHANGES_GATE_HINT });
      return true;
    },
    [openComposer]
  );

  /**
   * Надіслати ненадіслану правку замість голої зміни статусу.
   *
   * Статус доводимо руками ЛИШЕ там, де надсилання не робить цього саме. І
   * тільки після успіху: після мовчазної відмови (прострочений дедлайн,
   * помилка мережі) переведений статус відтворив би рівно ту дірку, яку цей
   * гейт закриває.
   */
  const confirmSend = useCallback(
    async (act: {
      currentStatus: DesignStatus | null;
      /** Надіслати набрану правку. `true` — правка справді в базі. */
      send: () => Promise<boolean>;
      /** Перевести задачу в «Правки» в обхід цього ж гейту. */
      move: () => Promise<void>;
    }) => {
      if (sending) return;
      setSending(true);
      try {
        const sent = await act.send();
        if (!sent) return;
        setDialogOpen(false);
        if (act.currentStatus && !CHANGE_REQUEST_AUTO_CHANGES_STATUSES.has(act.currentStatus)) {
          await act.move();
        }
      } finally {
        setSending(false);
      }
    },
    [sending]
  );

  return { dialogOpen, setDialogOpen, sending, blocks, confirmSend };
}
