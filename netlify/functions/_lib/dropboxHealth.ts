import { dropboxService } from "./dropbox.service";

/**
 * Стан зв'язку CRM ↔ Dropbox одним запитом.
 *
 * Навіщо: за одну добу ми створили 91 теку, 89 прив'язок і залили 1162 файли.
 * Усе це тихо псується, якщо ніхто не дивиться — рівно так ми й дізналися, що
 * теки «Бренд» стояли порожні місяцями, а експортом не користувались із травня.
 * Перевірка робить розпад помітним у той же день, а не через півроку.
 *
 * Модуль спільний навмисно: ті самі числа підуть і в Telegram, і в
 * Observability. Дві реалізації однієї перевірки неминуче розійдуться, і тоді
 * доведеться з'ясовувати, якій із них вірити.
 */

const CLIENTS_ROOT = "/Tosho Team Folder/Замовники";

/** Теки, що не належать замовникам: службові й наші власні. */
const NON_CUSTOMER_FOLDERS = new Set(["_Без замовника", "_Розібрати", "ToSho", "ЗСУ"]);

/**
 * Кирилиця й латиниця містять візуально однакові літери. У базі вже траплялось
 * «Wookiе» з кириличною «е» і тека «А.tom» з кириличною «А» — без зведення
 * гомогліфів вони виглядають як різні клієнти, і з'являється дубль.
 */
const HOMOGLYPHS: Record<string, string> = {
  а: "a", е: "e", і: "i", о: "o", р: "p", с: "c", у: "y", х: "x", к: "k", в: "b", м: "m", т: "t", н: "h",
};

export function normalizeFolderName(value: string | null | undefined): string {
  const base = String(value ?? "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^0-9a-zа-яіїєґ]+/g, "");
  return base
    .split("")
    .map((ch) => HOMOGLYPHS[ch] ?? ch)
    .join("");
}

export type DropboxHealth = {
  folders: number;
  linkedCustomers: number;
  linkedLeads: number;
  /** Прив'язка є, а теки в Dropbox немає — хтось видалив або посунув її руками. */
  brokenLinks: Array<{ name: string; path: string; kind: "customer" | "lead" }>;
  /**
   * Тека на місці, а збережене shared-посилання Dropbox уже не знає.
   *
   * Окрема категорія, бо ламається окремо: посилання — це самостійний об'єкт.
   * Видалили теку й створили заново з тією ж назвою — шлях знову валідний,
   * а посилання мертве назавжди, і кнопка в картці каже «цей об'єкт видалено».
   * Перша версія перевірки цього не питала взагалі: ми звіряли шлях і
   * доповідали «прив'язано», хоча кнопка не працювала.
   */
  deadLinks: Array<{ name: string; kind: "customer" | "lead"; which: "folder" | "brand" }>;
  /** Скільки посилань перевірено (0, якщо перевірка вимкнена). */
  linksChecked: number;
  /** Тека є, власника в CRM немає. */
  orphanFolders: string[];
  /** Дві теки на одного клієнта після нормалізації назви. */
  duplicateFolders: string[][];
  /** Назва в CRM розійшлася з назвою теки — косметика, але веде до плутанини. */
  drifted: Array<{ crmName: string; folderName: string }>;
  /** Затверджені задачі з файлами, яких немає в Dropbox. */
  approvedNotInDropbox: number;
  /** Затверджені задачі, де менеджер не відмітив жодного файлу. */
  approvedWithoutMarkedFiles: number;
  approvedTotal: number;
  /** Чи рахували статистику по задачах — див. `includeTaskStats`. */
  taskStatsIncluded: boolean;
  /**
   * Службові купи «на потім»: `_Розібрати` і `_Без замовника`.
   *
   * Навмисно виведені в окреме поле. Вони не рахуються серед «тек без
   * власника», бо це не помилка зв'язку, — але саме тому їх ніхто й не бачив:
   * у «_Без замовника» тихо накопичилось 172 файли, і за весь час туди ніхто
   * не повернувся. Число, яке нікому не показують, не розбирають ніколи.
   */
  unsorted: Array<{ folder: string; files: number; bytes: number }>;
};

export type DropboxHealthOptions = {
  /**
   * Статистика по задачах вимагає прочитати metadata всіх дизайн-задач — це
   * кілька мегабайтів. Для звіту на вимогу це нормально, а для щогодинної
   * перевірки — марна витрата: числа там міняються раз на день, не раз на
   * годину. Гарячі шляхи вимикають її і рахують лише структуру тек.
   */
  includeTaskStats?: boolean;
  /**
   * Чи перевіряти, що збережені shared-посилання ще живі. Це близько 230
   * запитів до Dropbox, тож для щогодинної перевірки задорого — вмикаємо там,
   * де звіт відкривають руками.
   */
  verifyLinks?: boolean;
};

type SupabaseLike = {
  schema: (name: string) => {
    from: (table: string) => {
      select: (columns: string) => Promise<{ data: unknown[] | null; error: { message: string } | null }>;
    };
  };
  from: (table: string) => {
    select: (columns: string) => {
      eq: (column: string, value: string) => Promise<{ data: unknown[] | null; error: { message: string } | null }>;
    };
  };
};

export async function collectDropboxHealth(
  admin: SupabaseLike,
  options: DropboxHealthOptions = {}
): Promise<DropboxHealth> {
  const includeTaskStats = options.includeTaskStats ?? true;
  const listing = await dropboxService.listFolder(CLIENTS_ROOT);
  const folderNames = listing.entries
    .filter((entry) => entry[".tag"] === "folder" && typeof entry.name === "string")
    .map((entry) => entry.name as string);
  // Службові теки виключаємо ЛИШЕ з пошуку «нічиїх». Для перевірки «чи існує
  // тека, на яку вказує прив'язка» потрібен повний перелік — інакше прив'язка
  // на «ToSho» виглядала б розірваною, хоча тека на місці.
  const customerFolders = folderNames.filter((name) => !NON_CUSTOMER_FOLDERS.has(name));
  const folderByNorm = new Map<string, string[]>();
  for (const name of folderNames) {
    const key = normalizeFolderName(name);
    if (!folderByNorm.has(key)) folderByNorm.set(key, []);
    (folderByNorm.get(key) as string[]).push(name);
  }

  const { data: customerRows, error: customersError } = await admin
    .schema("tosho")
    .from("customers")
    .select("name,dropbox_client_path,dropbox_shared_url,dropbox_brand_shared_url");
  if (customersError) throw new Error(`customers: ${customersError.message}`);

  const { data: leadRows, error: leadsError } = await admin
    .schema("tosho")
    .from("leads")
    .select("company_name,dropbox_client_path,dropbox_shared_url,dropbox_brand_shared_url");
  if (leadsError) throw new Error(`leads: ${leadsError.message}`);

  type LinkRow = {
    dropbox_client_path?: string | null;
    dropbox_shared_url?: string | null;
    dropbox_brand_shared_url?: string | null;
  };
  type Party = {
    name: string;
    path: string | null;
    kind: "customer" | "lead";
    folderUrl: string | null;
    brandUrl: string | null;
  };
  const toParty = (name: string, row: LinkRow, kind: "customer" | "lead"): Party => ({
    name: name.trim(),
    path: (row.dropbox_client_path ?? "").trim() || null,
    kind,
    folderUrl: (row.dropbox_shared_url ?? "").trim() || null,
    brandUrl: (row.dropbox_brand_shared_url ?? "").trim() || null,
  });
  const parties: Party[] = [
    ...((customerRows ?? []) as Array<LinkRow & { name?: string | null }>).map((row) =>
      toParty(row.name ?? "", row, "customer")),
    ...((leadRows ?? []) as Array<LinkRow & { company_name?: string | null }>).map((row) =>
      toParty(row.company_name ?? "", row, "lead")),
  ].filter((party) => party.name);

  const linkedByNorm = new Set<string>();
  const brokenLinks: DropboxHealth["brokenLinks"] = [];
  const drifted: DropboxHealth["drifted"] = [];
  let linkedCustomers = 0;
  let linkedLeads = 0;

  for (const party of parties) {
    if (!party.path) continue;
    if (party.kind === "customer") linkedCustomers += 1;
    else linkedLeads += 1;

    // Остання ланка шляху і є назвою теки.
    const folderName = party.path.split("/").filter(Boolean).pop() ?? "";
    const key = normalizeFolderName(folderName);
    linkedByNorm.add(key);

    if (!folderByNorm.has(key)) {
      brokenLinks.push({ name: party.name, path: party.path, kind: party.kind });
      continue;
    }
    if (normalizeFolderName(party.name) !== key) {
      drifted.push({ crmName: party.name, folderName });
    }
  }

  const orphanFolders = customerFolders.filter((name) => !linkedByNorm.has(normalizeFolderName(name)));
  const duplicateFolders = Array.from(folderByNorm.entries())
    .filter(([, group]) => group.length > 1)
    .map(([, group]) => group);

  let approvedTotal = 0;
  let approvedNotInDropbox = 0;
  let approvedWithoutMarkedFiles = 0;

  const taskRows = includeTaskStats ? await loadDesignTaskMetadata(admin) : [];
  for (const row of taskRows) {
    const meta = row.metadata ?? {};
    if (meta.status !== "approved") continue;
    const files = Array.isArray(meta.design_output_files) ? meta.design_output_files : [];
    if (files.length === 0) continue;

    approvedTotal += 1;
    if (!meta.dropbox_last_exported_at) approvedNotInDropbox += 1;

    if (!hasMarkedFiles(meta)) approvedWithoutMarkedFiles += 1;
  }

  // Живі посилання. Перевіряємо пачками: послідовно 230 запитів не вкладаються
  // в ліміт функції, а всі разом Dropbox почне різати за частоту.
  const deadLinks: DropboxHealth["deadLinks"] = [];
  let linksChecked = 0;
  if (options.verifyLinks) {
    const targets: Array<{ party: Party; url: string; which: "folder" | "brand" }> = [];
    for (const party of parties) {
      if (party.folderUrl) targets.push({ party, url: party.folderUrl, which: "folder" });
      if (party.brandUrl) targets.push({ party, url: party.brandUrl, which: "brand" });
    }
    const BATCH = 10;
    for (let i = 0; i < targets.length; i += BATCH) {
      const batch = targets.slice(i, i + BATCH);
      const alive = await Promise.all(batch.map((item) => dropboxService.isSharedLinkAlive(item.url)));
      batch.forEach((item, index) => {
        linksChecked += 1;
        if (!alive[index]) deadLinks.push({ name: item.party.name, kind: item.party.kind, which: item.which });
      });
    }
  }

  // Купи «на потім» рахуємо лише в повному звіті: це два рекурсивні обходи,
  // а числа там міняються раз на тиждень, не раз на годину.
  const unsorted: DropboxHealth["unsorted"] = [];
  if (includeTaskStats) {
    for (const name of ["_Розібрати", "_Без замовника"]) {
      if (!folderNames.includes(name)) continue;
      try {
        const listed = await dropboxService.listFolderRecursive(`${CLIENTS_ROOT}/${name}`);
        const files = listed.entries.filter((entry) => entry[".tag"] === "file");
        unsorted.push({
          folder: name,
          files: files.length,
          bytes: files.reduce((sum, file) => sum + (typeof file.size === "number" ? file.size : 0), 0),
        });
      } catch {
        // Недоступна службова тека не має валити весь звіт.
      }
    }
  }

  return {
    folders: customerFolders.length,
    linkedCustomers,
    linkedLeads,
    brokenLinks,
    orphanFolders,
    duplicateFolders,
    drifted,
    approvedNotInDropbox,
    approvedWithoutMarkedFiles,
    approvedTotal,
    taskStatsIncluded: includeTaskStats,
    unsorted,
    deadLinks,
    linksChecked,
  };
}

/**
 * Чи відмітив менеджер хоч один затверджений файл у задачі.
 *
 * Перевіряємо ЗНАЧЕННЯ, а не наявність ключа. Ключ
 * `selected_design_output_file_id` існує в 79 задачах зі значенням null —
 * перша версія рахувала їх як відмічені й давала 51% замість справжніх 18%.
 * Помилка втричі занизила масштаб проблеми, тому перевірка винесена окремо
 * й покрита тестом.
 */
export function hasMarkedFiles(meta: Record<string, unknown>): boolean {
  const listed =
    (Array.isArray(meta.selected_visual_output_file_ids) ? meta.selected_visual_output_file_ids.length : 0) +
    (Array.isArray(meta.selected_layout_output_file_ids) ? meta.selected_layout_output_file_ids.length : 0) +
    (Array.isArray(meta.selected_design_output_file_ids) ? meta.selected_design_output_file_ids.length : 0);
  if (listed > 0) return true;
  return typeof meta.selected_design_output_file_id === "string" && meta.selected_design_output_file_id.trim() !== "";
}

async function loadDesignTaskMetadata(
  admin: SupabaseLike
): Promise<Array<{ metadata?: Record<string, unknown> | null }>> {
  const { data, error } = await admin.from("activity_log").select("metadata").eq("action", "design_task");
  if (error) throw new Error(`activity_log: ${error.message}`);
  return (data ?? []) as Array<{ metadata?: Record<string, unknown> | null }>;
}

/**
 * Червоне — лише те, що ЗЛАМАНЕ: прив'язка веде в нікуди або на одного клієнта
 * завелося дві теки. Таке саме не розсмокчеться і мовчки розводить файли по
 * різних місцях.
 *
 * «Затверджені поза Dropbox» сюди НЕ входить, хоч і виглядає тривожно.
 * Перенесення поки ручне, тож щойно затверджена задача законно висить без
 * копії, доки менеджер не натисне кнопку. Якби це світило червоним, сигнал
 * горів би завжди — і його б перестали читати. Коли зробимо автоперенесення
 * (фаза 2), ненульове значення стане справжньою ознакою збою, і тоді його сюди
 * треба додати.
 */
export function hasDropboxProblems(health: DropboxHealth): boolean {
  return health.brokenLinks.length > 0 || health.duplicateFolders.length > 0 || health.deadLinks.length > 0;
}

export function formatDropboxHealthForTelegram(health: DropboxHealth): string {
  const lines: string[] = ["<b>Dropbox — стан зв'язку з CRM</b>", ""];

  lines.push(`Тек замовників: <b>${health.folders}</b>`);
  lines.push(`Прив'язано: ${health.linkedCustomers} замовників, ${health.linkedLeads} лідів`);
  lines.push("");

  if (health.brokenLinks.length > 0) {
    lines.push(`❗️ <b>Прив'язка без теки: ${health.brokenLinks.length}</b>`);
    for (const item of health.brokenLinks.slice(0, 5)) {
      lines.push(`   ${item.name}${item.kind === "lead" ? " (лід)" : ""}`);
    }
    if (health.brokenLinks.length > 5) lines.push(`   …ще ${health.brokenLinks.length - 5}`);
  }

  if (health.deadLinks.length > 0) {
    lines.push(`❗️ <b>Кнопка веде в нікуди: ${health.deadLinks.length}</b>`);
    for (const item of health.deadLinks.slice(0, 5)) {
      lines.push(`   ${item.name}${item.which === "brand" ? " · Бренд" : ""}`);
    }
    if (health.deadLinks.length > 5) lines.push(`   …ще ${health.deadLinks.length - 5}`);
  }

  if (health.duplicateFolders.length > 0) {
    lines.push(`❗️ <b>Дублікати тек: ${health.duplicateFolders.length}</b>`);
    for (const group of health.duplicateFolders.slice(0, 5)) lines.push(`   ${group.join(" ↔ ")}`);
  }

  if (!hasDropboxProblems(health)) lines.push("✅ Зв'язок цілий");

  if (health.taskStatsIncluded && health.approvedNotInDropbox > 0) {
    lines.push(`Затверджених задач ще не перенесено: ${health.approvedNotInDropbox}`);
  }

  lines.push("");
  if (health.orphanFolders.length > 0) {
    lines.push(`Теки без власника в CRM: ${health.orphanFolders.length}`);
    lines.push(`   ${health.orphanFolders.slice(0, 8).join(", ")}`);
  }
  if (health.drifted.length > 0) {
    lines.push(`Назва в CRM ≠ назва теки: ${health.drifted.length}`);
    for (const item of health.drifted.slice(0, 5)) {
      lines.push(`   ${item.crmName} → теку названо «${item.folderName}»`);
    }
  }

  for (const pile of health.unsorted) {
    if (pile.files === 0) continue;
    const mb = Math.round(pile.bytes / 1024 / 1024);
    lines.push(`Чекає на розбір у «${pile.folder}»: ${pile.files} файлів, ${mb} МБ`);
  }

  if (health.taskStatsIncluded) {
    const marked = health.approvedTotal - health.approvedWithoutMarkedFiles;
    const percent = health.approvedTotal > 0 ? Math.round((marked / health.approvedTotal) * 100) : 0;
    lines.push(`Затверджено з відміткою файлів: ${marked} з ${health.approvedTotal} (${percent}%)`);
  }

  return lines.join("\n");
}
