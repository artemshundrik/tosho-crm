import { defineTableColumns } from "@/components/app/table-columns/tableColumns";

/**
 * Колонки таблиці «Люди», ширину яких можна змінити. «Користувач» тягнеться і
 * першою забирає вільне місце; залишок іде в кінець рядка — колонці дій.
 */
export type TeamMembersColumnId = "user" | "access" | "position" | "status" | "birthday" | "work";

export const TEAM_MEMBERS_TABLE_COLUMNS = defineTableColumns<TeamMembersColumnId>({
  ids: ["user", "access", "position", "status", "birthday", "work"],
  columns: {
    user: { label: "Користувач", def: 280, min: 200, max: 520 },
    access: { label: "Доступ", def: 130, min: 100 },
    position: { label: "Посада", def: 160, min: 120, max: 280 },
    status: { label: "Статус", def: 130, min: 100 },
    birthday: { label: "День народження", def: 150, min: 125 },
    work: { label: "Робота / Випробувальний", def: 220, min: 160, max: 360 },
  },
  // Усе тягнеться; дії 96 — гнучкі.
  grow: "user",
  fixedPx: 0,
  flexMinPx: 96,
  storageKey: "team-members-table-columns:v2",
  varPrefix: "tmcol",
});
