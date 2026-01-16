import * as React from "react";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export type Column<T> = {
  header: string;
  accessor: keyof T | ((item: T) => React.ReactNode);
  className?: string;
  align?: "left" | "center" | "right";
  sortableKey?: string;
};

interface DataTableProps<T> {
  data: T[];
  columns: Column<T>; // спрощено для демонстрації, зазвичай масив Column<T>[]
  onRowClick?: (item: T) => void;
  renderPlayerCell?: (item: T) => React.ReactNode; // спеціальний рендер для колонки гравця
}

// Допоміжний компонент для клітинки гравця (стиль зі StatsPage)
export function PlayerInfoCell({ 
  name, 
  number, 
  position, 
  photoUrl 
}: { 
  name: string; 
  number?: number | string | null; 
  position?: string | null; 
  photoUrl?: string | null 
}) {
  const initials = name.split(" ").map(n => n[0]).join("").toUpperCase();
  
  return (
    <div className="flex items-center gap-3">
      <Avatar className="h-10 w-10 rounded-[var(--radius-lg)] border border-border/50 shadow-sm transition-transform group-hover:scale-105">
        <AvatarImage src={photoUrl || ""} className="object-cover" />
        <AvatarFallback className="rounded-[var(--radius-lg)] bg-muted text-[10px] font-bold">{initials}</AvatarFallback>
      </Avatar>
      <div className="flex flex-col min-w-0">
        <span className="text-sm font-semibold text-foreground truncate leading-tight">{name}</span>
        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground uppercase tracking-tight">
          {number && <span>#{number}</span>}
          {number && position && <span className="opacity-30">•</span>}
          <span>{position || "Гравець"}</span>
        </div>
      </div>
    </div>
  );
}
