import * as React from "react";
import { Eye, EyeOff } from "lucide-react";

import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";

type PasswordInputProps = React.ComponentProps<"input"> & {
  wrapperClassName?: string;
  inputClassName?: string;
};

const PasswordInput = React.forwardRef<HTMLInputElement, PasswordInputProps>(
  ({ className, disabled, wrapperClassName, inputClassName, ...props }, ref) => {
    const [visible, setVisible] = React.useState(false);
    const isDisabled = Boolean(disabled);

    return (
      <div className={cn("relative w-full", wrapperClassName)}>
        <Input
          ref={ref}
          type={visible ? "text" : "password"}
          className={cn("pr-11", className, inputClassName)}
          disabled={disabled}
          {...props}
        />
        <div className="absolute inset-y-0 right-2 z-10 flex items-center">
          <button
            type="button"
            onClick={() => setVisible((v) => !v)}
            className={cn(
              "inline-flex h-8 w-8 items-center justify-center rounded-full",
              "text-muted-foreground transition-colors hover:text-foreground hover:bg-muted/40",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30",
              isDisabled && "pointer-events-none opacity-50"
            )}
            aria-label={visible ? "Сховати пароль" : "Показати пароль"}
            title={visible ? "Сховати пароль" : "Показати пароль"}
            disabled={isDisabled}
          >
            {visible ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
          </button>
        </div>
      </div>
    );
  }
);

PasswordInput.displayName = "PasswordInput";

export { PasswordInput };
