import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

type ToggleGroupType = "single" | "multiple";
type ToggleGroupValue = string | string[];

type ToggleGroupContextValue = {
  type: ToggleGroupType;
  value: ToggleGroupValue;
  onItemToggle: (value: string) => void;
  disabled?: boolean;
};

const ToggleGroupContext = React.createContext<ToggleGroupContextValue | null>(null);

function useToggleGroupContext(componentName: string) {
  const context = React.useContext(ToggleGroupContext);
  if (!context) {
    throw new Error(`${componentName} must be used within a ToggleGroup`);
  }
  return context;
}

export interface ToggleGroupProps extends React.HTMLAttributes<HTMLDivElement> {
  type?: ToggleGroupType;
  value?: ToggleGroupValue;
  defaultValue?: ToggleGroupValue;
  onValueChange?: (value: ToggleGroupValue) => void;
  disabled?: boolean;
}

const ToggleGroup = React.forwardRef<HTMLDivElement, ToggleGroupProps>(
  (
    {
      type = "single",
      value,
      defaultValue,
      onValueChange,
      disabled,
      className,
      ...props
    },
    ref
  ) => {
    const isControlled = value !== undefined;
    const [internalValue, setInternalValue] = React.useState<ToggleGroupValue>(() => {
      if (type === "multiple") {
        return Array.isArray(defaultValue) ? defaultValue : [];
      }
      return typeof defaultValue === "string" ? defaultValue : "";
    });

    const currentValue = isControlled ? value : internalValue;
    const normalizedValue = React.useMemo<ToggleGroupValue>(() => {
      if (type === "multiple") {
        return Array.isArray(currentValue) ? currentValue : currentValue ? [String(currentValue)] : [];
      }
      return typeof currentValue === "string" ? currentValue : "";
    }, [currentValue, type]);

    const commitValue = React.useCallback(
      (nextValue: ToggleGroupValue) => {
        if (!isControlled) {
          setInternalValue(nextValue);
        }
        onValueChange?.(nextValue);
      },
      [isControlled, onValueChange]
    );

    const handleItemToggle = React.useCallback(
      (itemValue: string) => {
        if (disabled) return;
        if (type === "single") {
          if (normalizedValue === itemValue) return;
          commitValue(itemValue);
          return;
        }
        const currentList = normalizedValue as string[];
        const nextValue = currentList.includes(itemValue)
          ? currentList.filter((val) => val !== itemValue)
          : [...currentList, itemValue];
        commitValue(nextValue);
      },
      [disabled, type, normalizedValue, commitValue]
    );

    const contextValue = React.useMemo<ToggleGroupContextValue>(
      () => ({
        type,
        value: normalizedValue,
        onItemToggle: handleItemToggle,
        disabled,
      }),
      [type, normalizedValue, handleItemToggle, disabled]
    );

    return (
      <ToggleGroupContext.Provider value={contextValue}>
        <div
          ref={ref}
          role={type === "single" ? "radiogroup" : "group"}
          className={cn("inline-flex items-center justify-center gap-1", className)}
          {...props}
        />
      </ToggleGroupContext.Provider>
    );
  }
);

ToggleGroup.displayName = "ToggleGroup";

const toggleGroupItemVariants = cva(
  [
    "inline-flex items-center justify-center whitespace-nowrap rounded-[var(--radius-md)]",
    "text-sm font-medium transition-all",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
    "disabled:pointer-events-none disabled:opacity-50",
    "data-[state=on]:bg-muted data-[state=on]:text-foreground data-[state=on]:shadow-sm",
  ].join(" "),
  {
    variants: {
      size: {
        default: "h-9 px-3",
        sm: "h-8 px-2",
        lg: "h-10 px-4",
      },
    },
    defaultVariants: {
      size: "default",
    },
  }
);

export interface ToggleGroupItemProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof toggleGroupItemVariants> {
  value: string;
}

const ToggleGroupItem = React.forwardRef<HTMLButtonElement, ToggleGroupItemProps>(
  ({ className, value, size, disabled, onClick, ...props }, ref) => {
    const context = useToggleGroupContext("ToggleGroupItem");
    const isSelected =
      context.type === "single"
        ? context.value === value
        : (context.value as string[]).includes(value);
    const isDisabled = Boolean(context.disabled || disabled);

    const handleClick: React.MouseEventHandler<HTMLButtonElement> = (event) => {
      onClick?.(event);
      if (event.defaultPrevented || isDisabled) return;
      context.onItemToggle(value);
    };

    return (
      <button
        ref={ref}
        type="button"
        role={context.type === "single" ? "radio" : "button"}
        aria-checked={context.type === "single" ? isSelected : undefined}
        aria-pressed={context.type === "multiple" ? isSelected : undefined}
        data-state={isSelected ? "on" : "off"}
        disabled={isDisabled}
        className={cn(toggleGroupItemVariants({ size }), className)}
        onClick={handleClick}
        {...props}
      />
    );
  }
);

ToggleGroupItem.displayName = "ToggleGroupItem";

export { ToggleGroup, ToggleGroupItem, toggleGroupItemVariants };
