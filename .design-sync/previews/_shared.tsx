import * as React from "react";
/** Спільна обгортка клітинки прев'ю: відступ і рівний ритм між прикладами. */
export const Cell = ({ children, className = "" }: { children: React.ReactNode; className?: string }) => (
  <div className={"p-4 " + className}>{children}</div>
);
export const Row = ({ children }: { children: React.ReactNode }) => (
  <div className="flex flex-wrap items-center gap-2 p-4">{children}</div>
);
export const Stack = ({ children }: { children: React.ReactNode }) => (
  <div className="grid max-w-sm gap-3 p-4">{children}</div>
);
