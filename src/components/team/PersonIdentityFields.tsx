/**
 * Дані людини в «Огляді» картки — перегляд і редагування в одному місці.
 *
 * НАВІЩО. Ім'я, прізвище, дату виходу й день народження досі не редагував
 * НІХТО, крім самої людини, та й та — лише ім'я з днем народження у власному
 * профілі. Дата «у команді з» не редагувалась ніде взагалі: вона приїжджала
 * з інвайта, і виправити помилку в ній можна було тільки запитом у базу.
 * Керівник же бачить цю картку саме тоді, коли помилку помітив.
 *
 * ХТО МАЄ ПРАВО — вирішує сторінка (`canEdit`), а не цей компонент. RLS на
 * `tosho.team_member_profiles` однаково пустить лише власника, СЕО й саму
 * людину; галочка тут — про те, кому показувати поля, а не про безпеку.
 *
 * ЧОМУ ІМ'Я З ПРІЗВИЩЕМ ВИДНО ЛИШЕ В РЕДАГУВАННІ. У перегляді вони вже стоять
 * заголовком картки, і два зайві рядки під ним були б тим самим текстом
 * удруге. У редагуванні навпаки: правити заголовок наосліп неможливо, потрібні
 * саме поля.
 *
 * ШЛЕМО ЛИШЕ ТЕ, ЩО ФОРМА РЕДАГУЄ. `upsertWorkspaceMemberProfile` пропускає
 * `undefined`, і будь-яке «пронесене» поле зі снапшота — готовий lost update:
 * 27.07.2026 так затерли щойно завантажену аватарку.
 */

import { useMemo, useState } from "react";
import type React from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Row } from "@/components/team/PersonFactRow";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DateInput } from "@/components/ui/picker-input";
import { formatEmploymentDate, formatEmploymentDuration, getBirthdayInsight } from "@/lib/employment";
import { toFullName } from "@/lib/userName";
import {
  invalidateWorkspaceMemberDirectory,
  upsertWorkspaceMemberProfile,
  type WorkspaceMemberDirectoryRow,
} from "@/lib/workspaceMemberDirectory";

export type PersonIdentityPatch = {
  firstName: string;
  lastName: string;
  fullName: string;
  birthDate: string;
  startDate: string;
};

export function PersonIdentityFields({
  person,
  workspaceId,
  canEdit,
  actorUserId,
  trailingRows,
  onSaved,
}: {
  person: WorkspaceMemberDirectoryRow;
  workspaceId: string;
  canEdit: boolean;
  actorUserId: string | null;
  /**
   * Решта рядків «Огляду» (посада, статус, графік) — вони не редагуються, але
   * проходять ЧЕРЕЗ цей компонент, щоб футер зі «Зберегти» стояв під усією
   * таблицею. Інакше він розрізав її навпіл: поля зверху, кнопка посередині,
   * а під нею ще три рядки, які до неї не належать.
   */
  trailingRows?: React.ReactNode;
  onSaved: (patch: PersonIdentityPatch) => void;
}) {
  const [firstName, setFirstName] = useState(person.firstName);
  const [lastName, setLastName] = useState(person.lastName);
  const [birthDate, setBirthDate] = useState(person.birthDate);
  const [startDate, setStartDate] = useState(person.startDate);
  const [saving, setSaving] = useState(false);

  // Картка вміє перемикатись між людьми без перемонтування (роут той самий),
  // тож поля мають їхати за тим, кого показують, — інакше в чужу картку
  // потрапить чуже ім'я, і його ще й збережуть.
  //
  // Синхронізація йде ПІД ЧАС рендеру, а не в ефекті. Ефект малює спочатку
  // старі значення й лише потім замінює їх — на перемиканні між людьми це
  // видимий кадр із чужим іменем у полях. React радить для «стан має піти за
  // пропом» саме порівняння з попереднім значенням у тілі компонента: рендер
  // переривається й повторюється ще до того, як щось потрапить на екран.
  //
  // Порівнюємо ВСІ поля, а не лише userId: та сама людина може приїхати з
  // оновленими даними після рефетчу, і поля мусять це підхопити.
  const identityKey = [person.userId, person.firstName, person.lastName, person.birthDate, person.startDate].join("|");
  const [renderedKey, setRenderedKey] = useState(identityKey);
  if (identityKey !== renderedKey) {
    setRenderedKey(identityKey);
    setFirstName(person.firstName);
    setLastName(person.lastName);
    setBirthDate(person.birthDate);
    setStartDate(person.startDate);
  }

  const dirty =
    firstName.trim() !== person.firstName.trim() ||
    lastName.trim() !== person.lastName.trim() ||
    birthDate !== person.birthDate ||
    startDate !== person.startDate;

  // Підказки рахуємо з ПОТОЧНОГО значення поля, а не зі збереженого: коли
  // керівник виправляє дату виходу, стаж має перерахуватись одразу — інакше
  // незрозуміло, чи та це дата, яку він мав на думці.
  const birthday = useMemo(() => getBirthdayInsight(birthDate), [birthDate]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const nextFirstName = firstName.trim();
      const nextLastName = lastName.trim();
      const nextFullName = toFullName(nextFirstName, nextLastName) || person.fullName.trim();

      await upsertWorkspaceMemberProfile({
        workspaceId,
        userId: person.userId,
        firstName: nextFirstName,
        lastName: nextLastName,
        fullName: nextFullName,
        birthDate,
        startDate,
        updatedBy: actorUserId,
      });

      invalidateWorkspaceMemberDirectory(workspaceId);
      onSaved({
        firstName: nextFirstName,
        lastName: nextLastName,
        fullName: nextFullName,
        birthDate,
        startDate,
      });
      toast.success("Дані збережено");
    } catch (error: unknown) {
      toast.error("Не вдалося зберегти дані", {
        description: error instanceof Error ? error.message : "Спробуй ще раз.",
      });
    } finally {
      setSaving(false);
    }
  };

  if (!canEdit) {
    return (
      <>
        <Row
          label="У команді з"
          value={
            person.startDate ? (
              <span className="tabular-nums">{formatEmploymentDate(person.startDate)}</span>
            ) : (
              <span className="font-normal text-muted-foreground">Не вказано</span>
            )
          }
          hint={person.startDate ? formatEmploymentDuration(person.startDate) : undefined}
        />
        <Row
          // Спершу дата, і лише потім «через скільки»: у довіднику
          // питання «коли в неї день народження», а не «скільки чекати».
          label="День народження"
          value={
            birthday ? (
              <span className="tabular-nums">{birthday.dateLabel}</span>
            ) : (
              <span className="font-normal text-muted-foreground">Не вказано</span>
            )
          }
          hint={birthday ? (birthday.daysUntil === 0 ? "сьогодні" : birthday.label.toLowerCase()) : undefined}
        />
        {trailingRows}
      </>
    );
  }

  return (
    <>
      <Row
        label="Ім'я"
        value={
          <Input
            value={firstName}
            onChange={(event) => setFirstName(event.target.value)}
            placeholder="Ім'я"
            className="h-9 max-w-xs"
            aria-label="Ім'я"
          />
        }
      />
      <Row
        label="Прізвище"
        value={
          <Input
            value={lastName}
            onChange={(event) => setLastName(event.target.value)}
            placeholder="Прізвище"
            className="h-9 max-w-xs"
            aria-label="Прізвище"
          />
        }
      />
      <Row
        label="У команді з"
        value={
          <DateInput
            value={startDate}
            onChange={(event) => setStartDate(event.target.value)}
            className="h-9 max-w-xs"
            aria-label="У команді з"
          />
        }
        hint={startDate ? formatEmploymentDuration(startDate) : undefined}
      />
      <Row
        label="День народження"
        value={
          <DateInput
            value={birthDate}
            onChange={(event) => setBirthDate(event.target.value)}
            className="h-9 max-w-xs"
            aria-label="День народження"
          />
        }
        hint={birthday ? (birthday.daysUntil === 0 ? "сьогодні" : birthday.label.toLowerCase()) : undefined}
      />
      {trailingRows}
      {/*
        Футер проявляється лише при змінах: кнопка «Зберегти», що завжди
        світиться під картою перегляду, читається як «тут щось не збережено».
      */}
      {dirty ? (
        <div className="flex flex-wrap items-center gap-2 border-t border-border/60 pt-3">
          <span className="min-w-0 flex-1 text-2xs text-muted-foreground">
            Зміни побачить уся команда — ім'я стоїть у прорахунках, задачах і сповіщеннях.
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={saving}
            onClick={() => {
              setFirstName(person.firstName);
              setLastName(person.lastName);
              setBirthDate(person.birthDate);
              setStartDate(person.startDate);
            }}
          >
            Скасувати
          </Button>
          <Button size="sm" disabled={saving} onClick={() => void handleSave()}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Зберегти
          </Button>
        </div>
      ) : null}
    </>
  );
}
