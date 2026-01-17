import { useEffect, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

type PageRevealProps = {
  children: ReactNode;
  activeKey: string;
  className?: string;
};

export function PageReveal({ children, activeKey, className }: PageRevealProps) {
  const [animate, setAnimate] = useState(false);

  useEffect(() => {
    setAnimate(false);
    const id = window.requestAnimationFrame(() => setAnimate(true));
    return () => window.cancelAnimationFrame(id);
  }, [activeKey]);

  return (
    <div className={cn("page-reveal", animate && "page-reveal--active", className)}>
      {children}
    </div>
  );
}
