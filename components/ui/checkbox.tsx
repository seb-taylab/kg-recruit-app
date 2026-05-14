/**
 * @tier primitive
 * @design-spec KG_DesignSystem_v1.md §2 (Checkbox)
 */
"use client";

import * as React from "react";
import * as CheckboxPrimitive from "@radix-ui/react-checkbox";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils/cn";

export const Checkbox = React.forwardRef<
  React.ElementRef<typeof CheckboxPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root>
>(({ className, ...props }, ref) => (
  <CheckboxPrimitive.Root
    ref={ref}
    className={cn(
      // Unchecked: 2px neutral-500 border on bg-surface-card so the box
      // stays obvious on top of bg-surface-page wrappers (consent / signature
      // cards). The old border-border + bg-surface-input combo disappeared
      // against the same surface tone — users reported "no tick box".
      "peer h-5 w-5 shrink-0 rounded-sm border-2 border-neutral-500 bg-surface-card",
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-offset-2",
      "disabled:cursor-not-allowed disabled:opacity-50",
      "data-[state=checked]:border-brand-red data-[state=checked]:bg-brand-red data-[state=checked]:text-text-inverse",
      className,
    )}
    {...props}
  >
    <CheckboxPrimitive.Indicator className="flex items-center justify-center text-text-inverse">
      <Check className="h-4 w-4" strokeWidth={3} aria-hidden="true" />
    </CheckboxPrimitive.Indicator>
  </CheckboxPrimitive.Root>
));
Checkbox.displayName = "Checkbox";
