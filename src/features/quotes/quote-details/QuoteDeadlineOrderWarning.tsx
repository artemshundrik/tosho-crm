import { AlertTriangle } from "lucide-react";

import { Button } from "@/components/ui/button";

import { isDesignDeadlineAfterAnswer } from "./deadlineLabels";

/**
 * Попередження: дедлайн макета пізніший за дедлайн відповіді замовнику
 * (REQ-155 p8).
 *
 * ЧОМУ ЦЕ ВЗАГАЛІ ТРЕБА КАЗАТИ. Дві дати задаються в РІЗНИХ підвкладках
 * «Дедлайнів», кожна зі своїм пікером. Щоб помітити, що вони стоять у
 * неправильному порядку, треба тримати другу дату в голові — тож роками не
 * помічали. А наслідок цілком матеріальний: КП летить клієнту без погодженого
 * візуала, і та сама розмова відбувається вдруге, вже з обіцянкою на руках.
 *
 * Правило порівняння живе в `deadlineLabels` і накрите тестами: тут лише показ.
 */
export function QuoteDeadlineOrderWarning({
  designDeadline,
  answerDeadline,
  designLabel,
  answerLabel,
  onFix,
}: {
  /** Дедлайн макета — уже з урахуванням незбережених значень у полях. */
  designDeadline: string | null;
  /** Дедлайн відповіді замовнику (у картці зветься «внутрішнім»). */
  answerDeadline: string | null;
  designLabel: string;
  answerLabel: string;
  onFix: () => void;
}) {
  if (!isDesignDeadlineAfterAnswer(designDeadline, answerDeadline)) return null;

  return (
    <div className="tone-warning-subtle mb-4 flex flex-wrap items-center gap-3 rounded-xl border px-3.5 py-3 text-sm">
      <span className="tone-warning grid h-7 w-7 shrink-0 place-items-center rounded-lg border" aria-hidden>
        <AlertTriangle className="h-3.5 w-3.5" />
      </span>
      <span className="min-w-[16rem] flex-1 leading-relaxed">
        Дедлайн макета <b className="tabular-nums font-semibold">{designLabel}</b> пізніший за дедлайн відповіді
        замовнику <b className="tabular-nums font-semibold">{answerLabel}</b> — відповідь доведеться давати без
        погодженого дизайну.
      </span>
      {/* Кнопка ВЕДЕ до дати, а не переставляє її сама: які саме дві дати
          правильні, знає менеджер, і мовчазний зсув чужого дедлайну — остання
          річ, якої тут чекають. */}
      <Button variant="outline" size="sm" className="shrink-0 bg-background" onClick={onFix}>
        Змінити дедлайн дизайну
      </Button>
    </div>
  );
}
