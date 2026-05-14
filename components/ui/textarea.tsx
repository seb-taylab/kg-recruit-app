/**
 * @tier primitive
 * @design-spec KG_DesignSystem_v1.md §2 (Textarea)
 */
import * as React from "react";
import { cn } from "@/lib/utils/cn";

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  hasError?: boolean;
}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, hasError, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cn(
        "flex min-h-24 w-full rounded-md border bg-surface-input px-3 py-2 text-base text-text-primary placeholder:text-text-disabled",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-offset-2",
        "disabled:cursor-not-allowed disabled:bg-surface-input-disabled disabled:text-text-disabled",
        hasError ? "border-border-error" : "border-border",
        className,
      )}
      {...props}
    />
  ),
);
Textarea.displayName = "Textarea";
