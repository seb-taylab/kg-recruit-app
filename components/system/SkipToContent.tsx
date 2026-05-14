/**
 * @tier atomic
 * @design-spec KG_DesignSystem_v1.md §7.8 (Accessibility — skip link)
 * @consumes none (pure HTML + Tailwind)
 * @used-by app/(dashboard)/layout.tsx, app/(public)/layout.tsx
 */
export function SkipToContent() {
  return (
    <a
      href="#main"
      className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-toast focus:rounded-md focus:bg-brand-red focus:px-4 focus:py-2 focus:text-text-inverse focus:shadow-md"
    >
      Skip to main content
    </a>
  );
}
