/**
 * @tier primitive
 * @consumes none (shadcn/ui Button)
 * @used-by everywhere
 * @design-spec KG_DesignSystem_v1.md §2 (Button variants + states)
 * @brand-spec KG_BrandExecution_PAP.md §3.1 (verb-first labels)
 */
import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils/cn";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md font-semibold transition-colors duration-fast ease-default focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        primary:
          "bg-brand-red text-text-inverse hover:opacity-90 active:opacity-100",
        secondary:
          "bg-brand-blue text-text-inverse hover:opacity-90 active:opacity-100",
        outline:
          "border border-border bg-surface-card text-text-primary hover:bg-surface-page",
        ghost:
          "text-text-primary hover:bg-surface-page",
        destructive:
          "bg-state-error text-text-inverse hover:opacity-90 active:opacity-100",
        link:
          "text-brand-blue underline-offset-4 hover:underline",
      },
      size: {
        md: "h-12 px-4 text-base", // 48px tap target on mobile
        sm: "h-8 px-3 text-sm",
        lg: "h-12 px-6 text-base",
        icon: "h-12 w-12",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        ref={ref}
        className={cn(buttonVariants({ variant, size }), className)}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";

export { buttonVariants };
