import { defineTableColumns } from "@/components/app/table-columns/tableColumns";

/**
 * Колонки таблиці «Люди», ширину яких можна змінити. «Користувач» — гнучка й
 * забирає залишок, дії праворуч — фіксовані.
 */
export type TeamMembersColumnId = "access" | "position" | "status" | "birthday" | "work";

export const TEAM_MEMBERS_TABLE_COLUMNS = defineTableColumns<TeamMembersColumnId>({
  ids: ["access", "position", "status", "birthday", "work"],
  columns: {
    access: { label: "Доступ", def: 130, min: 100 },
    position: { label: "Посада", def: 160, min: 120 },
    status: { label: "Статус", def: 130, min: 100 },
    birthday: { label: "День народження", def: 150, min: 125 },
    work: { label: "Робота / Випробувальний", def: 220, min: 160 },
  },
  // Дії 96.
  fixedPx: 96,
  flexMinPx: 200,
  storageKey: "team-members-table-columns:v1",
  varPrefix: "tmcol",
});
