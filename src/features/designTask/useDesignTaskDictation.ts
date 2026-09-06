import { useDictationField } from "@/components/dictation/DictationButton";

/**
 * Диктування трьох полів картки дизайн-задачі: ТЗ, правка й коментар до прорахунку.
 *
 * ЧОМУ ОКРЕМИЙ МОДУЛЬ, А НЕ ДВА ВИКЛИКИ НА СТОРІНЦІ. `DesignTaskPage` стоїть
 * під ратчетом розміру, і два виклики `useDictationField` з усіма їхніми
 * полями — це двадцять рядків, які нічого не пояснюють про саму сторінку.
 * Тут вони зведені до одного виклику з коротким входом, а спільне для обох —
 * розкладка «смуга» й те, що поле лишається видимим — сказано один раз.
 *
 * ЧОМУ РОЗКЛАДКА СМУГОЮ. Обидва поля великі, і людина в них ДОПОВНЮЄ вже
 * написане: капсула, що стає на місце поля, ховала б саме те, заради чого
 * диктують.
 */
export function useDesignTaskDictation(input: {
  briefRef: React.RefObject<HTMLTextAreaElement | null>;
  briefValue: string;
  onBrief: (next: string) => void;
  onBriefInserted: () => void;
  briefDisabled: boolean;
  changeRef: React.RefObject<HTMLTextAreaElement | null>;
  changeValue: string;
  onChange: (next: string) => void;
  changeDisabled: boolean;
  commentRef: React.RefObject<HTMLTextAreaElement | null>;
  commentValue: string;
  onComment: (next: string) => void;
  commentDisabled: boolean;
}) {
  const brief = useDictationField({
    textareaRef: input.briefRef,
    value: input.briefValue,
    onChange: input.onBrief,
    onAfterInsert: input.onBriefInserted,
    context: "brief",
    disabled: input.briefDisabled,
    withStrip: true,
  });

  const changeRequest = useDictationField({
    textareaRef: input.changeRef,
    value: input.changeValue,
    onChange: input.onChange,
    context: "comment",
    disabled: input.changeDisabled,
    withStrip: true,
  });

  /* Коментар до прорахунку — теж велике поле, тож та сама смуга. */
  const quoteComment = useDictationField({
    textareaRef: input.commentRef,
    value: input.commentValue,
    onChange: input.onComment,
    context: "comment",
    disabled: input.commentDisabled,
    withStrip: true,
  });

  return { brief, changeRequest, quoteComment };
}
