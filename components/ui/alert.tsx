/**
 * @tier primitive
 * @design-spec KG_DesignSystem_v1.md §2 (Alert: default, destructive, warning)
 */
import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils/cn";

const alertVariants = cva(
  "relative w-full rounded-md border p-4 text-sm",
  {
    variants: {
      variant: {
        info: "border-state-info bg-surface-card text-text-primary [&>svg]:text-state-info",
        warning: "border-state-warning bg-surface-card text-text-primary [&>svg]:text-state-warning",
        destructive: "border-state-error bg-surface-card text-state-error [&>svg]:text-state-error",
      },
    },
    defaultVariants: { variant: "info" },
  },
);

export const Alert = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & VariantProps<typeof alertVariants>
>(({ className, variant, ...props }, ref) => (
  <div ref={ref} role="alert" className={cn(alertVariants({ variant }), className)} {...props} />
));
Alert.displayName = "Alert";

export const AlertTitle = React.forwardRef<
  HTMLHeadingElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h5 ref={ref} className={cn("mb-1 font-semibold leading-snug", className)} {...props} />
));
AlertTitle.displayName = "AlertTitle";

export const AlertDescription = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("text-sm leading-snug", className)} {...props} />
));
AlertDescription.displayName = "AlertDescription";
