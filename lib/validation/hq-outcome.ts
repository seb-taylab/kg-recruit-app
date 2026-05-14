/**
 * Shared constants for the HQ outcome flow. Lives outside the
 * "use server" action file so client components can import the array
 * and the type — a `"use server"` module wraps every export as an RPC
 * stub, which breaks `.map()` over an array constant.
 */
export const HQ_REJECTION_REASONS = [
  "Incomplete information",
  "Duplicate application",
  "Eligibility not met",
  "Other",
] as const;
export type HqRejectionReason = (typeof HQ_REJECTION_REASONS)[number];
