import * as React from "react";
import { toast } from "sonner";
import { ChevronDown, Copy, ExternalLink, Trash2, Filter, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FormField } from "@/components/ui/form-field";
import { Badge } from "@/components/ui/badge";
import { HoverTip } from "@/components/ui/hover-tip";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuItemDestructive, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Shell, Section, Row, Caption } from "../shell";

export default function OverlaysCard() {
  const [name, setName] = React.useState("");

  return (
    <Shell
      title="Спливні шари"
      lede={
        <>
          Єдині поверхні, яким система дає тінь: меню, поповер, підказка, вікно, панель, тост. Усе нижче — справжні компоненти з порталом, пасткою фокуса й закриттям по Esc.
        </>
      }
    >
      <Section title="Випадне меню" hint="DropdownMenu; дивайдер на всю ширину, небезпечна дія — останньою і окремо">
        <Row>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="secondary">Дії<ChevronDown /></Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56">
              <DropdownMenuLabel>TS-0826-0009</DropdownMenuLabel>
              <DropdownMenuItem><ExternalLink />Відкрити прорахунок</DropdownMenuItem>
              <DropdownMenuItem><Copy />Дублювати</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItemDestructive><Trash2 />Видалити</DropdownMenuItemDestructive>
            </DropdownMenuContent>
          </DropdownMenu>
        </Row>
      </Section>

      <Section title="Поповер" hint="Popover — для фільтрів і довільного вмісту">
        <Row>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="secondary"><Filter />Фільтри</Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-72 space-y-3">
              <p className="text-xs font-semibold">Період</p>
              <Input controlSize="md" defaultValue="01.08.2026 — 22.08.2026" />
              <p className="pt-1 text-xs font-semibold">Статус</p>
              <Row className="gap-1.5">
                <Badge tone="info">На прорахунку</Badge>
                <Badge tone="success">Погоджено</Badge>
              </Row>
            </PopoverContent>
          </Popover>
        </Row>
      </Section>

      <Section title="Підказка" hint="HoverTip: наведи; із ready-гейтом, щоб напівпорожня картка не «стрибала»">
        <Row>
          <HoverTip label="Замовник: ТОВ «Приклад», менеджер Іван С.">
            <Button variant="ghost" size="sm"><Info />Наведи на мене</Button>
          </HoverTip>
          <HoverTip label="Термін здачі 25 серпня, лишилось 3 дні" side="bottom">
            <Badge tone="warning">25 серп.</Badge>
          </HoverTip>
        </Row>
      </Section>

      <Section title="Модальне вікно" hint="Dialog: тінь elevated-lg; спробуй закрити кліком повз із заповненим полем — спитає підтвердження">
        <Row>
          <Dialog>
            <DialogTrigger asChild>
              <Button>Новий прорахунок</Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[480px]" isDirty={name.trim() !== ""}>
              <DialogHeader>
                <DialogTitle>Новий прорахунок</DialogTitle>
                <DialogDescription>Заповни замовника — решту можна пізніше.</DialogDescription>
              </DialogHeader>
              <div className="grid gap-3">
                <FormField label="Замовник" required>
                  <Input placeholder="Почни вводити назву" value={name} onChange={(e) => setName(e.target.value)} />
                </FormField>
                <FormField label="Коментар">
                  <Textarea rows={2} placeholder="Що важливо знати дизайнеру" />
                </FormField>
              </div>
              <DialogFooter>
                <Button variant="ghost">Скасувати</Button>
                <Button onClick={() => toast.success("Прорахунок створено")}>Створити</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </Row>
      </Section>

      <Section title="Бічна панель" hint="Sheet: тінь elevated-panel, прокручується лише середина">
        <Row>
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="secondary">Відкрити картку</Button>
            </SheetTrigger>
            <SheetContent side="right">
              <SheetHeader>
                <SheetTitle>TS-0826-0009</SheetTitle>
                <SheetDescription>ТОВ «Приклад» · 12 позицій · 13 тиражів</SheetDescription>
              </SheetHeader>
              <SheetBody>
                <div className="grid gap-3 text-sm">
                  <Row><Badge tone="success">Погоджено</Badge><Badge tone="neutral">Мерч</Badge></Row>
                  <p className="text-muted-foreground">Тут живе те, що відкривається збоку й не потребує всієї сторінки: картка, фільтри, історія.</p>
                </div>
              </SheetBody>
            </SheetContent>
          </Sheet>
        </Row>
      </Section>

      <Section title="Тост" hint="sonner, змонтований глобально; тінь overlay">
        <Row>
          <Button variant="secondary" size="sm" onClick={() => toast.success("Курс валют оновлено")}>Успіх</Button>
          <Button variant="secondary" size="sm" onClick={() => toast.error("Не вдалось зберегти — спробуй ще раз")}>Помилка</Button>
          <Button variant="secondary" size="sm" onClick={() => toast("Усі сповіщення прочитані")}>Нейтральний</Button>
        </Row>
        <Caption>Тост з'являється в куті цієї ж теми.</Caption>
      </Section>
    </Shell>
  );
}
