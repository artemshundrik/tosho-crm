import * as React from "react";
import { Plus, Trash2, Pencil, Download, MoreHorizontal, Search, X, Check, ArrowRight, Filter, Layers, Tag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { SegmentedGroup } from "@/components/ui/segmented-group";
import { SEGMENTED_GROUP, SEGMENTED_GROUP_SM, SEGMENTED_TRIGGER, SEGMENTED_TRIGGER_SM } from "@/components/ui/controlStyles";
import { Shell, Section, Row, Caption } from "../shell";

const VARIANTS = [
  ["primary", "Основна дія: одна на екран"],
  ["secondary", "Поруч з основною"],
  ["outline", "Третинна"],
  ["ghost", "У щільних рядах і тулбарах"],
  ["destructive", "Видалення — м'яке"],
  ["destructiveSolid", "Незворотне"],
  ["successTonal", "Підтвердження: «Сплачено», «Готово»"],
  ["link", "Перехід усередині тексту"],
  ["textMuted", "Тиха текстова дія"],
  ["textPrimary", "Текстова дія в кольорі бренду"],
] as const;

export default function ButtonsCard() {
  const [seg, setSeg] = React.useState<"list" | "board" | "calendar">("board");
  const [segSm, setSegSm] = React.useState<"flat" | "grouped">("flat");
  const [chips, setChips] = React.useState<Record<string, boolean>>({ mine: true, urgent: false, noOwner: false });
  const [loading, setLoading] = React.useState(false);

  const toggleChip = (k: string) => setChips((c) => ({ ...c, [k]: !c[k] }));

  return (
    <Shell
      title="Кнопки"
      lede={
        <>
          Справжній <code>ui/button.tsx</code>: варіант — вага й колір, розмір — кегль, висота й іконка. Наведення, натиск, фокус із клавіатури й заблокований стан — живі.
        </>
      }
    >
      <Section title="Варіанти" hint="усі — розмір md">
        <Row>
          {VARIANTS.map(([v]) => (
            <Button key={v} variant={v}>
              {v}
            </Button>
          ))}
        </Row>
        <div className="mt-3 grid grid-cols-1 gap-x-6 gap-y-1 sm:grid-cols-2">
          {VARIANTS.map(([v, use]) => (
            <div key={v} className="flex gap-3 text-3xs">
              <code className="w-32 shrink-0">{v}</code>
              <span className="text-muted-foreground">{use}</span>
            </div>
          ))}
        </div>
      </Section>

      <Section title="З іконкою" hint="іконка отримує розмір від size — ставити їй класи не треба">
        <Row>
          <Button variant="primary"><Plus />Новий прорахунок</Button>
          <Button variant="secondary"><Download />Завантажити КП</Button>
          <Button variant="outline"><Pencil />Редагувати</Button>
          <Button variant="ghost">Відкрити<ArrowRight /></Button>
          <Button variant="destructive"><Trash2 />Видалити</Button>
          <Button variant="successTonal"><Check />Сплачено</Button>
        </Row>
      </Section>

      <Section title="Лише іконка" hint="розміри iconXs / iconSm / iconMd / icon; варіанти control і controlDestructive — для тулбарів">
        <Row>
          <Button variant="secondary" size="iconXs" aria-label="Ще"><MoreHorizontal /></Button>
          <Button variant="secondary" size="iconSm" aria-label="Ще"><MoreHorizontal /></Button>
          <Button variant="secondary" size="iconMd" aria-label="Ще"><MoreHorizontal /></Button>
          <Button variant="secondary" size="icon" aria-label="Ще"><MoreHorizontal /></Button>
          <span className="mx-2 h-6 w-px bg-border" />
          <Button variant="control" size="iconMd" aria-label="Пошук"><Search /></Button>
          <Button variant="control" size="iconMd" aria-label="Очистити"><X /></Button>
          <Button variant="controlDestructive" size="iconMd" aria-label="Видалити"><Trash2 /></Button>
          <Button variant="primary" size="iconMd" aria-label="Додати"><Plus /></Button>
        </Row>
      </Section>

      <Section title="Розміри" hint="xxs → lg; у кожного свій кегль, радіус і відступ для іконки">
        <Row>
          <Button size="xxs"><Plus />xxs</Button>
          <Button size="xs"><Plus />xs</Button>
          <Button size="sm"><Plus />sm</Button>
          <Button size="md"><Plus />md</Button>
          <Button size="lg"><Plus />lg</Button>
        </Row>
      </Section>

      <Section title="Стани" hint="заблокована виглядає заблокованою, а не блідою; завантаження — спінер на місці іконки, ширина не стрибає">
        <Row>
          <Button>Звичайна</Button>
          <Button disabled>Заблокована</Button>
          <Button variant="secondary" disabled>Заблокована</Button>
          <Button loading={loading} onClick={() => { setLoading(true); setTimeout(() => setLoading(false), 1800); }}>
            <Download />{loading ? "Готую КП…" : "Натисни — завантаження"}
          </Button>
        </Row>
        <Caption>Наведення й натиск не намальовані — натисни будь-яку: натиск коротший за відпускання (110 проти 160 мс).</Caption>
      </Section>

      <Section title="Фільтр-чіпи" hint="variant=chip, стан через aria-pressed; увімкнене темнішає, а не синіє">
        <Row>
          <Button variant="chip" size="xs" aria-pressed={!chips.mine && !chips.urgent && !chips.noOwner} onClick={() => setChips({ mine: false, urgent: false, noOwner: false })}>
            Усі
          </Button>
          <Button variant="chip" size="xs" aria-pressed={chips.mine} onClick={() => toggleChip("mine")}>
            Мої
          </Button>
          <Button variant="chip" size="xs" aria-pressed={chips.urgent} onClick={() => toggleChip("urgent")}>
            Термінові
          </Button>
          <Button variant="chip" size="xs" aria-pressed={chips.noOwner} onClick={() => toggleChip("noOwner")}>
            Без виконавця
          </Button>
        </Row>
      </Section>

      <Section title="Чіп-мітка" hint="ui/chip.tsx — пасивна мітка з іконкою; active — той самий нейтральний рецепт, що в тулбарних фільтрах">
        <Row>
          <Chip icon={<Layers />}>Прорахунки</Chip>
          <Chip icon={<Tag />} active>Терміново</Chip>
          <Chip icon={<Filter />} size="sm">Фільтр</Chip>
          <Chip size="sm" active>Активний</Chip>
        </Row>
      </Section>

      <Section title="Сегментований перемикач" hint="ui/segmented-group.tsx — плашка ковзає між кнопками variant=segmented">
        <Row className="gap-4">
          <SegmentedGroup className={SEGMENTED_GROUP}>
            {([["list", "Список"], ["board", "Дошка"], ["calendar", "Календар"]] as const).map(([v, label]) => (
              <Button key={v} variant="segmented" size="xs" aria-pressed={seg === v} data-state={seg === v ? "on" : "off"} onClick={() => setSeg(v)} className={SEGMENTED_TRIGGER}>
                {label}
              </Button>
            ))}
          </SegmentedGroup>
          <SegmentedGroup className={SEGMENTED_GROUP_SM}>
            {([["flat", "Списком"], ["grouped", "Групами"]] as const).map(([v, label]) => (
              <Button key={v} variant="segmented" size="xs" aria-pressed={segSm === v} data-state={segSm === v ? "on" : "off"} onClick={() => setSegSm(v)} className={SEGMENTED_TRIGGER_SM}>
                {label}
              </Button>
            ))}
          </SegmentedGroup>
        </Row>
      </Section>
    </Shell>
  );
}
