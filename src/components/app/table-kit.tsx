import * as React from "react";
import { cn } from "@/lib/utils";
import { AvatarBase } from "@/components/app/avatar-kit";
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
        "text-xs font-semibold text-muted-foreground normal-case tracking-normal",
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
