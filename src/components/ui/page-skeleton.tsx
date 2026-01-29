type PageSkeletonProps = {
  /** кількість карток у гріді */
  cards?: number;
  /** кількість рядків у списку */
  rows?: number;
  /** Варіант висоти карток: "default" (240px) або "large" (220px) */
  cardVariant?: "default" | "large";
};

export function PageSkeleton(_props: PageSkeletonProps) {
  return null;
}
