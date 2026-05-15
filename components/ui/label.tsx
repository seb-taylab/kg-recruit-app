/**
 * @tier primitive
 * @design-spec KG_DesignSystem_v1.md §2 (Label)
 *
 * Wraps Radix Label with an optional `required` prop. When true, a
 * non-interactive red asterisk renders after the children — purely
 * a visual hint; the actual required-validation lives at the zod
 * layer where false-positives are caught.
 */
"use client";

import * as React from "react";
import * as LabelPrimitive from "@radix-ui/react-label";
import { cn } from "@/lib/utils/cn";

interface LabelProps
  extends React.ComponentPropsWithoutRef<typeof LabelPrimitive.Root> {
  /** Show a red "*" after the label text. Default false. */
  required?: boolean;
}

export const Label = React.forwardRef<
  React.ElementRef<typeof LabelPrimitive.Root>,
  LabelProps
>(({ className, required, children, ...props }, ref) => (
  <LabelPrimitive.Root
    ref={ref}
    className={cn(
      "text-sm font-medium text-text-primary peer-disabled:cursor-not-allowed peer-disabled:opacity-70",
      className,
    )}
    {...props}
  >
    {children}
    {required && (
      <span
        aria-hidden="true"
        className="ml-1 text-state-error"
        // Decorative — screen readers learn from the underlying input's
        // `required` attribute / aria-required, not from this glyph.
      >
        *
      </span>
    )}
  </LabelPrimitive.Root>
));
Label.displayName = "Label";
