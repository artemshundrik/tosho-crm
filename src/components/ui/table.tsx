import * as React from "react"

import { cn } from "@/lib/utils"

const Table = React.forwardRef<
  HTMLTableElement,
  React.HTMLAttributes<HTMLTableElement> & {
    variant?: "list" | "analytics" | "compact";
    size?: "sm" | "md" | "lg";
  }
>(({ className, variant = "list", size = "md", ...props }, ref) => {
  const sizeClasses = {
    sm: "[&_tbody_tr]:h-12 [&_th]:h-10 [&_th]:px-4 [&_td]:px-4 [&_td]:py-2.5",
    md: "[&_tbody_tr]:h-14 [&_th]:h-11 [&_th]:px-6 [&_td]:px-6 [&_td]:py-3.5",
    lg: "[&_tbody_tr]:h-16 [&_th]:h-12 [&_th]:px-6 [&_td]:px-6 [&_td]:py-4",
  };

  const variantClasses = {
    list: [
      "[&_thead]:bg-muted/45",
      "[&_th]:text-[11px] [&_th]:font-semibold [&_th]:uppercase [&_th]:tracking-[0.08em] [&_th]:text-muted-foreground",
      "[&_tbody_tr]:border-border/35 [&_tbody_tr]:transition-colors [&_tbody_tr:hover]:bg-muted/20",
    ].join(" "),
    analytics: [
      "[&_thead]:bg-background/80",
      "[&_th]:text-[11px] [&_th]:font-semibold [&_th]:uppercase [&_th]:tracking-[0.08em] [&_th]:text-muted-foreground",
      "[&_tbody_tr:hover]:bg-background/75",
      "[&_tbody_td]:tabular-nums",
    ].join(" "),
    compact: [
      "[&_thead]:bg-muted/38",
      "[&_th]:text-[11px] [&_th]:font-semibold [&_th]:uppercase [&_th]:tracking-[0.08em] [&_th]:text-muted-foreground",
      "[&_tbody_tr]:border-border/35 [&_tbody_tr:hover]:bg-muted/16",
    ].join(" "),
  };

  return (
    <div className="relative w-full overflow-auto">
      <table
        ref={ref}
        className={cn(
          "w-full caption-bottom text-sm",
          variantClasses[variant],
          sizeClasses[size],
          className
        )}
        data-variant={variant}
        data-size={size}
        {...props}
      />
    </div>
  );
})
Table.displayName = "Table"

const TableHeader = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <thead ref={ref} className={cn("[&_tr]:border-b [&_tr]:border-border/40", className)} {...props} />
))
TableHeader.displayName = "TableHeader"

const TableBody = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <tbody
    ref={ref}
    className={cn("[&_tr:last-child]:border-0", className)}
    {...props}
  />
))
TableBody.displayName = "TableBody"

const TableFooter = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <tfoot
    ref={ref}
    className={cn(
      "border-t bg-background/70 font-medium [&>tr]:last:border-b-0",
      className
    )}
    {...props}
  />
))
TableFooter.displayName = "TableFooter"

const TableRow = React.forwardRef<
  HTMLTableRowElement,
  React.HTMLAttributes<HTMLTableRowElement>
>(({ className, ...props }, ref) => (
  <tr
    ref={ref}
    className={cn(
      "border-b border-border/30 transition-colors hover:bg-muted/20 data-[state=selected]:bg-primary/5",
      className
    )}
    {...props}
  />
))
TableRow.displayName = "TableRow"

const TableHead = React.forwardRef<
  HTMLTableCellElement,
  React.ThHTMLAttributes<HTMLTableCellElement>
>(({ className, ...props }, ref) => (
  <th
    ref={ref}
    className={cn(
      "h-11 px-6 text-left align-middle text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]",
      className
    )}
    {...props}
  />
))
TableHead.displayName = "TableHead"

const TableCell = React.forwardRef<
  HTMLTableCellElement,
  React.TdHTMLAttributes<HTMLTableCellElement>
>(({ className, ...props }, ref) => (
  <td
    ref={ref}
    className={cn(
      "px-6 py-3.5 align-middle [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]",
      className
    )}
    {...props}
  />
))
TableCell.displayName = "TableCell"

const TableCaption = React.forwardRef<
  HTMLTableCaptionElement,
  React.HTMLAttributes<HTMLTableCaptionElement>
>(({ className, ...props }, ref) => (
  <caption
    ref={ref}
    className={cn("mt-4 text-sm text-muted-foreground", className)}
    {...props}
  />
))
TableCaption.displayName = "TableCaption"

export {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
}
