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
import { AlertTriangle, ArrowLeft, Eye, KeyRound, Loader2, Lock, Phone, RotateCcw, ShieldAlert } from "lucide-react";
import { toast } from "sonner";

import { useAuth } from "@/auth/AuthProvider";
import { AvatarBase } from "@/components/app/avatar-kit";
import { ConfirmDialog } from "@/components/app/ConfirmDialog";
import { MemberPaySection } from "@/components/team/MemberPaySection";
import { PersonAccessHistorySection, PersonActivitySection } from "@/components/team/PersonDetailSections";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
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

const JOB_ROLE_OPTIONS = [
  { value: "none", label: "Без посади" },
  ...Object.entries(JOB_ROLE_NAMES).map(([value, label]) => ({ value, label })),
];

/** Підпис-мікрозаголовок у мові «Релізів» і «Стеку». */
const CAP = "text-3xs font-semibold uppercase tracking-widest text-muted-foreground";
const CARD = "rounded-2xl border border-border/60 bg-card";

function Fact({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border/50 px-3 py-2.5">
      <div className={CAP}>{label}</div>
      <div className="mt-1 text-sm font-medium text-foreground">{value}</div>
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
    <div className="flex flex-col gap-4 pb-10">
      <Link
        to="/team"
        className="inline-flex w-fit items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Команда
      </Link>

      <header className={cn(CARD, "flex flex-wrap items-center gap-4 p-4")}>
        <AvatarBase
          src={getCanonicalAvatarReference({ avatarUrl: person.avatarUrl }, AVATAR_BUCKET)}
          name={person.displayName}
          fallback={person.initials}
          size={56}
          shape="circle"
          className="border-border bg-muted/50"
          fallbackClassName="text-sm font-bold"
          availability={person.availabilityStatus}
          inactive={inactive}
        />
        <div className="min-w-0 flex-1">
          <div className={cn("truncate text-lg font-semibold text-foreground", inactive && "line-through")}>
            {person.displayName}
          </div>
          <div className="truncate text-sm text-muted-foreground">{person.email ?? "Пошта не вказана"}</div>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <Badge tone="neutral">{formatJobRole(person.jobRole) || "Без посади"}</Badge>
            {(person.accessRole ?? "member") !== "member" ? (
              <Badge tone="accent">{accessLevelLabel(person.accessRole)}</Badge>
            ) : null}
            <Badge tone={employmentStatusTone(employment)}>{getEmploymentStatusLabel(employment)}</Badge>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {person.phone ? (
            <Button variant="secondary" size="sm" asChild>
              <a href={`tel:${person.phone.replace(/\s/g, "")}`}>
                <Phone className="h-4 w-4" />
                Подзвонити
              </a>
            </Button>
          ) : null}
          {canOpenProfileCard && !isSelf ? (
            <Button variant="secondary" size="sm" asChild>
              <Link to={`/settings/members?member=${person.userId}`}>
                <Eye className="h-4 w-4" />
                В адмін-центрі
              </Link>
            </Button>
          ) : null}
        </div>
      </header>

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,11.5rem)_minmax(0,1fr)]">
        <nav className="flex flex-wrap gap-1 lg:sticky lg:top-2 lg:flex-col">
          {visibleSections.map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setSection(key)}
              aria-current={section === key}
              className={cn(
                "flex cursor-pointer items-center gap-2 rounded-lg px-3 py-1.5 text-left text-sm font-medium transition-colors",
                section === key
                  ? "bg-card text-foreground shadow-[inset_0_0_0_1px_hsl(var(--border))]"
                  : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
              )}
            >
              {SECTION_LABELS[key]}
              {key !== "overview" ? <Lock className="ml-auto h-3 w-3 text-muted-foreground/70" /> : null}
            </button>
          ))}
          {canOpenProfileCard ? (
            <p className="mt-2 px-3 text-2xs leading-relaxed text-muted-foreground">
              Розділи із замком бачать керівники. У власному профілі людина бачить «Огляд» і свою активність.
            </p>
          ) : null}
        </nav>

        <div className="flex min-w-0 flex-col gap-4">
          {section === "overview" ? (
            <SectionCard title="Огляд" audience="бачить уся команда">
              <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
                <Fact label="У команді з" value={person.startDate ? formatEmploymentDate(person.startDate) : "Не вказано"} />
                <Fact
                  label="День народження"
                  value={
                    birthday ? (
                      // Спершу дата, і лише потім «через скільки»: у довіднику
                      // питання «коли в неї день народження», а не «скільки чекати».
                      <span className="flex flex-wrap items-baseline gap-x-1.5">
                        <span className="tabular-nums">{birthday.dateLabel}</span>
                        <span className="text-2xs font-normal text-muted-foreground">
                          {birthday.daysUntil === 0 ? "сьогодні" : birthday.label.toLowerCase()}
                        </span>
                      </span>
                    ) : (
                      "Не вказано"
                    )
                  }
                />
                <Fact label="Телефон" value={person.phone ? <span className="tabular-nums">{person.phone}</span> : "Не вказано"} />
                <Fact label="Пошта" value={person.email ?? "Не вказано"} />
                <Fact label="Посада" value={formatJobRole(person.jobRole) || "Без посади"} />
                <Fact
                  label="Присутність"
                  value={person.absenceToday ? "Відсутній сьогодні" : inactive ? "Співпрацю завершено" : "На місці"}
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
              <div className="grid gap-2.5 sm:grid-cols-2">
                <Fact
                  label="Стаж"
                  value={person.startDate ? formatEmploymentDuration(person.startDate) : "Дата старту не вказана"}
                />
                <Fact label="Статус співпраці" value={getEmploymentStatusLabel(employment)} />
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
  isSelf,
  resolveActorName,
  onSaved,
}: {
  person: WorkspaceMemberDirectoryRow;
  workspaceId: string;
  teamId: string | null;
  canManage: boolean;
  isOwner: boolean;
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
   * Своїх доступів не редагують: адміністратор, який зняв би собі права,
   * втратив би й можливість повернути їх. Власника не чіпає ніхто, крім нього.
   */
  const canEdit = canManage && !isSelf && (isOwner || (person.accessRole ?? "") !== "owner");

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

  const dirty =
    accessLevel !== ((person.accessRole ?? "member").trim().toLowerCase() || "member") ||
    job !== (person.jobRole || "none") ||
    (Object.keys(modules) as ModuleKey[]).some((key) => modules[key] !== savedAccess[key]);

  const resetToRole = useCallback(() => setModules(roleDefaults), [roleDefaults]);

  const save = async () => {
    if (!canEdit) return;
    setBusy(true);
    try {
      const roles = await savePersonRoles({
        workspaceId,
        teamId,
        userId: person.userId,
        currentAccessRole: person.accessRole,
        currentJobRole: person.jobRole,
        nextAccessRole: accessLevel,
        nextJobRole: job,
      });
      // Модулі живуть на рядку профілю, а не в членстві, тож це другий запис.
      // Шлемо ЛИШЕ moduleAccess: усе інше в цій формі не редагується, і
      // відправити його означало б затерти чужу правку.
      await upsertWorkspaceMemberProfile({ workspaceId, userId: person.userId, moduleAccess: modules });
      invalidateWorkspaceMemberDirectory(workspaceId);
      onSaved(roles.changed ? roles.accessRole : person.accessRole, roles.changed ? roles.jobRole : person.jobRole);
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
            <Select value={accessLevel} onValueChange={setAccessLevel} disabled={!canEdit}>
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
            <Select value={job} onValueChange={setJob} disabled={!canEdit}>
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
        {!canEdit ? (
          <p className="text-2xs text-muted-foreground">
            {isSelf
              ? "Власні доступи змінює хтось інший — інакше можна закрити собі вхід."
              : "Редагувати доступи цієї людини може лише власник."}
          </p>
        ) : (
          <p className="text-2xs text-muted-foreground">
            Посада задає стартовий набір модулів. Нижче видно, де ця людина від нього відхилилась.
          </p>
        )}
      </SectionCard>

      <SectionCard
        title="Доступ до модулів"
        audience="бачать керівники"
        action={
          <div className="flex items-center gap-2">
            {deviations.length ? (
              <Badge tone="warning">
                <ShieldAlert className="h-3 w-3" />
                {pluralUk(deviations.length, "відхилення", "відхилення", "відхилень")} від посади
              </Badge>
            ) : (
              <Badge tone="success">повністю за посадою</Badge>
            )}
            {canEdit && deviations.length ? (
              <Button variant="ghost" size="xs" onClick={resetToRole}>
                <RotateCcw className="h-3.5 w-3.5" />
                Скинути до посади
              </Button>
            ) : null}
          </div>
        }
      >
        <div className="flex flex-col gap-4">
          {MODULE_GROUPS.map((group) => (
            <div key={group.group} className="flex flex-col gap-1">
              <div className={CAP}>{group.label}</div>
              {group.modules.map((module) => {
                const lock = describeModuleLock(module.key, modules, {
                  accessRole: person.accessRole,
                  jobRole: person.jobRole,
                });
                const deviates = !lock.locked && modules[module.key] !== roleDefaults[module.key];
                return (
                  <div
                    key={module.key}
                    className="flex items-center gap-3 rounded-lg px-2 py-1.5 transition-colors hover:bg-muted/50"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5 text-sm font-medium text-foreground">
                        {module.label}
                        {deviates ? <Badge tone="warning">вручну</Badge> : null}
                      </div>
                      {lock.reason ? (
                        <p className="flex items-center gap-1 text-2xs text-muted-foreground">
                          <Lock className="h-3 w-3" />
                          {lock.reason}
                        </p>
                      ) : module.hint ? (
                        <p className="text-2xs text-muted-foreground">{module.hint}</p>
                      ) : null}
                    </div>
                    <Switch
                      checked={lock.checked}
                      disabled={!canEdit || lock.locked}
                      label={module.label}
                      onCheckedChange={(next) =>
                        setModules((prev) => ({ ...prev, [module.key]: next === true }))
                      }
                    />
                  </div>
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
