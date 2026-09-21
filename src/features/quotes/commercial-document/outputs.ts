/**
 * Виходи документа, яким потрібен браузер: друк через прихований iframe і
 * завантаження файла.
 *
 * ЧОМУ ОКРЕМО ВІД `document.ts`. Там чисті функції, які збирають розмітку й
 * таблицю; тут — те, що без DOM не існує. Розділення не косметичне: `document.ts`
 * покритий тестами у vitest, а ці дві функції в тому середовищі просто не мають
 * що робити.
 *
 * ЧОМУ НЕ В СТОРІНЦІ. Обидві жили замиканнями в `QuotesPage`, і коли документ
 * знадобився ще й у картці прорахунку (REQ-296#p2), копія поїхала б слідом.
 */

/** Зберегти вміст у файл під заданим іменем. */
export const downloadBlob = (filename: string, blob: Blob) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
};

/**
 * Надрукувати готовий HTML, не покидаючи сторінки.
 *
 * Прихований iframe, а не `window.open`: нове вікно блокують спливаючі
 * блокувальники, а користувач бачив би порожню вкладку. Пауза в 120 мс перед
 * `print()` — щоб встигли стати на місце шрифти й картинки: без неї друк ловив
 * документ із порожніми фото. Прибирання через хвилину, а не одразу після
 * `print()`: діалог друку тримає документ, і зникнення iframe його обриває.
 */
export const printCommercialHtml = (html: string) => {
  const iframe = document.createElement("iframe");
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";
  iframe.setAttribute("aria-hidden", "true");
  document.body.appendChild(iframe);
  iframe.srcdoc = html;
  iframe.onload = () => {
    const printWindow = iframe.contentWindow;
    if (!printWindow) return;
    printWindow.focus();
    window.setTimeout(() => {
      printWindow.print();
    }, 120);
  };
  window.setTimeout(() => {
    iframe.remove();
  }, 60_000);
};
