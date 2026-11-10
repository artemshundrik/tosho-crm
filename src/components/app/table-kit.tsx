import * as React from "react";
import { cn } from "@/lib/utils";
import { AvatarBase } from "@/components/app/avatar-kit";
import { Loader2 } from "@/components/icons/appIcons";
import { TableCell, TableHead, TableRow } from "@/components/ui/table";

type TableHeaderCellProps = React.ThHTMLAttributes<HTMLTableCellElement> & {
  align?: "left" | "center" | "right";
  widthClass?: string;
};

export function TableHeaderCell({
  align = "left",
  widthClass,
  className,
  ...props
}: TableHeaderCellProps) {
  return (
    <TableHead
      className={cn(
        "text-xs font-medium text-muted-foreground",
        align === "center" && "text-center",
        align === "right" && "text-right",
        widthClass,
        className
      )}
      {...props}
    />
  );
}

type TableTextHeaderCellProps = Omit<TableHeaderCellProps, "align">;

export function TableTextHeaderCell(props: TableTextHeaderCellProps) {
  return <TableHeaderCell align="left" {...props} />;
}

type TableCenterHeaderCellProps = Omit<TableHeaderCellProps, "align">;

export function TableCenterHeaderCell(props: TableCenterHeaderCellProps) {
  return <TableHeaderCell align="center" {...props} />;
}

type TableNumberHeaderCellProps = Omit<TableHeaderCellProps, "align" | "widthClass"> & {
  widthClass?: string;
};

export function TableNumberHeaderCell({
  widthClass = "w-12",
  ...props
}: TableNumberHeaderCellProps) {
  return <TableHeaderCell align="center" widthClass={widthClass} {...props} />;
}

type TableNumberCellProps = React.TdHTMLAttributes<HTMLTableCellElement> & {
  align?: "left" | "center" | "right";
};

export function TableNumberCell({ align = "center", className, ...props }: TableNumberCellProps) {
  return (
    <TableCell
      className={cn(
        "font-medium text-muted-foreground",
        align === "center" && "text-center",
        align === "right" && "text-right",
        className
      )}
      {...props}
    />
  );
}

type TableCenterCellProps = React.TdHTMLAttributes<HTMLTableCellElement>;

export function TableCenterCell({ className, children, ...props }: TableCenterCellProps) {
  return (
    <TableCell className={cn("text-center", className)} {...props}>
      <div className="flex w-full items-center justify-center">{children}</div>
    </TableCell>
  );
}

type TableNumericCellProps = React.TdHTMLAttributes<HTMLTableCellElement> & {
  align?: "left" | "center" | "right";
};

export function TableNumericCell({ align = "center", className, ...props }: TableNumericCellProps) {
  return (
    <TableCell
      className={cn(
        "tabular-nums",
        align === "center" && "text-center",
        align === "right" && "text-right",
        className
      )}
      {...props}
    />
  );
}

type TableActionCellProps = React.TdHTMLAttributes<HTMLTableCellElement>;

export function TableActionCell({ className, children, ...props }: TableActionCellProps) {
  return (
    <TableCell className={cn("text-right", className)} {...props}>
      <div className="flex items-center justify-end">{children}</div>
    </TableCell>
  );
}

type TableActionHeaderCellProps = Omit<TableHeaderCellProps, "align"> & {
  widthClass?: string;
};

export function TableActionHeaderCell({
  widthClass = "w-[96px]",
  className,
  ...props
}: TableActionHeaderCellProps) {
  return (
    <TableHeaderCell
      align="right"
      widthClass={widthClass}
      className={cn("pr-6", className)}
      {...props}
    />
  );
}

type TableAvatarCellProps = {
  src?: string | null;
  fallback: string;
  size?: number;
  variant?: "xs" | "sm" | "lg";
  className?: string;
};

export function TableAvatarCell({
  src,
  fallback,
  size,
  variant = "xs",
  className,
}: TableAvatarCellProps) {
  return (
    <AvatarBase
      src={src}
      fallback={fallback}
      variant={variant}
      size={size}
      className={className}
    />
  );
}

type TableEmptyRowProps = {
  colSpan: number;
  children: React.ReactNode;
};

export function TableEmptyRow({ colSpan, children }: TableEmptyRowProps) {
  return (
    <TableRow>
      <TableCell colSpan={colSpan} className="h-24 text-center text-sm text-muted-foreground">
        {children}
      </TableCell>
    </TableRow>
  );
}

type TableLoadingRowProps = {
  colSpan: number;
  label?: string;
};

export function TableLoadingRow({ colSpan, label = "Завантаження..." }: TableLoadingRowProps) {
  return (
    <TableRow>
      <TableCell colSpan={colSpan} className="h-24 text-center text-sm text-muted-foreground">
        <div className="flex items-center justify-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>{label}</span>
        </div>
      </TableCell>
    </TableRow>
  );
}

type TableTitleCellProps = {
  /** Аватар, лого чи значок ліворуч — 20–28 px. */
  leading?: React.ReactNode;
  title: React.ReactNode;
  /** Бейдж або позначка одразу за назвою. */
  adornment?: React.ReactNode;
  /** Сірий рядок під назвою: частини йдуть через « · », порожні відкидаються. */
  meta?: Array<React.ReactNode | string | null | undefined | false>;
  className?: string;
};

/**
 * Головна клітинка рядка: назва і ОДИН сірий рядок під нею (хвиля Б1).
 *
 * Обидва рядки обрізаються в одну лінію, тож рядок таблиці не буває вищим
 * за ~52 px — доти склад і підрядники складали вміст у три-чотири лінії, і
 * рядок ріс до 109 px. Повний текст — у підказці й у картці запису.
 */
export function TableTitleCell({ leading, title, adornment, meta, className }: TableTitleCellProps) {
  const parts = (meta ?? []).filter((part): part is React.ReactNode => part !== null && part !== undefined && part !== false && part !== "");
  const metaText = parts.every((part) => typeof part === "string") ? (parts as string[]).join(" · ") : undefined;
  return (
    <div className={cn("flex min-w-0 items-center gap-2.5", className)}>
      {leading}
      <div className="min-w-0 flex-1">
        {/* h-5: бейдж за назвою (22 px) не піднімає рядок вище за текст. */}
        <div className="flex h-5 min-w-0 items-center gap-2">
          <span className="truncate font-medium text-foreground">{title}</span>
          {adornment}
        </div>
        {parts.length > 0 ? (
          <div className="truncate text-xs text-muted-foreground" title={metaText}>
            {parts.map((part, index) => (
              <React.Fragment key={index}>
                {index > 0 ? " · " : null}
                {part}
              </React.Fragment>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Номер запису в таблиці (TS-…, TO-…, № документа) — однаково на всіх
 * списках: моно, сірий, на наведенні рядка чорніє. Рядок має клас `group`.
 */
export const TABLE_RECORD_NUMBER_TEXT = "font-mono text-sm text-muted-foreground transition-colors group-hover:text-foreground";

/** Гроші в таблиці: праворуч, рівні цифри, середня вага — однаково скрізь. */
export const TABLE_MONEY_TEXT = "figure text-right font-medium text-foreground";

/**
 * Рядок стрічки (Активність, Сповіщення) — та сама лінія, ховер і відступи,
 * що й рядок таблиці (хвиля Б1). Висоту задає сторінка: 32 px подія, 48 px
 * сповіщення з описом.
 */
export const FEED_ROW =
  "flex w-full min-w-0 items-center gap-3 border-b border-line-subtle px-4 text-left text-sm transition-colors last:border-b-0 hover:bg-tint";

/** Підпис групи в стрічці («Сьогодні», «Вчора») — як шапка колонки таблиці. */
export const FEED_GROUP_LABEL =
  "flex h-9 items-center border-b border-line-subtle bg-tint-subtle px-4 text-xs font-medium text-muted-foreground";
