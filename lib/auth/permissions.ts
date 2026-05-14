/**
 * Server-side permission helpers.
 *
 * Addendum v1.3 Form Ownership Map invariant #5: every server action that
 * mutates application state must check the actor's role against the field
 * being written. These helpers throw a typed PermissionError when the
 * caller isn't allowed; callers catch and translate to a 403 response.
 */
import "server-only";
import { getAuthContext, type AuthContext } from "@/lib/auth/get-user";
import type { UserRole } from "@/types/database";

export class PermissionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PermissionError";
  }
}

/** Throws unless an active session exists. */
export async function requireAuth(): Promise<AuthContext> {
  const ctx = await getAuthContext();
  if (!ctx) throw new PermissionError("Not authenticated.");
  return ctx;
}

/** Throws unless the caller is on the Branch Admin Team for `branchId`. */
export async function requireBranchAdminTeam(branchId: string): Promise<AuthContext> {
  const ctx = await requireAuth();
  if (ctx.profile.role === "taylab_staff") return ctx;
  if (ctx.profile.branch_id !== branchId) {
    throw new PermissionError("You don't have access to this branch.");
  }
  const adminRoles: UserRole[] = ["branch_master_admin", "branch_admin", "branch_team_member"];
  if (!adminRoles.includes(ctx.profile.role)) {
    throw new PermissionError("Branch admin team only.");
  }
  return ctx;
}

/** Throws unless the caller is a Master Admin for `branchId`. */
export async function requireBranchMaster(branchId: string): Promise<AuthContext> {
  const ctx = await requireAuth();
  if (ctx.profile.role === "taylab_staff") return ctx;
  if (ctx.profile.branch_id !== branchId) {
    throw new PermissionError("You don't have access to this branch.");
  }
  if (ctx.profile.role !== "branch_master_admin") {
    throw new PermissionError("Master Admin only.");
  }
  return ctx;
}
