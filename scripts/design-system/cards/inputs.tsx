import * as React from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FormField } from "@/components/ui/form-field";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Shell, Section, Row, Caption } from "../shell";

export default function InputsCard() {
  const [name, setName] = React.useState("");
  const [archived, setArchived] = React.useState(true);
  const [tg, setTg] = React.useState(false);
  const [wfh, setWfh] = React.useState(true);
  const [kind, setKind] = React.useState<string>("");

  const nameError = name.trim() === "" ? "Заповніть назву замовника" : undefined;

  return (
    <Shell
      title="Поля вводу"
      lede={
        <>
          Справжні <code>Input</code>, <code>Textarea</code>, <code>Select</code>, <code>Checkbox</code>, <code>Switch</code> і <code>FormField</code>. Одна база стилів на всі контроли; помилка йде через <code>aria-invalid</code>, тож вигляд і читач з екрана не розходяться.
        </>
      }
    >
      <Section title="Текстові поля" hint="три розміри: sm / md / lg (lg — типовий)">
        <div className="grid max-w-md gap-3">
          <FormField label="Назва замовника" required error={nameError} hint="Помилка зникне, щойно щось введеш">
            <Input placeholder="ТОВ «Приклад»" value={name} onChange={(e) => setName(e.target.value)} />
          </FormField>
          <FormField label="Середнє поле">
            <Input controlSize="md" defaultValue="ФОП Коваленко" />
          </FormField>
          <FormField label="Мале поле">
            <Input controlSize="sm" placeholder="Пошук за назвою…" />
          </FormField>
          <FormField label="Заблоковане">
            <Input defaultValue="Недоступно" disabled />
          </FormField>
          <FormField label="Технічне завдання" hint="Enter — новий рядок">
            <Textarea rows={3} defaultValue="Друк логотипу на грудях, 1 колір." />
          </FormField>
        </div>
      </Section>

      <Section title="Список" hint="Radix Select у тому ж корпусі, що й поле">
        <div className="grid max-w-md gap-3">
          <FormField label="Напрямок">
            {({ fieldProps }) => (
              <Select value={kind} onValueChange={setKind}>
                <SelectTrigger id={fieldProps.id} className="h-9">
                  <SelectValue placeholder="Оберіть напрямок" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="merch">Мерч</SelectItem>
                  <SelectItem value="print">Поліграфія</SelectItem>
                  <SelectItem value="other">Інше</SelectItem>
                </SelectContent>
              </Select>
            )}
          </FormField>
        </div>
      </Section>

      <Section title="Прапорець" hint="Radix Checkbox: увімкнений — колір бренду, фокус із клавіатури видно">
        <div className="grid gap-2.5">
          <label className="flex w-fit cursor-pointer items-center gap-2.5">
            <Checkbox checked={archived} onCheckedChange={(v) => setArchived(v === true)} />
            <span className="text-sm">Показувати архівні</span>
          </label>
          <label className="flex w-fit cursor-pointer items-center gap-2.5">
            <Checkbox defaultChecked={false} />
            <span className="text-sm">Повідомити замовника</span>
          </label>
          <label className="flex w-fit items-center gap-2.5 opacity-100">
            <Checkbox checked disabled />
            <span className="text-sm text-muted-foreground">Заблокований, увімкнений</span>
          </label>
        </div>
      </Section>

      <Section title="Перемикач" hint="Switch: розміри sm / md, тони primary / success">
        <div className="grid gap-3">
          <Row className="gap-3">
            <Switch checked={tg} onCheckedChange={setTg} label="Сповіщення в Telegram" />
            <Label className="text-sm">Сповіщення в Telegram</Label>
          </Row>
          <Row className="gap-3">
            <Switch checked={wfh} onCheckedChange={setWfh} label="Працюю з дому" tone="success" />
            <Label className="text-sm">Працюю з дому</Label>
          </Row>
          <Row className="gap-3">
            <Switch checked={false} onCheckedChange={() => {}} label="Вимкнено" size="sm" disabled />
            <Label className="text-sm text-muted-foreground">Малий, заблокований</Label>
          </Row>
        </div>
        <Caption>Клацни — перемкнеться. Усі контроли тут справжні, з тим самим кодом, що в застосунку.</Caption>
      </Section>
    </Shell>
  );
}
