import * as React from "react";

import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type FormFieldProps = {
  label?: React.ReactNode;
  /** Дописує зірочку до підпису. Саме поле не валідує — це робить форма. */
  required?: boolean;
  /**
   * Текст помилки. Поки він є, поле отримує `aria-invalid` — і разом з ним
   * червону рамку з `CONTROL_BASE`, а читач з екрана озвучує сам текст.
   */
  error?: string | null;
  /** Пояснення під полем. Ховається, коли зʼявляється помилка. */
  hint?: React.ReactNode;
  className?: string;
  /** Поле: або готовий елемент, або функція, якщо треба розкласти пропи самому. */
  children: React.ReactElement | ((state: FormFieldRenderState) => React.ReactNode);
};

export type FormFieldRenderState = {
  id: string;
  invalid: boolean;
  /** Готовий набір для поля — розкласти в нього при ручному рендері. */
  fieldProps: {
    id: string;
    "aria-invalid"?: true;
    "aria-describedby"?: string;
  };
};

/**
 * Підпис + поле + помилка — одним вузлом.
 *
 * ЧОМУ ЦЕ ЗʼЯВИЛОСЬ. Поля вміють показувати стан помилки (`aria-invalid` живе
 * в `CONTROL_BASE`), але жоден компонент його не проставляв — тобто червона
 * рамка існувала і не спрацьовувала ЖОДНОГО разу. Помилки натомість летіли в
 * тост: повідомлення зникає за пару секунд, а людина лишається перед формою
 * і не бачить, ЯКЕ саме поле не так заповнене.
 *
 * ЩО ЦЕ НЕ РОБИТЬ. Не валідує. Форма сама вирішує, коли помилка є, і передає
 * готовий текст — тож обвʼязку можна ставити на наявні форми поступово, не
 * переписуючи їхню логіку збереження.
 *
 * Звʼязок підпису з полем і тексту помилки з полем іде через id: клік по
 * підпису фокусує поле, а читач з екрана озвучує помилку разом із назвою.
 */
export function FormField({
  label,
  required,
  error,
  hint,
  className,
  children,
}: FormFieldProps) {
  const reactId = React.useId();
  const id = `field-${reactId}`;
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;
  const invalid = Boolean(error);
  const describedBy = invalid ? errorId : hint ? hintId : undefined;

  const fieldProps = {
    id,
    ...(invalid ? { "aria-invalid": true as const } : {}),
    ...(describedBy ? { "aria-describedby": describedBy } : {}),
  };

  return (
    // content-start обовʼязково: у сітці форм комірки тягнуться під найвищу, і
    // якщо в сусідній зʼявився рядок помилки, тут між підписом і полем виникає
    // порожнеча — поля в одному ряду перестають стояти на спільній лінії.
    <div className={cn("grid content-start gap-2", className)}>
      {label ? (
        <Label htmlFor={id}>
          {label}
          {required ? (
            <span className="ml-0.5 text-destructive" aria-hidden="true">
              *
            </span>
          ) : null}
        </Label>
      ) : null}

      {typeof children === "function"
        ? children({ id, invalid, fieldProps })
        : React.cloneElement(children, fieldProps)}

      {invalid ? (
        <p id={errorId} className="text-xs text-destructive">
          {error}
        </p>
      ) : hint ? (
        <p id={hintId} className="text-xs text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
