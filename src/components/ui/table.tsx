import * as React from "react"

import { cn } from "@/lib/utils"

const Table = React.forwardRef<
  HTMLTableElement,
  React.HTMLAttributes<HTMLTableElement> & {
    variant?: "list" | "analytics" | "compact";
    size?: "sm" | "md" | "lg";
  }
>(({ className, variant, size, ...props }, ref) => {
  const sizeClasses = {
    sm: "[&_tbody_tr]:h-12 [&_th]:h-9 [&_th]:px-4 [&_td]:px-4 [&_td]:py-2.5",
    md: "[&_tbody_tr]:h-14 [&_th]:h-10 [&_th]:px-6 [&_td]:px-6 [&_td]:py-3",
    lg: "[&_tbody_tr]:h-16 [&_th]:h-12 [&_th]:px-6 [&_td]:px-6 [&_td]:py-4",
  };

  const variantClasses = {
    list: [
      "[&_thead]:bg-muted/20",
      "[&_th]:text-xs [&_th]:font-semibold [&_th]:text-muted-foreground",
      "[&_tbody_tr]:border-border/50 [&_tbody_tr]:transition-colors [&_tbody_tr:hover]:bg-muted/30",
    ].join(" "),
    analytics: [
      "[&_thead]:bg-muted/40",
      "[&_th]:text-xs [&_th]:font-semibold [&_th]:text-muted-foreground",
      "[&_tbody_tr:hover]:bg-muted/40",
      "[&_tbody_td]:tabular-nums",
    ].join(" "),
    compact: [
      "[&_thead]:bg-muted/10",
      "[&_th]:text-xs [&_th]:font-semibold [&_th]:text-muted-foreground",
      "[&_tbody_tr]:border-border/50 [&_tbody_tr:hover]:bg-muted/20",
    ].join(" "),
  };

  return (
    <div className="relative w-full overflow-auto">
      <table
        ref={ref}
        className={cn(
          "w-full caption-bottom text-sm",
          variant ? variantClasses[variant] : null,
          size ? sizeClasses[size] : null,
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
  <thead ref={ref} className={cn("[&_tr]:border-b", className)} {...props} />
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
      "border-t bg-muted/50 font-medium [&>tr]:last:border-b-0",
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
      "border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted",
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
      "h-10 px-2 text-left align-middle font-medium text-muted-foreground [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]",
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
      "p-2 align-middle [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]",
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
