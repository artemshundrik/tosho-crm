/**
 * Картка людини — ОДНА поверхня на два входи.
 *
 * НАВІЩО. Людський домен був розрізаний навпіл і водночас продубльований:
 * «Команда» показувала картки, які нікуди не вели, а все, що можна дізнатись
 * про людину, лежало в правій панелі «Ролей і доступів» — тобто за модулем,
 * якого в більшості немає. Через це один і той самий співробітник існував у
 * двох списках, а профіль, доступи й оплата були трьома вкладками всередині
 * третього місця.
 *
 * Тепер маршрут `/team/:userId` відкривається З ОБОХ світів: із соціальної
 * «Команди» і з адмін-центру. Що саме людина побачить, вирішує не вхід, а
 * ГЛЯДАЧ: розділи з ключем нижче показуються лише тим, хто має на них право,
 * і рівно за тими ж умовами, що діяли в панелі (`visiblePersonSections`).
 * Це патерн Rippling: один профіль, склад якого залежить від того, хто дивиться.
 *
 * Редактор доступів тут ОДИН на застосунок — саме тому запис ролей винесено в
 * `src/features/team/personRoles.ts`. Матриця на сторінці доступів буде другим
 * ВХОДОМ у ці самі дані, а не другою копією.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  KeyRound,
  Loader2,
  Lock,
  Mail,
  Phone,
  RotateCcw,
  ShieldAlert,
} from "lucide-react";
import { toast } from "sonner";

import { useAuth } from "@/auth/AuthProvider";
import { AvatarBase } from "@/components/app/avatar-kit";
import { ConfirmDialog } from "@/components/app/ConfirmDialog";
import { MemberPaySection } from "@/components/team/MemberPaySection";
import { MODULE_ICONS, MODULES_WITHOUT_MENU_ITEM } from "@/components/team/moduleIcons";
import { PersonActivityHeatmap } from "@/components/team/PersonActivityHeatmap";
import { PersonAccessHistorySection, PersonActivitySection } from "@/components/team/PersonDetailSections";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { getCanonicalAvatarReference } from "@/lib/avatarUrl";
import { getCurrentUserId } from "@/lib/currentUser";
import { supabase } from "@/lib/supabaseClient";
import {
  displayEmploymentStatus,
  employmentStatusTone,
  formatEmploymentDate,
  formatEmploymentDuration,
  getBirthdayInsight,
  getEmploymentStatusLabel,
  isInactiveEmployment,
  normalizeEmploymentStatus,
} from "@/lib/employment";
import { formatJobRole, JOB_ROLE_NAMES } from "@/lib/jobRoles";
import { pluralUk } from "@/lib/lastSeen";
import {
  describeModuleLock,
  defaultModuleAccess,
  MODULE_GROUPS,
  MODULE_KEYS,
  normalizeModuleAccess,
  type ModuleAccess,
  type ModuleKey,
} from "@/lib/moduleAccess";
import { cn } from "@/lib/utils";
import { resolveWorkspaceId } from "@/lib/workspace";
import {
  invalidateWorkspaceMemberDirectory,
  listWorkspaceMemberDirectory,
  upsertWorkspaceMemberProfile,
  type WorkspaceMemberDirectoryRow,
} from "@/lib/workspaceMemberDirectory";
import { ACCESS_LEVELS, accessLevelLabel, savePersonRoles } from "@/features/team/personRoles";

const AVATAR_BUCKET = (import.meta.env.VITE_SUPABASE_AVATAR_BUCKET as string | undefined) || "avatars";

type SectionKey = "overview" | "access" | "pay" | "activity" | "hr";

const SECTION_LABELS: Record<SectionKey, string> = {
  overview: "Огляд",
  access: "Доступи",
  pay: "Оплата",
  activity: "Активність",
  hr: "HR",
};

/**
 * Приглушене число біля назви вкладки — як у картці прорахунку.
 * Показує обсяг, не змушуючи відкривати: скільки модулів, скільки дій.
 */
const SECTION_BADGES: Partial<Record<SectionKey, string>> = {
  access: `${MODULE_GROUPS.reduce((sum, group) => sum + group.modules.length, 0)} модулів`,
};

const JOB_ROLE_OPTIONS = [
  { value: "none", label: "Без посади" },
  ...Object.entries(JOB_ROLE_NAMES).map(([value, label]) => ({ value, label })),
];

/** Підпис-мікрозаголовок у мові «Релізів» і «Стеку». */
const CAP = "text-3xs font-semibold uppercase tracking-widest text-muted-foreground";
const CARD = "rounded-2xl border border-border/60 bg-card";

/**
 * Рядок «підпис → значення» з трьома рівнями ваги.
 *
 * ЧОМУ САМЕ ТАК. Спершу підпис був великими літерами того ж кеглю, що й
 * значення, — око не знало, куди дивитись, і рядок читався як суцільна сіра
 * смуга. Тепер ваги три: підпис дрібний і приглушений, значення на 15 px
 * напівжирним, а `hint` — уточнення просто за ним («266 днів» після дати).
 * `meta` притискається праворуч: третій за важливістю факт, який не має
 * розривати пару підпис→значення.
 */
function Row({
  label,
  value,
  hint,
  meta,
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  meta?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-4 gap-y-0.5 border-t border-border/40 py-2 first:border-t-0">
      <span className="w-[8.5rem] shrink-0 text-2xs leading-5 text-muted-foreground">{label}</span>
      <span className="min-w-0 flex-1 text-[15px] font-semibold leading-snug tracking-[-0.01em] text-foreground">
        {value}
        {hint ? <span className="ml-1.5 text-2xs font-normal text-muted-foreground">{hint}</span> : null}
      </span>
      {meta ? <span className="text-2xs text-muted-foreground">{meta}</span> : null}
    </div>
  );
}

/**
 * Компактний рядок рейки. Вужчий за `Row` у змісті: у 19 rem підпис на 9.5 rem
 * не лишає значенню місця, а обрізана пошта в рейці — це рейка без сенсу.
 */
function RailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline gap-3 border-b border-border/40 py-1.5 last:border-b-0">
      <span className="w-[5.5rem] shrink-0 text-2xs text-muted-foreground">{label}</span>
      <span className="min-w-0 flex-1 text-[13px] font-medium text-foreground">{value}</span>
    </div>
  );
}

function SectionCard({
  title,
  audience,
  children,
  action,
}: {
  title: string;
  audience?: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <section className={cn(CARD, "flex flex-col gap-3.5 p-4")}>
      <header className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        {action}
        {/* Хто ще це бачить — питання, яке інакше доводиться тримати в голові. */}
        {audience ? <span className="ml-auto text-2xs text-muted-foreground">{audience}</span> : null}
      </header>
      {children}
    </section>
  );
}

export default function PersonProfilePage() {
  const { userId: routeUserId } = useParams<{ userId: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { accessRole, jobRole, teamId, userId: viewerUserId } = useAuth();

  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [rows, setRows] = useState<WorkspaceMemberDirectoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [section, setSection] = useState<SectionKey>("overview");
  /**
   * Завершення співпраці переїхало сюди з адмін-центру: там воно жило в панелі
   * людини, а панель замінила ця сторінка. Рішення про людину має бути в її
   * картці, а не в списку — з нього не видно, кого саме звільняють.
   */
  const [employmentDecision, setEmploymentDecision] = useState<"inactive" | "reactivate" | null>(null);
  const [employmentBusy, setEmploymentBusy] = useState(false);

  const isOwner = (accessRole ?? "").trim().toLowerCase() === "owner";
  const isAdmin = (accessRole ?? "").trim().toLowerCase() === "admin";
  const isSeo = (jobRole ?? "").trim().toLowerCase() === "seo";
  /** Ті самі умови, що керували розділами панелі, — щоб доступ не поїхав. */
  const canManage = isOwner || isAdmin;
  const canOpenProfileCard = canManage || isOwner || isSeo;
  const canSeePay = isOwner || isSeo;
  const isSelf = Boolean(viewerUserId && routeUserId && viewerUserId === routeUserId);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const id = await resolveWorkspaceId(await getCurrentUserId());
        if (cancelled) return;
        setWorkspaceId(id);
        if (!id) {
          setLoadError("Не вдалося визначити робочий простір");
          return;
        }
        const directory = await listWorkspaceMemberDirectory(id);
        if (cancelled) return;
        setRows(directory);
        setLoadError(null);
      } catch (error: unknown) {
        if (!cancelled) setLoadError(error instanceof Error ? error.message : "Не вдалося завантажити людину");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [routeUserId]);

  const person = useMemo(
    () => rows.find((row) => row.userId === routeUserId) ?? null,
    [rows, routeUserId]
  );

  const applyEmploymentDecision = useCallback(
    async (decision: "inactive" | "reactivate") => {
      if (!person || !workspaceId) return;
      setEmploymentBusy(true);
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const accessToken = sessionData.session?.access_token;
        if (!accessToken) throw new Error("Не вдалося підтвердити авторизацію");

        const response = await fetch("/.netlify/functions/team-member-employment", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
          body: JSON.stringify({ userId: person.userId, decision }),
        });
        const payload = (await response.json().catch(() => null)) as
          | { error?: string; profile?: { employmentStatus?: string | null } }
          | null;
        if (!response.ok) {
          throw new Error(payload?.error || `Не вдалося оновити статус співпраці (HTTP ${response.status})`);
        }

        const nextStatus = normalizeEmploymentStatus(payload?.profile?.employmentStatus, null);
        setRows((prev) =>
          prev.map((row) => (row.userId === person.userId ? { ...row, employmentStatus: nextStatus } : row))
        );
        invalidateWorkspaceMemberDirectory(workspaceId);
        toast.success(decision === "inactive" ? "Співпрацю завершено" : "Співробітника повернуто в штат");
        setEmploymentDecision(null);
      } catch (error: unknown) {
        toast.error("Не вдалося оновити статус співпраці", {
          description: error instanceof Error ? error.message : undefined,
        });
      } finally {
        setEmploymentBusy(false);
      }
    },
    [person, workspaceId]
  );

  /** Хто саме змінив доступ — імена беремо з довідника, а не з журналу. */
  const resolveActorName = useCallback(
    (actorUserId: string | null, fallback: string | null) =>
      rows.find((row) => row.userId === actorUserId)?.displayName || fallback || "Невідомо",
    [rows]
  );

  const visibleSections = useMemo(() => {
    const keys: SectionKey[] = ["overview"];
    if (canOpenProfileCard) keys.push("access");
    if (canSeePay) keys.push("pay");
    /**
     * Хронологію чужих дій показуємо лише тим, хто й досі її бачив, — і кожному
     * його власну. Профіль тепер відкритий усій команді, тож «як було в панелі»
     * тут означало б віддати стрічку дій колеги всім підряд.
     */
    if (canOpenProfileCard || isSelf) keys.push("activity");
    if (canOpenProfileCard) keys.push("hr");
    return keys;
  }, [canOpenProfileCard, canSeePay, isSelf]);

  /**
   * `?section=access` — щоб «Змінити доступи» з адмін-центру відкривало одразу
   * потрібний розділ, а не «Огляд», з якого треба ще раз клікати.
   */
  useEffect(() => {
    const wanted = searchParams.get("section") as SectionKey | null;
    if (wanted && visibleSections.includes(wanted)) setSection(wanted);
  }, [searchParams, visibleSections]);

  useEffect(() => {
    if (!visibleSections.includes(section)) setSection("overview");
  }, [visibleSections, section]);

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-sm text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        Завантаження…
      </div>
    );
  }

  if (loadError || !person) {
    return (
      <div className={cn(CARD, "mx-auto mt-6 max-w-lg p-6 text-center")}>
        <p className="text-sm font-semibold text-foreground">
          {loadError ? "Не вдалося відкрити картку" : "Такої людини немає"}
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          {loadError ?? "Можливо, співробітника видалили або посилання застаріло."}
        </p>
        <Button variant="secondary" className="mt-4" onClick={() => navigate("/team")}>
          До команди
        </Button>
      </div>
    );
  }

  const employment = displayEmploymentStatus(person.employmentStatus);
  const inactive = isInactiveEmployment(person.employmentStatus);
  const birthday = getBirthdayInsight(person.birthDate);

  return (
    /**
     * Вужче за повну ширину — як «Релізи».
     *
     * Це картка ОДНІЄЇ людини, а не реєстр: на 27" рядок «Пошта» розтягувався
     * через пів екрана, і око не знаходило пару підпис→значення. 1180 px —
     * та сама межа, що в «Релізах», щоб сторінки не сперечались між собою.
     */
    <div className="mx-auto flex w-full max-w-[1180px] flex-col gap-5 pb-12">
      <Link
        to="/team"
        className="inline-flex w-fit items-center gap-1.5 text-2xs font-medium uppercase tracking-widest text-muted-foreground transition-colors duration-base hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Команда
      </Link>

      {/*
        Шапка — блок особистості: аватар великий, решта підпорядкована йому.
        Аватар і імʼя звʼязані в одну групу навмисно: коли вони були трьома
        рівноправними елементами `flex-wrap`, на телефоні кнопки ставали поруч
        з аватаром, блок імені стискався до нуля — і `truncate` ховав імʼя
        цілком. Тепер група займає весь рядок, а кнопки переносяться під неї.
      */}
      <header className="flex flex-wrap items-start gap-x-5 gap-y-4">
        <div className="flex w-full min-w-0 items-start gap-4 sm:w-auto sm:flex-1">
        <AvatarBase
          /**
           * ОБИДВА джерела. У частини людей заповнений `avatarUrl`, у частини —
           * лише `avatarPath` (шлях у сховищі): передавши одне, ми показували
           * ініціали замість фото рівно половині команди.
           */
          src={getCanonicalAvatarReference(
            { avatarUrl: person.avatarUrl, avatarPath: person.avatarPath },
            AVATAR_BUCKET
          )}
          name={person.displayName}
          fallback={person.initials}
          assetVariant="md"
          size={72}
          shape="circle"
          className="border-border bg-muted/50"
          fallbackClassName="text-lg font-bold"
          availability={person.availabilityStatus}
          inactive={inactive}
        />
        <div className="min-w-0 flex-1">
          <h1
            className={cn(
              "truncate text-[22px] font-semibold leading-tight tracking-tight text-foreground",
              inactive && "text-muted-foreground line-through"
            )}
          >
            {person.displayName}
          </h1>
          <p className="mt-1 truncate text-sm text-muted-foreground">
            {formatJobRole(person.jobRole) || "Без посади"}
            {person.email ? <span className="text-muted-foreground/60"> · {person.email}</span> : null}
          </p>
          <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
            <Badge tone={employmentStatusTone(employment)} size="sm">
              {getEmploymentStatusLabel(employment)}
            </Badge>
            {(person.accessRole ?? "member") !== "member" ? (
              <Badge tone="accent" size="sm">
                {accessLevelLabel(person.accessRole)}
              </Badge>
            ) : null}
            {person.absenceToday ? (
              <Badge tone="warning" size="sm">
                Відсутній сьогодні
              </Badge>
            ) : null}
          </div>
        </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {person.phone ? (
            <Button variant="outline" size="sm" asChild>
              <a href={`tel:${person.phone.replace(/\s/g, "")}`}>
                <Phone className="h-4 w-4" />
                Подзвонити
              </a>
            </Button>
          ) : null}
          {person.email ? (
            <Button variant="outline" size="sm" asChild>
              <a href={`mailto:${person.email}`}>
                <Mail className="h-4 w-4" />
                Написати
              </a>
            </Button>
          ) : null}
        </div>
      </header>

      {/*
        Вкладки — підкресленням, як у картці прорахунку.
        Рамкові пігулки давали другу сітку поверх шапки: пʼять коробок у ряд
        читались як пʼять кнопок дії, і активна губилась серед них. Тут активна
        тримається вагою тексту й тонкою рискою знизу.
      */}
      <div className="-mx-1 border-b border-border/60 px-1">
        <div className="flex gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {visibleSections.map((key) => {
            const active = section === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setSection(key)}
                aria-pressed={active}
                className={cn(
                  "relative inline-flex h-11 shrink-0 cursor-pointer items-center gap-2 px-3 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20",
                  "after:absolute after:inset-x-2 after:-bottom-px after:h-0.5 after:rounded-full after:transition-colors",
                  active
                    ? "font-semibold text-foreground after:bg-primary"
                    : "font-medium text-muted-foreground after:bg-transparent hover:text-foreground"
                )}
              >
                <span>{SECTION_LABELS[key]}</span>
                {SECTION_BADGES[key] ? (
                  <span
                    className={cn(
                      "text-2xs tabular-nums",
                      active ? "text-muted-foreground" : "text-muted-foreground/75"
                    )}
                  >
                    {SECTION_BADGES[key]}
                  </span>
                ) : null}
                {key !== "overview" ? <Lock className="h-3 w-3 text-muted-foreground/60" /> : null}
              </button>
            );
          })}
        </div>
      </div>

      {/*
        Зміст ліворуч, стала рейка праворуч — каркас картки прорахунку.
        Контакти й «коли був» потрібні на БУДЬ-ЯКІЙ вкладці: керівник відкриває
        «Доступи», а тоді хоче подзвонити — і раніше мусив вертатись на «Огляд».
      */}
      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,19rem)]">
      <div className="flex min-w-0 flex-col gap-4">
          {section === "overview" ? (
            <SectionCard title="Огляд" audience="бачить уся команда">
              {/*
                Контакти переїхали в рейку — вони потрібні на кожній вкладці, а
                не лише тут. У «Огляді» лишилось те, що описує людину в компанії:
                скільки вона тут, коли в неї свято, у якому вона стані.
              */}
              <div className="flex flex-col">
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
                  label="День народження"
                  // Спершу дата, і лише потім «через скільки»: у довіднику
                  // питання «коли в неї день народження», а не «скільки чекати».
                  value={
                    birthday ? (
                      <span className="tabular-nums">{birthday.dateLabel}</span>
                    ) : (
                      <span className="font-normal text-muted-foreground">Не вказано</span>
                    )
                  }
                  hint={
                    birthday
                      ? birthday.daysUntil === 0
                        ? "сьогодні"
                        : birthday.label.toLowerCase()
                      : undefined
                  }
                />
                <Row label="Посада" value={formatJobRole(person.jobRole) || "Без посади"} />
                <Row
                  label="Статус співпраці"
                  value={
                    <Badge tone={employmentStatusTone(employment)} size="sm">
                      {getEmploymentStatusLabel(employment)}
                    </Badge>
                  }
                />
              </div>
            </SectionCard>
          ) : null}

          {section === "access" && workspaceId ? (
            <PersonAccessSection
              key={person.userId}
              person={person}
              workspaceId={workspaceId}
              teamId={teamId}
              canManage={canManage}
              isOwner={isOwner}
              isSeo={isSeo}
              isSelf={isSelf}
              resolveActorName={resolveActorName}
              onSaved={(nextAccessRole, nextJobRole) => {
                setRows((prev) =>
                  prev.map((row) =>
                    row.userId === person.userId
                      ? { ...row, accessRole: nextAccessRole, jobRole: nextJobRole }
                      : row
                  )
                );
              }}
            />
          ) : null}

          {section === "pay" ? (
            <MemberPaySection
              workspaceId={workspaceId}
              userId={person.userId}
              memberName={person.displayName}
              isDesigner={(person.jobRole ?? "").toLowerCase() === "designer"}
              canEdit={canSeePay}
            />
          ) : null}

          {section === "activity" ? <PersonActivitySection userId={person.userId} /> : null}

          {section === "hr" ? (
            <SectionCard title="HR" audience="бачать керівники">
              <div className="flex flex-col">
                <Row
                  label="Стаж"
                  value={
                    person.startDate ? (
                      formatEmploymentDuration(person.startDate)
                    ) : (
                      <span className="font-normal text-muted-foreground">Дата старту не вказана</span>
                    )
                  }
                  hint={person.startDate ? `з ${formatEmploymentDate(person.startDate)}` : undefined}
                />
                <Row
                  label="Статус співпраці"
                  value={
                    <Badge tone={employmentStatusTone(employment)} size="sm">
                      {getEmploymentStatusLabel(employment)}
                    </Badge>
                  }
                />
                <Row
                  label="Відсутність"
                  value={
                    person.absenceToday ? (
                      "Відсутній сьогодні"
                    ) : (
                      <span className="font-normal text-muted-foreground">Немає чинної</span>
                    )
                  }
                  meta="залишки відпусток — на сторінці «Команда»"
                />
              </div>
              {canManage && !isSelf ? (
                <div className="flex flex-wrap items-center gap-3 border-t border-border/60 pt-3">
                  <p className="min-w-0 flex-1 text-2xs leading-relaxed text-muted-foreground">
                    {employment === "inactive"
                      ? "Співпрацю завершено. За потреби людину можна повернути в штат."
                      : "Людина працює у штаті. Якщо вона пішла або її звільнили, тут можна завершити співпрацю."}
                  </p>
                  <Button
                    variant={employment === "inactive" ? "secondary" : "destructive"}
                    size="sm"
                    disabled={employmentBusy}
                    onClick={() => setEmploymentDecision(employment === "inactive" ? "reactivate" : "inactive")}
                  >
                    {employmentBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    {employment === "inactive" ? "Повернути в штат" : "Завершити співпрацю"}
                  </Button>
                </div>
              ) : null}
            </SectionCard>
          ) : null}
        </div>

        {/*
          Рейка — сталий контекст людини: як до неї достукатись і коли вона
          була. Ці три речі потрібні незалежно від того, яку вкладку відкрито,
          тож вони не належать жодній із них.
        */}
        <aside className="flex flex-col gap-3 lg:sticky lg:top-2">
          <section className={cn(CARD, "flex flex-col gap-1 p-4")}>
            <span className={cn(CAP, "pb-1")}>Як звʼязатись</span>
            <RailRow
              label="Телефон"
              value={
                person.phone ? (
                  <a href={`tel:${person.phone.replace(/\s/g, "")}`} className="tabular-nums underline-offset-4 hover:underline">
                    {person.phone}
                  </a>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )
              }
            />
            <RailRow
              label="Пошта"
              value={
                person.email ? (
                  <a href={`mailto:${person.email}`} className="block truncate underline-offset-4 hover:underline">
                    {person.email}
                  </a>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )
              }
            />
            <RailRow
              label="Присутність"
              value={
                person.absenceToday ? (
                  <span className="text-warning-foreground">Відсутній сьогодні</span>
                ) : inactive ? (
                  <span className="text-muted-foreground">Співпрацю завершено</span>
                ) : (
                  <span className="tone-text-success">На місці</span>
                )
              }
            />
          </section>

          {/*
            Ритм за квартал — під контактами, бо це друге питання про людину
            після «як достукатись»: чи вона взагалі зараз у роботі.
          */}
          {canOpenProfileCard || isSelf ? (
            <section className={cn(CARD, "flex flex-col gap-2 p-4")}>
              <span className={cn(CAP, "pb-0.5")}>Ритм роботи</span>
              <PersonActivityHeatmap userId={person.userId} />
            </section>
          ) : null}

          {canOpenProfileCard ? (
            <section className={cn(CARD, "flex flex-col gap-1 p-4")}>
              <span className={cn(CAP, "pb-1")}>Доступи</span>
              <RailRow label="Рівень" value={accessLevelLabel(person.accessRole)} />
              <RailRow label="Посада" value={formatJobRole(person.jobRole) || "Без посади"} />
              {section !== "access" ? (
                <button
                  type="button"
                  onClick={() => setSection("access")}
                  className="mt-1.5 w-fit cursor-pointer text-2xs font-medium text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
                >
                  Змінити доступи →
                </button>
              ) : null}
            </section>
          ) : null}
        </aside>
      </div>

      <ConfirmDialog
        open={employmentDecision !== null}
        onOpenChange={(open) => {
          if (!open && !employmentBusy) setEmploymentDecision(null);
        }}
        title={employmentDecision === "reactivate" ? "Повернути в штат?" : "Завершити співпрацю?"}
        description={
          employmentDecision === "reactivate"
            ? `${person.displayName} знову вважатиметься чинним співробітником.`
            : `Для ${person.displayName} буде зафіксовано, що співпрацю завершено. Доступи при цьому не знімаються — це окрема дія.`
        }
        icon={<AlertTriangle className="h-5 w-5 text-danger-foreground" />}
        confirmLabel={employmentDecision === "reactivate" ? "Так, повернути" : "Так, завершити"}
        confirmClassName={
          employmentDecision === "reactivate"
            ? undefined
            : "bg-destructive text-destructive-foreground hover:bg-destructive/90"
        }
        loading={employmentBusy}
        onConfirm={() => {
          if (employmentDecision) void applyEmploymentDecision(employmentDecision);
        }}
      />
    </div>
  );
}

/**
 * Доступи людини — рівень, посада й модулі.
 *
 * Стан перемикача бере реєстр (`describeModuleLock`), а не сторінка: там, де
 * рішення ухвалює роль або сама база, перемикач заблокований і поруч написано
 * ЧОМУ. Локальні `if`-и тут колись і розвели сторінку доступів із меню.
 */
function PersonAccessSection({
  person,
  workspaceId,
  teamId,
  canManage,
  isOwner,
  isSeo,
  isSelf,
  resolveActorName,
  onSaved,
}: {
  person: WorkspaceMemberDirectoryRow;
  workspaceId: string;
  teamId: string | null;
  canManage: boolean;
  isOwner: boolean;
  isSeo: boolean;
  isSelf: boolean;
  resolveActorName: (actorUserId: string | null, fallback: string | null) => string;
  onSaved: (accessRole: string | null, jobRole: string | null) => void;
}) {
  const savedAccess = useMemo(
    () => normalizeModuleAccess(person.moduleAccess, person.accessRole, person.jobRole),
    [person.moduleAccess, person.accessRole, person.jobRole]
  );

  const [accessLevel, setAccessLevel] = useState((person.accessRole ?? "member").trim().toLowerCase() || "member");
  const [job, setJob] = useState(person.jobRole || "none");
  const [modules, setModules] = useState<ModuleAccess>(savedAccess);
  const [busy, setBusy] = useState(false);

  /**
   * Два різні дозволи, бо їх дають різні сторожі.
   *
   * РОЛІ пише серверна функція `create-workspace-invite` — вона пускає owner і
   * admin (`canManageTeam`), забороняючи міняти себе, призначати власника й
   * чіпати власника.
   *
   * МОДУЛІ лежать на рядку профілю, і його ріже RLS: `team_member_profiles`
   * дозволяє запис лише самому собі, власнику або CEO. Адміністратор без CEO
   * туди не пише — тож і перемикач йому показуємо заблокованим. Раніше кнопка
   * була активна й падала помилкою на збереженні: рівно той випадок, коли
   * контрол обіцяє те, чого не може.
   *
   * Своїх доступів не редагує ніхто: адміністратор, який зняв би собі права,
   * втратив би й спосіб їх повернути.
   */
  const targetIsOwner = (person.accessRole ?? "") === "owner";
  const canEditRoles = canManage && !isSelf && (isOwner || !targetIsOwner);
  const canEditModules = (isOwner || isSeo) && !isSelf && (isOwner || !targetIsOwner);
  const canEdit = canEditRoles || canEditModules;

  /** Дефолт ПОСАДИ — щоб було видно, де людина від нього відхилилась. */
  const roleDefaults = useMemo(
    () => defaultModuleAccess({ accessRole: accessLevel === "member" ? null : accessLevel, jobRole: job === "none" ? null : job }),
    [accessLevel, job]
  );

  const deviations = useMemo(
    () =>
      (Object.keys(modules) as ModuleKey[]).filter((key) => {
        const lock = describeModuleLock(key, modules, {
          accessRole: person.accessRole,
          jobRole: person.jobRole,
        });
        return !lock.locked && modules[key] !== roleDefaults[key];
      }),
    [modules, roleDefaults, person.accessRole, person.jobRole]
  );

  const rolesDirty =
    accessLevel !== ((person.accessRole ?? "member").trim().toLowerCase() || "member") ||
    job !== (person.jobRole || "none");
  const modulesDirty = (Object.keys(modules) as ModuleKey[]).some((key) => modules[key] !== savedAccess[key]);
  const dirty = (canEditRoles && rolesDirty) || (canEditModules && modulesDirty);

  /** Скільки пунктів меню людина справді побачить — з урахуванням замків. */
  const openCount = useMemo(
    () =>
      MODULE_KEYS.filter(
        (key) =>
          describeModuleLock(key, modules, { accessRole: person.accessRole, jobRole: person.jobRole })
            .checked
      ).length,
    [modules, person.accessRole, person.jobRole]
  );

  const resetToRole = useCallback(() => setModules(roleDefaults), [roleDefaults]);

  const save = async () => {
    if (!canEdit) return;
    setBusy(true);
    try {
      /**
       * Пишемо рівно те, на що цей глядач має право, — інакше запит однаково
       * впаде на сторожі, але вже після того, як людина натиснула «Зберегти».
       */
      const roles = canEditRoles
        ? await savePersonRoles({
            workspaceId,
            teamId,
            userId: person.userId,
            currentAccessRole: person.accessRole,
            currentJobRole: person.jobRole,
            nextAccessRole: accessLevel,
            nextJobRole: job,
          })
        : null;
      if (canEditModules) {
        // Модулі живуть на рядку профілю, а не в членстві, тож це другий запис.
        // Шлемо ЛИШЕ moduleAccess: усе інше в цій формі не редагується, і
        // відправити його означало б затерти чужу правку.
        await upsertWorkspaceMemberProfile({ workspaceId, userId: person.userId, moduleAccess: modules });
      }
      invalidateWorkspaceMemberDirectory(workspaceId);
      onSaved(roles?.changed ? roles.accessRole : person.accessRole, roles?.changed ? roles.jobRole : person.jobRole);
      toast.success("Доступи збережено");
    } catch (error: unknown) {
      toast.error("Не вдалося зберегти доступи", {
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <SectionCard title="Роль" audience="бачать керівники">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5">
            <span className={CAP}>Рівень доступу</span>
            <Select value={accessLevel} onValueChange={setAccessLevel} disabled={!canEditRoles}>
              <SelectTrigger className="h-10">{accessLevelLabel(accessLevel)}</SelectTrigger>
              <SelectContent>
                {ACCESS_LEVELS.map((level) => (
                  <SelectItem key={level.value} value={level.value}>
                    {level.label} — {level.hint}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className={CAP}>Посада</span>
            <Select value={job} onValueChange={setJob} disabled={!canEditRoles}>
              <SelectTrigger className="h-10">
                {JOB_ROLE_OPTIONS.find((option) => option.value === job)?.label ?? "Без посади"}
              </SelectTrigger>
              <SelectContent>
                {JOB_ROLE_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
        </div>
        {!canEditRoles ? (
          <p className="text-2xs text-muted-foreground">
            {isSelf
              ? "Власні доступи змінює хтось інший — інакше можна закрити собі вхід."
              : "Роль цієї людини може змінити лише власник."}
          </p>
        ) : (
          <p className="text-2xs text-muted-foreground">
            Посада задає стартовий набір модулів. Нижче видно, де ця людина від нього відхилилась.
          </p>
        )}
      </SectionCard>

      <SectionCard
        title={`Що ${person.firstName || "людина"} бачить у меню`}
        audience="бачать керівники"
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="neutral">
              {openCount} із {MODULE_KEYS.length}
            </Badge>
            {deviations.length ? (
              <Badge tone="warning">
                <ShieldAlert className="h-3 w-3" />
                {pluralUk(deviations.length, "вручну", "вручну", "вручну")}
              </Badge>
            ) : (
              <Badge tone="success">повністю за посадою</Badge>
            )}
            {canEditModules && deviations.length ? (
              <Button variant="ghost" size="xs" onClick={resetToRole}>
                <RotateCcw className="h-3.5 w-3.5" />
                Скинути до посади
              </Button>
            ) : null}
          </div>
        }
      >
        {/*
          Не список перемикачів, а САМЕ МЕНЮ, яке людина побачить.
          Двадцять галочок нічого не пояснювали: з них 4 заблоковані (рішення
          ухвалює не тут), 15 просто збігаються з посадою, і лише 1 несе
          інформацію. Тут наслідок видно без уяви — той самий фон сайдбара,
          ті самі групи, той самий порядок і ті самі іконки.
        */}
        <div className="flex flex-col gap-0.5 rounded-xl border border-border/50 bg-[hsl(var(--sidebar-surface-bg))] p-2">
          {MODULE_GROUPS.map((group) => (
            <div key={group.group} className="flex flex-col gap-0.5">
              <div className={cn(CAP, "px-2.5 pb-1 pt-3 first:pt-1")}>{group.label}</div>
              {group.modules.map((module) => {
                const lock = describeModuleLock(module.key, modules, {
                  accessRole: person.accessRole,
                  jobRole: person.jobRole,
                });
                const deviates = !lock.locked && modules[module.key] !== roleDefaults[module.key];
                const Icon = MODULE_ICONS[module.key];
                const interactive = canEditModules && !lock.locked;
                return (
                  <button
                    key={module.key}
                    type="button"
                    disabled={!interactive}
                    aria-pressed={lock.checked}
                    onClick={() =>
                      setModules((prev) => ({ ...prev, [module.key]: !lock.checked }))
                    }
                    title={lock.reason ?? undefined}
                    className={cn(
                      "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left transition-colors duration-base motion-reduce:transition-none",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
                      lock.checked
                        ? "bg-card text-foreground shadow-[inset_0_0_0_1px_hsl(var(--border)/0.55)]"
                        : "text-muted-foreground",
                      interactive && "cursor-pointer",
                      interactive && !lock.checked && "hover:bg-muted/60 hover:text-foreground",
                      interactive && lock.checked && "hover:bg-card/80",
                      !interactive && "cursor-not-allowed"
                    )}
                  >
                    {/* Квадратик, а не перемикач: у меню перемикачів не буває,
                        але без жодного маркера рядок не читається як керований. */}
                    <span
                      className={cn(
                        "grid h-3.5 w-3.5 shrink-0 place-items-center rounded-[4px] border transition-colors duration-base",
                        lock.checked ? "border-primary bg-primary text-primary-foreground" : "border-border",
                        lock.locked && "opacity-45"
                      )}
                      aria-hidden
                    >
                      {lock.checked ? <Check className="h-2.5 w-2.5" strokeWidth={3.2} /> : null}
                    </span>
                    <Icon className={cn("h-3.5 w-3.5 shrink-0", lock.checked ? "text-primary" : "opacity-70")} />
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">{module.label}</span>
                    {deviates ? <Badge tone="warning">вручну</Badge> : null}
                    {lock.locked ? (
                      <span className="flex shrink-0 items-center gap-1 text-3xs text-muted-foreground/80">
                        <Lock className="h-3 w-3" />
                        керує роль
                      </span>
                    ) : MODULES_WITHOUT_MENU_ITEM.has(module.key) ? (
                      <span className="shrink-0 text-3xs text-muted-foreground/70">не пункт меню</span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
        <p className="text-2xs text-muted-foreground">Сповіщення доступні всім і окремого дозволу не потребують.</p>
        {canEdit ? (
          <div className="flex items-center gap-3 border-t border-border/60 pt-3">
            <span className="text-2xs text-muted-foreground">
              {dirty ? "Є незбережені зміни" : "Усе збережено"}
            </span>
            <Button className="ml-auto" size="sm" onClick={save} disabled={busy || !dirty}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
              Зберегти доступи
            </Button>
          </div>
        ) : null}
      </SectionCard>

      <PersonAccessHistorySection
        workspaceId={workspaceId}
        userId={person.userId}
        resolveActorName={resolveActorName}
      />
    </div>
  );
}
