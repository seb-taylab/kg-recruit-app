/**
 * @tier primitive
 * @design-spec KG_DesignSystem_v1.md §2 (Input: default, error states)
 */
import * as React from "react";
import { cn } from "@/lib/utils/cn";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  hasError?: boolean;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, hasError, ...props }, ref) => (
    <input
      ref={ref}
      type={type}
      className={cn(
        "flex h-12 w-full rounded-md border bg-surface-input px-3 py-2 text-base text-text-primary placeholder:text-text-disabled",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-offset-2",
        "disabled:cursor-not-allowed disabled:bg-surface-input-disabled disabled:text-text-disabled",
        hasError ? "border-border-error" : "border-border",
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = "Input";
