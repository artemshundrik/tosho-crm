import * as React from "react";
import { toast } from "sonner";
import {
  Banknote,
  Building2,
  Check,
  Copy,
  FileText,
  Loader2,
  Plus,
  ShieldAlert,
  Percent,
  Tags,
  Trash2,
  Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { EditIconButton, DeleteIconButton } from "./financeRowActions";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SEGMENTED_GROUP_SM, SEGMENTED_TRIGGER_SM } from "@/components/ui/controlStyles";
import { SegmentedGroup } from "@/components/ui/segmented-group";
import { cn } from "@/lib/utils";
import { useAuth } from "@/auth/AuthProvider";
import { computeRunSalePricing } from "@/lib/quoteRuns";
import {
  loadCompanyPricingRates,
  loadCompanyPricingRateHistory,
  saveCompanyPricingRates,
  type CompanyPricingRateChange,
} from "@/lib/companyPricingRates";
import { listWorkspaceMemberDirectory } from "@/lib/workspaceMemberDirectory";
import { resolveWorkspaceId } from "@/lib/workspace";
import {
  createAccount,
  createExpenseCategory,
  createLegalEntity,
  deleteAccount,
  deleteExpenseCategory,
  deleteLegalEntity,
  listAccounts,
  listExpenseCategories,
  listLegalEntities,
  updateAccount,
  updateLegalEntity,
  type AccountInput,
  type LegalEntityInput,
} from "./api";
import {
  ACCOUNT_KIND_LABELS,
  BANK_PROVIDER_LABELS,
  EXPENSE_CATEGORY_KIND_LABELS,
  LEGAL_ENTITY_KIND_LABELS,
  formatLegalEntityLabel,
  SENSITIVE_ACCOUNT_KINDS,
  type ExpenseCategoryKind,
  type FinanceAccount,
  type FinanceAccountKind,
  type FinanceBankProvider,
  type FinanceExpenseCategory,
  type FinanceLegalEntity,
  type LegalEntityKind,
} from "./types";
import { getExpenseCategoryIcon } from "./expenseCategoryIcons";
import { FinanceSkeleton } from "./FinanceSkeleton";

type FinanceSettingsProps = {
  teamId: string | null;
  /** CEO / chief accountant — may see and manage sensitive (cash/crypto/card) accounts. */
  canSeeSensitive: boolean;
};

const getErrorMessage = (error: unknown, fallback: string) =>
  error instanceof Error && error.message ? error.message : fallback;

export function FinanceSettings({ teamId, canSeeSensitive }: FinanceSettingsProps) {
  const [tab, setTab] = React.useState<"entities" | "accounts" | "categories" | "requisites" | "pricing">(
    "entities"
  );
  const [entities, setEntities] = React.useState<FinanceLegalEntity[]>([]);
  const [accounts, setAccounts] = React.useState<FinanceAccount[]>([]);
  const [categories, setCategories] = React.useState<FinanceExpenseCategory[]>([]);
  const [loading, setLoading] = React.useState(true);

  const reload = React.useCallback(async () => {
    if (!teamId) return;
    setLoading(true);
    try {
      const [nextEntities, nextAccounts, nextCategories] = await Promise.all([
        listLegalEntities(teamId).catch((e) => {
          console.error("[finance] listLegalEntities failed", e);
          return [] as FinanceLegalEntity[];
        }),
        listAccounts(teamId).catch((e) => {
          console.error("[finance] listAccounts failed", e);
          return [] as FinanceAccount[];
        }),
        listExpenseCategories(teamId).catch((e) => {
          console.error("[finance] listExpenseCategories failed", e);
          return [] as FinanceExpenseCategory[];
        }),
      ]);
      setEntities(nextEntities);
      setAccounts(nextAccounts);
      setCategories(nextCategories);
    } catch (error) {
      console.error("[finance] settings reload failed", error);
      toast.error("Не вдалося завантажити фінансові налаштування", {
        description: getErrorMessage(error, "Спробуйте ще раз."),
      });
    } finally {
      setLoading(false);
    }
  }, [teamId]);

  React.useEffect(() => {
    void reload();
  }, [reload]);

  const visibleAccounts = React.useMemo(
    () => (canSeeSensitive ? accounts : accounts.filter((account) => !account.isSensitive)),
    [accounts, canSeeSensitive]
  );

  return (
    <div className="space-y-4">
      <SegmentedGroup className={cn("inline-flex", SEGMENTED_GROUP_SM)}>
        <button
          type="button"
          className={cn(SEGMENTED_TRIGGER_SM, "gap-1.5 whitespace-nowrap")}
          data-state={tab === "entities" ? "active" : "inactive"}
          onClick={() => setTab("entities")}
        >
          <Building2 className="h-3.5 w-3.5" /> Юрособи
        </button>
        <button
          type="button"
          className={cn(SEGMENTED_TRIGGER_SM, "gap-1.5 whitespace-nowrap")}
          data-state={tab === "accounts" ? "active" : "inactive"}
          onClick={() => setTab("accounts")}
        >
          <Wallet className="h-3.5 w-3.5" /> Каси та рахунки
        </button>
        <button
          type="button"
          className={cn(SEGMENTED_TRIGGER_SM, "gap-1.5 whitespace-nowrap")}
          data-state={tab === "categories" ? "active" : "inactive"}
          onClick={() => setTab("categories")}
        >
          <Tags className="h-3.5 w-3.5" /> Статті витрат
        </button>
        <button
          type="button"
          className={cn(SEGMENTED_TRIGGER_SM, "gap-1.5 whitespace-nowrap")}
          data-state={tab === "requisites" ? "active" : "inactive"}
          onClick={() => setTab("requisites")}
        >
          <FileText className="h-3.5 w-3.5" /> Реквізити
        </button>
        <button
          type="button"
          className={cn(SEGMENTED_TRIGGER_SM, "gap-1.5 whitespace-nowrap")}
          data-state={tab === "pricing" ? "active" : "inactive"}
          onClick={() => setTab("pricing")}
        >
          <Percent className="h-3.5 w-3.5" /> Ставки
        </button>
      </SegmentedGroup>

      {loading ? (
        <FinanceSkeleton variant="stats" />
      ) : tab === "entities" ? (
        <LegalEntitiesPanel teamId={teamId} entities={entities} onChanged={reload} />
      ) : tab === "accounts" ? (
        <AccountsPanel
          teamId={teamId}
          accounts={visibleAccounts}
          entities={entities}
          canSeeSensitive={canSeeSensitive}
          onChanged={reload}
        />
      ) : tab === "categories" ? (
        <CategoriesPanel teamId={teamId} categories={categories} onChanged={reload} />
      ) : tab === "pricing" ? (
        <PricingRatesPanel />
      ) : (
        <RequisitesPanel entities={entities} />
      )}
    </div>
  );
}

// ===========================================================================
// Legal entities
// ===========================================================================

const EMPTY_ENTITY: LegalEntityInput = {
  name: "",
  kind: "sole_prop",
  vatPayer: false,
  taxGroup: "",
  edrpou: "",
  ipn: "",
  iban: "",
};

function LegalEntitiesPanel({
  teamId,
  entities,
  onChanged,
}: {
  teamId: string | null;
  entities: FinanceLegalEntity[];
  onChanged: () => Promise<void> | void;
}) {
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [form, setForm] = React.useState<LegalEntityInput>(EMPTY_ENTITY);
  const [saving, setSaving] = React.useState(false);

  const openCreate = () => {
    setEditingId(null);
    setForm(EMPTY_ENTITY);
    setDialogOpen(true);
  };

  const openEdit = (entity: FinanceLegalEntity) => {
    setEditingId(entity.id);
    setForm({
      name: entity.name,
      kind: entity.kind,
      vatPayer: entity.vatPayer,
      taxGroup: entity.taxGroup ?? "",
      edrpou: entity.edrpou ?? "",
      ipn: entity.ipn ?? "",
      iban: entity.iban ?? "",
    });
    setDialogOpen(true);
  };

  const submit = async () => {
    if (!teamId) {
      toast.error("Команду не визначено — перезавантажте сторінку та спробуйте ще раз.");
      return;
    }
    if (!form.name.trim()) {
      toast.error("Вкажіть назву юрособи.");
      return;
    }
    setSaving(true);
    try {
      if (editingId) await updateLegalEntity(teamId, editingId, form);
      else await createLegalEntity(teamId, form);
      setDialogOpen(false);
      await onChanged();
      toast.success(editingId ? "Юрособу оновлено" : "Юрособу додано");
    } catch (error) {
      console.error("[finance] createLegalEntity failed", error);
      toast.error("Не вдалося зберегти юрособу", { description: getErrorMessage(error, "Спробуйте ще раз.") });
    } finally {
      setSaving(false);
    }
  };

  const remove = async (entity: FinanceLegalEntity) => {
    if (!teamId) return;
    if (!window.confirm(`Видалити юрособу «${entity.name}»?`)) return;
    try {
      await deleteLegalEntity(teamId, entity.id);
      await onChanged();
      toast.success("Юрособу видалено");
    } catch (error) {
      toast.error("Не вдалося видалити юрособу", { description: getErrorMessage(error, "Спробуйте ще раз.") });
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Наші юрособи: ТОВ, ФОПи та фізособа. Вони визначають контури обліку й канали оплат.
        </p>
        <Button type="button" size="sm" className="h-8 gap-1.5" onClick={openCreate}>
          <Plus className="h-4 w-4" /> Додати юрособу
        </Button>
      </div>

      {entities.length === 0 ? (
        <EmptyState icon={Building2} text="Ще немає юросіб. Додайте ТОВ і ФОПи, щоб налаштувати контури." />
      ) : (
        <div className="grid gap-2">
          {entities.map((entity) => (
            <div
              key={entity.id}
              className="flex items-start justify-between gap-3 rounded-xl border border-border/40 bg-card shadow-card px-4 py-3"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium text-foreground">{entity.name}</span>
                  <Badge variant="outline" className="text-3xs">
                    {LEGAL_ENTITY_KIND_LABELS[entity.kind]}
                  </Badge>
                  <Badge
                    variant="outline"
                    className={cn(
                      "text-3xs",
                      entity.vatPayer ? "border-info/40 bg-info/10 text-info-foreground" : "text-muted-foreground"
                    )}
                  >
                    {entity.vatPayer ? "Платник ПДВ" : "Без ПДВ"}
                  </Badge>
                  {!entity.isActive ? (
                    <Badge variant="outline" className="text-3xs text-muted-foreground">
                      Неактивна
                    </Badge>
                  ) : null}
                </div>
                <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                  {entity.edrpou ? <span>ЄДРПОУ: {entity.edrpou}</span> : null}
                  {entity.ipn ? <span>ІПН: {entity.ipn}</span> : null}
                  {entity.taxGroup ? <span>Група: {entity.taxGroup}</span> : null}
                  {entity.iban ? <span className="truncate">IBAN: {entity.iban}</span> : null}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <EditIconButton onClick={() => openEdit(entity)} />
                <DeleteIconButton onClick={() => void remove(entity)} />
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>{editingId ? "Редагувати юрособу" : "Нова юрособа"}</DialogTitle>
            <DialogDescription>Реквізити для рахунків, документів і податкового обліку.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid gap-2">
              <Label>Назва <span className="text-destructive">*</span></Label>
              <Input controlSize="md"
                value={form.name}
                onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                placeholder="Напр. ТОВ «Тошо» або ФОП Іваненко І.І."
                className="h-9"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-2">
                <Label>Тип</Label>
                <Select value={form.kind} onValueChange={(v) => setForm((p) => ({ ...p, kind: v as LegalEntityKind }))}>
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(LEGAL_ENTITY_KIND_LABELS) as LegalEntityKind[]).map((k) => (
                      <SelectItem key={k} value={k}>
                        {LEGAL_ENTITY_KIND_LABELS[k]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Група податку</Label>
                <Input controlSize="md"
                  value={form.taxGroup ?? ""}
                  onChange={(e) => setForm((p) => ({ ...p, taxGroup: e.target.value }))}
                  placeholder="Напр. 3"
                  className="h-9"
                />
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={form.vatPayer}
                onCheckedChange={(v) => setForm((p) => ({ ...p, vatPayer: v === true }))}
              />
              Платник ПДВ
            </label>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-2">
                <Label>ЄДРПОУ</Label>
                <Input controlSize="md"
                  value={form.edrpou ?? ""}
                  onChange={(e) => setForm((p) => ({ ...p, edrpou: e.target.value }))}
                  className="h-9"
                />
              </div>
              <div className="grid gap-2">
                <Label>ІПН</Label>
                <Input controlSize="md"
                  value={form.ipn ?? ""}
                  onChange={(e) => setForm((p) => ({ ...p, ipn: e.target.value }))}
                  className="h-9"
                />
              </div>
            </div>
            <div className="grid gap-2">
              <Label>IBAN</Label>
              <Input controlSize="md"
                value={form.iban ?? ""}
                onChange={(e) => setForm((p) => ({ ...p, iban: e.target.value }))}
                placeholder="UA…"
                className="h-9"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
              Скасувати
            </Button>
            <Button onClick={() => void submit()} disabled={saving}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Зберегти
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ===========================================================================
// Accounts (каси / гаманці)
// ===========================================================================

const buildEmptyAccount = (): AccountInput => ({
  legalEntityId: null,
  name: "",
  kind: "bank",
  currency: "UAH",
  bankProvider: null,
  isSensitive: false,
});

function AccountsPanel({
  teamId,
  accounts,
  entities,
  canSeeSensitive,
  onChanged,
}: {
  teamId: string | null;
  accounts: FinanceAccount[];
  entities: FinanceLegalEntity[];
  canSeeSensitive: boolean;
  onChanged: () => Promise<void> | void;
}) {
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [form, setForm] = React.useState<AccountInput>(buildEmptyAccount);
  const [saving, setSaving] = React.useState(false);

  const entityName = React.useCallback(
    (id: string | null) => entities.find((e) => e.id === id)?.name ?? "Без юрособи",
    [entities]
  );

  const openCreate = () => {
    setEditingId(null);
    setForm(buildEmptyAccount());
    setDialogOpen(true);
  };

  const openEdit = (account: FinanceAccount) => {
    setEditingId(account.id);
    setForm({
      legalEntityId: account.legalEntityId,
      name: account.name,
      kind: account.kind,
      currency: account.currency,
      bankProvider: account.bankProvider,
      isSensitive: account.isSensitive,
    });
    setDialogOpen(true);
  };

  // Kind drives the default sensitivity; user opened the form keeps control.
  const setKind = (kind: FinanceAccountKind) =>
    setForm((p) => ({ ...p, kind, isSensitive: SENSITIVE_ACCOUNT_KINDS.has(kind) ? true : p.isSensitive }));

  const submit = async () => {
    if (!teamId) {
      toast.error("Команду не визначено — перезавантажте сторінку та спробуйте ще раз.");
      return;
    }
    if (!form.name.trim()) {
      toast.error("Вкажіть назву каси/рахунку.");
      return;
    }
    setSaving(true);
    try {
      if (editingId) await updateAccount(teamId, editingId, form);
      else await createAccount(teamId, form);
      setDialogOpen(false);
      await onChanged();
      toast.success(editingId ? "Рахунок оновлено" : "Рахунок додано");
    } catch (error) {
      console.error("[finance] createAccount failed", error);
      toast.error("Не вдалося зберегти рахунок", { description: getErrorMessage(error, "Спробуйте ще раз.") });
    } finally {
      setSaving(false);
    }
  };

  const remove = async (account: FinanceAccount) => {
    if (!teamId) return;
    if (!window.confirm(`Видалити рахунок «${account.name}»?`)) return;
    try {
      await deleteAccount(teamId, account.id);
      await onChanged();
      toast.success("Рахунок видалено");
    } catch (error) {
      toast.error("Не вдалося видалити рахунок", { description: getErrorMessage(error, "Спробуйте ще раз.") });
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Каси та гаманці — банк, готівка, крипта. Кожен рахунок має власний баланс.
        </p>
        <Button type="button" size="sm" className="h-8 gap-1.5" onClick={openCreate}>
          <Plus className="h-4 w-4" /> Додати рахунок
        </Button>
      </div>

      {accounts.length === 0 ? (
        <EmptyState icon={Wallet} text="Ще немає кас/рахунків. Додайте банківські рахунки юросіб і касу." />
      ) : (
        <div className="grid gap-2">
          {accounts.map((account) => (
            <div
              key={account.id}
              className="flex items-start justify-between gap-3 rounded-xl border border-border/40 bg-card shadow-card px-4 py-3"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium text-foreground">{account.name}</span>
                  <Badge variant="outline" className="text-3xs">
                    {ACCOUNT_KIND_LABELS[account.kind]}
                  </Badge>
                  <Badge variant="outline" className="text-3xs text-muted-foreground">
                    {account.currency}
                  </Badge>
                  {account.isSensitive ? (
                    <Badge variant="outline" className="gap-1 text-3xs border-warning/40 bg-warning/10 text-warning-foreground">
                      <ShieldAlert className="h-3 w-3" /> Лише топ-ролі
                    </Badge>
                  ) : null}
                </div>
                <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                  <span>{entityName(account.legalEntityId)}</span>
                  {account.bankProvider ? <span>{BANK_PROVIDER_LABELS[account.bankProvider]}</span> : null}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <EditIconButton onClick={() => openEdit(account)} />
                <DeleteIconButton onClick={() => void remove(account)} />
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>{editingId ? "Редагувати рахунок" : "Новий рахунок / каса"}</DialogTitle>
            <DialogDescription>Канал, через який заходять і виходять гроші.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid gap-2">
              <Label>Назва <span className="text-destructive">*</span></Label>
              <Input controlSize="md"
                value={form.name}
                onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                placeholder="Напр. Райфайзен ТОВ, Каса готівка"
                className="h-9"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-2">
                <Label>Тип</Label>
                <Select value={form.kind} onValueChange={(v) => setKind(v as FinanceAccountKind)}>
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(ACCOUNT_KIND_LABELS) as FinanceAccountKind[]).map((k) => (
                      <SelectItem key={k} value={k}>
                        {ACCOUNT_KIND_LABELS[k]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Валюта</Label>
                <Input controlSize="md"
                  value={form.currency ?? "UAH"}
                  onChange={(e) => setForm((p) => ({ ...p, currency: e.target.value }))}
                  placeholder="UAH"
                  className="h-9"
                />
              </div>
            </div>
            <div className="grid gap-2">
              <Label>Юрособа</Label>
              <Select
                value={form.legalEntityId ?? "none"}
                onValueChange={(v) => setForm((p) => ({ ...p, legalEntityId: v === "none" ? null : v }))}
              >
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Оберіть юрособу" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Без юрособи</SelectItem>
                  {entities.map((entity) => (
                    <SelectItem key={entity.id} value={entity.id}>
                      {entity.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {form.kind === "bank" ? (
              <div className="grid gap-2">
                <Label>Банк / провайдер</Label>
                <Select
                  value={form.bankProvider ?? "none"}
                  onValueChange={(v) => setForm((p) => ({ ...p, bankProvider: v === "none" ? null : (v as FinanceBankProvider) }))}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Оберіть банк" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Не вказано</SelectItem>
                    {(Object.keys(BANK_PROVIDER_LABELS) as FinanceBankProvider[]).map((p) => (
                      <SelectItem key={p} value={p}>
                        {BANK_PROVIDER_LABELS[p]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}
            {canSeeSensitive ? (
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={form.isSensitive}
                  onCheckedChange={(v) => setForm((p) => ({ ...p, isSensitive: v === true }))}
                />
                Чутливий канал (видно лише топ-ролям; не в податкові звіти)
              </label>
            ) : null}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
              Скасувати
            </Button>
            <Button onClick={() => void submit()} disabled={saving}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Зберегти
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ===========================================================================
// Expense categories (статті витрат)
// ===========================================================================

function CategoriesPanel({
  teamId,
  categories,
  onChanged,
}: {
  teamId: string | null;
  categories: FinanceExpenseCategory[];
  onChanged: () => Promise<void> | void;
}) {
  const [name, setName] = React.useState("");
  const [kind, setKind] = React.useState<ExpenseCategoryKind>("variable");
  const [saving, setSaving] = React.useState(false);

  const add = async () => {
    if (!teamId) return;
    if (!name.trim()) {
      toast.error("Вкажіть назву статті.");
      return;
    }
    setSaving(true);
    try {
      await createExpenseCategory(teamId, { name, kind });
      setName("");
      await onChanged();
      toast.success("Статтю додано");
    } catch (error) {
      toast.error("Не вдалося додати статтю", { description: getErrorMessage(error, "Спробуйте ще раз.") });
    } finally {
      setSaving(false);
    }
  };

  const remove = async (category: FinanceExpenseCategory) => {
    if (!teamId) return;
    if (!window.confirm(`Видалити статтю «${category.name}»?`)) return;
    try {
      await deleteExpenseCategory(teamId, category.id);
      await onChanged();
      toast.success("Статтю видалено");
    } catch (error) {
      toast.error("Не вдалося видалити статтю", { description: getErrorMessage(error, "Спробуйте ще раз.") });
    }
  };

  const grouped = React.useMemo(() => {
    const order: ExpenseCategoryKind[] = ["fixed", "variable", "tax", "payroll"];
    return order
      .map((k) => ({ kind: k, items: categories.filter((c) => c.kind === k) }))
      .filter((group) => group.items.length > 0);
  }, [categories]);

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Статті витрат для класифікації: сталі, змінні, податки, виплати команді.
      </p>

      <div className="flex flex-wrap items-end gap-2 rounded-xl border border-border/60 bg-muted/10 p-3">
        <div className="grid min-w-[180px] flex-1 gap-1.5">
          <Label className="text-xs">Назва статті</Label>
          <Input controlSize="md"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Напр. Оренда офісу"
            className="h-9"
            onKeyDown={(e) => {
              if (e.key === "Enter") void add();
            }}
          />
        </div>
        <div className="grid w-[200px] gap-1.5">
          <Label className="text-xs">Тип</Label>
          <Select value={kind} onValueChange={(v) => setKind(v as ExpenseCategoryKind)}>
            <SelectTrigger className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(EXPENSE_CATEGORY_KIND_LABELS) as ExpenseCategoryKind[]).map((k) => (
                <SelectItem key={k} value={k}>
                  {EXPENSE_CATEGORY_KIND_LABELS[k]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button type="button" size="sm" className="h-9 gap-1.5" onClick={() => void add()} disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Додати
        </Button>
      </div>

      {categories.length === 0 ? (
        <EmptyState icon={Tags} text="Ще немає статей. Додайте оренду, матеріали, рекламу тощо." />
      ) : (
        <div className="space-y-3">
          {grouped.map((group) => (
            <div key={group.kind}>
              <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {EXPENSE_CATEGORY_KIND_LABELS[group.kind]}
              </h4>
              <div className="flex flex-wrap gap-2">
                {group.items.map((category) => {
                  const Icon = getExpenseCategoryIcon(category.name, category.kind);
                  return (
                    <div
                      key={category.id}
                      className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-card px-3 py-1 text-sm"
                    >
                      <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                      <span>{category.name}</span>
                      <button
                        type="button"
                        className="text-muted-foreground hover:text-destructive"
                        onClick={() => void remove(category)}
                        aria-label={`Видалити ${category.name}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ===========================================================================
// Requisites — швидке копіювання реквізитів для вставки в повідомлення
// ===========================================================================

const buildRequisitesText = (entity: FinanceLegalEntity): string => {
  const lines: string[] = [];
  const title = formatLegalEntityLabel(entity);
  if (title) lines.push(title);
  if (entity.edrpou) lines.push(`ЄДРПОУ: ${entity.edrpou}`);
  if (entity.ipn) lines.push(`ІПН: ${entity.ipn}`);
  if (entity.iban) lines.push(`IBAN: ${entity.iban}`);
  if (entity.vatPayer) lines.push("Платник ПДВ");
  // Any extra free-form requisites stored as primitive values.
  for (const [key, value] of Object.entries(entity.requisites ?? {})) {
    if (value == null) continue;
    if (typeof value === "string" || typeof value === "number") lines.push(`${key}: ${value}`);
  }
  return lines.join("\n");
};

function RequisitesPanel({ entities }: { entities: FinanceLegalEntity[] }) {
  const [copiedId, setCopiedId] = React.useState<string | null>(null);

  const copy = async (entity: FinanceLegalEntity) => {
    const text = buildRequisitesText(entity);
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(entity.id);
      window.setTimeout(() => setCopiedId((cur) => (cur === entity.id ? null : cur)), 1500);
      toast.success("Реквізити скопійовано");
    } catch {
      toast.error("Не вдалося скопіювати");
    }
  };

  const copyField = async (label: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(`${label} скопійовано`);
    } catch {
      toast.error("Не вдалося скопіювати");
    }
  };

  if (entities.length === 0) {
    return <EmptyState icon={FileText} text="Спершу додайте юрособи — їхні реквізити з'являться тут." />;
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Реквізити юросіб для швидкої вставки в повідомлення замовнику.
      </p>
      <div className="grid gap-3">
        {entities.map((entity) => {
          const chips: Array<{ label: string; value: string | null }> = [
            { label: "ЄДРПОУ", value: entity.edrpou },
            { label: "ІПН", value: entity.ipn },
            { label: "IBAN", value: entity.iban },
          ];
          return (
            <div key={entity.id} className="rounded-xl border border-border/40 bg-card p-4 shadow-card">
              <div className="mb-2 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-3xs">
                    {LEGAL_ENTITY_KIND_LABELS[entity.kind]}
                  </Badge>
                  <span className="text-sm font-medium text-foreground">{entity.name}</span>
                </div>
                <Button type="button" size="sm" variant="outline" className="h-8 gap-1.5" onClick={() => void copy(entity)}>
                  {copiedId === entity.id ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  Копіювати все
                </Button>
              </div>
              <div className="flex flex-wrap gap-2">
                {chips
                  .filter((c) => c.value)
                  .map((c) => (
                    <button
                      key={c.label}
                      type="button"
                      onClick={() => void copyField(c.label, c.value as string)}
                      className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-muted/20 px-3 py-1 text-xs text-foreground transition-colors hover:bg-muted/40"
                      title={`Скопіювати ${c.label}`}
                    >
                      <span className="text-muted-foreground">{c.label}:</span>
                      <span className="font-medium">{c.value}</span>
                      <Copy className="h-3 w-3 text-muted-foreground" />
                    </button>
                  ))}
                {chips.every((c) => !c.value) ? (
                  <span className="text-xs text-muted-foreground">Реквізити не заповнені — додайте у вкладці «Юрособи».</span>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function EmptyState({ icon: Icon, text }: { icon: typeof Banknote; text: string }) {
  return (
    <div className="rounded-xl border border-dashed border-border/60 bg-muted/10 p-8 text-center">
      <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-xl border border-border/60 bg-background">
        <Icon className="h-5 w-5 text-muted-foreground" />
      </div>
      <p className="text-sm text-muted-foreground">{text}</p>
    </div>
  );
}

/**
 * Ставки ціноутворення компанії.
 *
 * Постійні витрати і податковий резерв були константами в коді — щоб їх
 * змінити, потрібен був деплой (рішення СЕО 18.08: винести в налаштування).
 *
 * Ставка МЕНЕДЖЕРА свідомо лишається в картці співробітника: вона персональна,
 * у кожного своя. Тут про це стоїть окремий рядок, щоб не шукали.
 */
function PricingRatesPanel() {
  const auth = useAuth();
  const canEdit = React.useMemo(() => {
    if (auth.permissions.isSuperAdmin) return true;
    return (auth.jobRole ?? "").toLowerCase() === "seo";
  }, [auth.jobRole, auth.permissions.isSuperAdmin]);

  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [savedFixed, setSavedFixed] = React.useState(30);
  const [savedVat, setSavedVat] = React.useState(20);
  const [fixed, setFixed] = React.useState("30");
  const [vat, setVat] = React.useState("20");
  const [history, setHistory] = React.useState<CompanyPricingRateChange[]>([]);
  const [namesByUserId, setNamesByUserId] = React.useState<Record<string, string>>({});

  const reload = React.useCallback(async () => {
    setLoading(true);
    try {
      const [rates, changes] = await Promise.all([
        loadCompanyPricingRates(auth.userId),
        loadCompanyPricingRateHistory(auth.userId),
      ]);
      setSavedFixed(rates.fixedCostRate);
      setSavedVat(rates.vatRate);
      setFixed(String(rates.fixedCostRate));
      setVat(String(rates.vatRate));
      setHistory(changes);

      // Імена авторів правок. Директорія — той самий канонічний кеш, що й
      // усюди; memberships_view для імен не годиться, там full_name порожній.
      const workspaceId = await resolveWorkspaceId(auth.userId);
      if (workspaceId && changes.some((change) => change.changedBy)) {
        const directory = await listWorkspaceMemberDirectory(workspaceId);
        const map: Record<string, string> = {};
        for (const member of directory) {
          const name = [member.firstName, member.lastName].filter(Boolean).join(" ").trim();
          if (member.userId && name) map[member.userId] = name;
        }
        setNamesByUserId(map);
      }
    } catch (error) {
      console.error("[finance] pricing rates load failed", error);
      toast.error("Не вдалося завантажити ставки", {
        description: getErrorMessage(error, "Спробуйте ще раз."),
      });
    } finally {
      setLoading(false);
    }
  }, [auth.userId]);

  React.useEffect(() => {
    void reload();
  }, [reload]);

  const parsed = React.useMemo(() => {
    const toRate = (value: string) => {
      const n = Number(value.replace(",", "."));
      return Number.isFinite(n) && n >= 0 && n <= 100 ? n : null;
    };
    return { fixed: toRate(fixed), vat: toRate(vat) };
  }, [fixed, vat]);

  const dirty = parsed.fixed !== savedFixed || parsed.vat !== savedVat;
  const valid = parsed.fixed !== null && parsed.vat !== null;

  // Приклад із живою формулою: ставка сама по собі нічого не каже, а «націнка
  // на цьому тиражі виросте на N ₴» — каже.
  const preview = React.useMemo(() => {
    const sample = { quantity: 180, costTotal: 8172, desiredManagerIncome: 500, managerRate: 10 };
    const was = computeRunSalePricing({ ...sample, fixedCostRate: savedFixed, vatRate: savedVat });
    const now = computeRunSalePricing({
      ...sample,
      fixedCostRate: parsed.fixed ?? savedFixed,
      vatRate: parsed.vat ?? savedVat,
    });
    return { was, now, diff: now.markupTotal - was.markupTotal };
  }, [parsed.fixed, parsed.vat, savedFixed, savedVat]);

  const handleSave = async () => {
    if (!valid || parsed.fixed === null || parsed.vat === null) return;
    setSaving(true);
    try {
      const next = await saveCompanyPricingRates(
        { fixedCostRate: parsed.fixed, vatRate: parsed.vat },
        auth.userId
      );
      setSavedFixed(next.fixedCostRate);
      setSavedVat(next.vatRate);
      toast.success("Ставки збережено", {
        description: "Діють на нові прорахунки. Уже надіслані лишаються зі своїми.",
      });
      await reload();
    } catch (error) {
      console.error("[finance] pricing rates save failed", error);
      toast.error("Не вдалося зберегти ставки", {
        description: getErrorMessage(error, "Спробуйте ще раз."),
      });
    } finally {
      setSaving(false);
    }
  };

  const money = (value: number) =>
    `${new Intl.NumberFormat("uk-UA", { maximumFractionDigits: 0 }).format(Math.round(value))} ₴`;

  if (loading) return <FinanceSkeleton variant="stats" />;

  return (
    <div className="space-y-3">
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-4 rounded-xl border border-border/60 bg-card p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="pricing-fixed">Постійні витрати</Label>
              <div className="relative">
                <Input
                  id="pricing-fixed"
                  value={fixed}
                  inputMode="decimal"
                  disabled={!canEdit}
                  onChange={(event) => setFixed(event.target.value)}
                  className="pr-8 font-mono tabular-nums"
                />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                  %
                </span>
              </div>
              <p className="text-2xs text-muted-foreground">від валового прибутку</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pricing-vat">Податковий резерв</Label>
              <div className="relative">
                <Input
                  id="pricing-vat"
                  value={vat}
                  inputMode="decimal"
                  disabled={!canEdit}
                  onChange={(event) => setVat(event.target.value)}
                  className="pr-8 font-mono tabular-nums"
                />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                  %
                </span>
              </div>
              <p className="text-2xs text-muted-foreground">робоча назва, чекає бухгалтера</p>
            </div>
          </div>

          <div className="flex items-start gap-2.5 rounded-lg bg-amber-500/10 px-3.5 py-2.5 text-xs leading-relaxed text-amber-700 dark:text-amber-400">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              Нові ставки діють <b className="font-semibold">лише на нові прорахунки</b>. Ті, що вже
              надіслані клієнтам, лишаються зі своїми.
            </span>
          </div>

          {canEdit ? (
            <div className="flex items-center gap-2">
              <Button size="sm" onClick={() => void handleSave()} disabled={!dirty || !valid || saving}>
                {saving ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
                Зберегти ставки
              </Button>
              {dirty ? (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setFixed(String(savedFixed));
                    setVat(String(savedVat));
                  }}
                >
                  Як було
                </Button>
              ) : null}
              {!valid ? <span className="text-2xs text-destructive">Ставка має бути від 0 до 100 %</span> : null}
            </div>
          ) : (
            <p className="text-2xs text-muted-foreground">
              Міняти ставки можуть власник і СЕО. Ви бачите їх для довідки.
            </p>
          )}
        </div>

        <div className="space-y-3">
          <div className="rounded-xl border border-border/60 bg-muted/20 p-4">
            <div className="text-2xs font-semibold uppercase tracking-caps text-muted-foreground">
              Що це змінить
            </div>
            <p className="mt-1 text-2xs text-muted-foreground">
              Приклад: тираж 180 шт, собівартість {money(8172)}, заробіток 500 ₴
            </p>
            <div className="mt-3 space-y-1.5 text-xs">
              <div className="flex justify-between gap-3">
                <span className="text-muted-foreground">Націнка зараз</span>
                <span className="font-mono font-semibold tabular-nums">{money(preview.was.markupTotal)}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-muted-foreground">Націнка стане</span>
                <span className="font-mono font-semibold tabular-nums text-primary">
                  {money(preview.now.markupTotal)}
                </span>
              </div>
              <div className="flex justify-between gap-3 border-t border-border/60 pt-1.5">
                <span className="text-muted-foreground">Ціна / од.</span>
                <span className="font-mono font-semibold tabular-nums">
                  {preview.now.saleUnitPrice === null ? "—" : `${preview.now.saleUnitPrice.toFixed(2)} ₴`}
                </span>
              </div>
            </div>
            {Math.abs(preview.diff) >= 0.5 ? (
              <p className="mt-3 text-2xs leading-relaxed text-amber-700 dark:text-amber-400">
                Націнка {preview.diff > 0 ? "зросте" : "впаде"} на {money(Math.abs(preview.diff))} на цьому
                прикладі.
              </p>
            ) : null}
          </div>

          <div className="rounded-xl border border-border/60 bg-muted/20 p-4">
            <div className="text-2xs font-semibold uppercase tracking-caps text-muted-foreground">
              Ставка менеджера
            </div>
            <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
              Персональна, у кожного своя — живе в картці співробітника на сторінці «Команда». Сюди не
              переноситься навмисно: це не ставка компанії.
            </p>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-border/60 bg-card p-4">
        <div className="text-2xs font-semibold uppercase tracking-caps text-muted-foreground">
          Історія змін
        </div>
        {history.length === 0 ? (
          <p className="mt-2 text-xs text-muted-foreground">Ставки ще не міняли.</p>
        ) : (
          <div className="mt-3 space-y-2">
            {history.map((change) => (
              <div
                key={change.id}
                className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-border/40 pb-2 last:border-none last:pb-0"
              >
                <div className="min-w-0">
                  <span className="text-xs font-medium">
                    {change.changedBy ? (namesByUserId[change.changedBy] ?? "Співробітник") : "Початкове значення"}
                  </span>
                  <span className="ml-2 text-2xs text-muted-foreground">
                    {change.field === "vat_rate" ? "Податковий резерв" : "Постійні витрати"}
                  </span>
                </div>
                <div className="flex items-baseline gap-2 font-mono text-xs tabular-nums">
                  {change.oldValue === null ? null : (
                    <span className="text-muted-foreground line-through">{change.oldValue} %</span>
                  )}
                  <span className="font-semibold">{change.newValue} %</span>
                  <span className="text-2xs text-muted-foreground">
                    {new Date(change.changedAt).toLocaleString("uk-UA", {
                      day: "2-digit",
                      month: "2-digit",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
