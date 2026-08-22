import * as React from "react";
import { Badge } from "@/components/ui/badge";
import {
  toneBadgeClass, toneSubtleClass, toneTextClass, toneDotClass, toneIconBoxClass, toneFlagClass,
  QUOTE_STATUS_TONE, DESIGN_STATUS_TONE, type Tone,
} from "@/lib/statusTones";
import { DESIGN_STATUS_LABELS } from "@/lib/designTaskStatus";
import { Bell, Check, AlertTriangle, Info, Sparkles, Tag, Circle, XCircle } from "lucide-react";
import { Shell, Section, Row, Caption } from "../shell";

const TONES: Array<[Tone, string, string]> = [
  ["neutral", "Нейтральний", "чернетка, без стану"],
  ["info", "Інформація", "в роботі, надіслано"],
  ["accent", "Акцент", "дизайн готовий, потребує уваги"],
  ["success", "Успіх", "погоджено, сплачено"],
  ["warning", "Увага", "правки, чекає на клієнта"],
  ["danger", "Небезпека", "скасовано, протерміновано"],
  ["festive", "Святковий", "дні народження, події"],
  ["teal", "Бірюзовий", "мітки, довідкове"],
];

const QUOTE_LABELS: Record<string, string> = {
  new: "Новий", estimating: "На прорахунку", estimated: "Пораховано",
  awaiting_approval: "Погодження", approved: "Погоджено", cancelled: "Скасовано",
};

const ICONS: Record<Tone, React.ReactNode> = {
  neutral: <Circle />, info: <Info />, accent: <Sparkles />, success: <Check />,
  warning: <AlertTriangle />, danger: <XCircle />, festive: <Bell />, teal: <Tag />,
};

export default function StatusTonesCard() {
  return (
    <Shell
      title="Тони статусів"
      lede={
        <>
          <code>src/lib/statusTones.ts</code> — джерело правди «статус → тон». Шість форм одного тону; насиченість падає з площею, інакше колір читається як бруд. Статус несе і колір, і слово — колір сам по собі не є інформацією.
        </>
      }
    >
      <Section title="Статуси прорахунку" hint="Badge з tone — так їх показують дошка, список і картка">
        <Row>
          {Object.entries(QUOTE_LABELS).map(([status, label]) => (
            <Badge key={status} tone={QUOTE_STATUS_TONE[status] as Exclude<Tone, "teal">}>{label}</Badge>
          ))}
        </Row>
      </Section>

      <Section title="Статуси дизайн-задачі" hint="«Дизайн готовий» навмисно фіолетовий, не синій: сусідні етапи мусять читатись як різні кольори">
        <Row>
          {Object.entries(DESIGN_STATUS_LABELS).map(([status, label]) => (
            <Badge key={status} tone={DESIGN_STATUS_TONE[status] as Exclude<Tone, "teal">}>{label}</Badge>
          ))}
        </Row>
        <Row className="mt-2">
          {Object.entries(DESIGN_STATUS_LABELS).slice(0, 4).map(([status, label]) => (
            <Badge key={status} tone={DESIGN_STATUS_TONE[status] as Exclude<Tone, "teal">} size="md">{label}</Badge>
          ))}
          <Badge tone="success" size="md" pill>Затверджено</Badge>
        </Row>
        <Caption>Два розміри: sm — робочий (списки, канбан), md — акцентний (тулбари, шапки). pill — капс і трекінг.</Caption>
      </Section>

      <Section title="Бейдж · toneBadgeClass" hint="насичена заливка + межа + текст">
        <Row>
          {TONES.map(([t, label]) => (
            <span key={t} className={`${toneBadgeClass[t]} inline-flex items-center rounded-full border px-2.5 py-0.5 text-2xs font-semibold`}>{label}</span>
          ))}
        </Row>
      </Section>

      <Section title="Приглушений · toneSubtleClass" hint="банери, рядки, картки — широкі поверхні">
        <div className="grid gap-1.5">
          {TONES.map(([t, label, use]) => (
            <div key={t} className={`${toneSubtleClass[t]} rounded-lg border px-3 py-2 text-xs`}>
              <b>{label}</b> — {use}
            </div>
          ))}
        </div>
      </Section>

      <Section title="Текст, крапка, іконка" hint="toneTextClass · toneDotClass · toneIconBoxClass">
        <div className="grid gap-2">
          {TONES.map(([t, label]) => (
            <div key={t} className="flex items-center gap-3 text-xs">
              <span className={`${toneDotClass[t]} inline-block size-2 rounded-full`} />
              <span className={`${toneTextClass[t]} w-28 font-medium`}>{label}</span>
              <span className={`${toneIconBoxClass[t]} inline-flex size-7 items-center justify-center rounded-lg border [&_svg]:size-3.5`}>{ICONS[t]}</span>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Кант · toneFlagClass" hint="лівий кант 3px лише для широких рядів; у нейтрального, акценту, святкового й бірюзового канта немає навмисно">
        <div className="grid gap-1.5">
          {TONES.filter(([t]) => toneFlagClass[t]).map(([t, label, use]) => (
            <div key={t} className={`${toneFlagClass[t]} rounded-lg border border-border/50 bg-card px-3 py-2 text-xs`}>
              <b>{label}</b> — {use}
            </div>
          ))}
        </div>
      </Section>
    </Shell>
  );
}
