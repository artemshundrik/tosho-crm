import * as React from "react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";

export type IconInputProps = React.InputHTMLAttributes<HTMLInputElement> & {
  icon: React.ElementType;
  iconLabel: string;
  wrapperClassName?: string;
};

export const IconInput = React.forwardRef<HTMLInputElement, IconInputProps>(
  ({ icon: Icon, iconLabel, className, wrapperClassName, type, ...props }, ref) => {
    const innerRef = React.useRef<HTMLInputElement | null>(null);

    React.useImperativeHandle(ref, () => innerRef.current as HTMLInputElement);

    const handleIconClick = () => {
      const node = innerRef.current;
      if (!node) return;
      if (type === "date" || type === "time") {
        node.showPicker?.();
      }
      node.focus();
    };

    return (
      <div className={cn("relative w-full", wrapperClassName)}>
        <button
          type="button"
          className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          onClick={handleIconClick}
          aria-label={iconLabel}
        >
          <Icon className="h-4 w-4" />
        </button>
        <Input ref={innerRef} type={type} className={cn("pl-9 w-full", className)} {...props} />
      </div>
    );
  }
);

IconInput.displayName = "IconInput";
