/**
 * Minimal hand-written Database types for KG Recruit App.
 * Regenerate with: supabase gen types typescript --linked > types/database.gen.ts
 * For Step 2 we only need profile + branch tables typed.
 */

export type UserRole =
  | "branch_master_admin"
  | "branch_admin"
  | "branch_team_member"
  | "branch_chairman"
  | "wing_admin"
  | "wing_chairman"
  | "taylab_staff";

export type RoutingMode = "direct_to_chairman" | "via_branch_admin_review";

/**
 * Branch taxonomy (added in 20260517000001_wing_events_primitive.sql).
 *   territorial = constituency branch (KG, Tampines, etc.) — the existing
 *                 default; runs its own pipeline, can receive routed leads.
 *   wing        = parent layer (Young PAP, Women's Wing, etc.) — runs events
 *                 and routes leads to territorial branches.
 * A DB trigger enforces that wings cannot have a parent_wing_id and that
 * parent_wing_id (when set) points to a branch with branch_type = 'wing'.
 */
export type BranchType = "territorial" | "wing";

export interface Profile {
  /** Profile identity (multi-profile model: independent UUID, not auth.users.id). */
  id: string;
  /** Auth user FK. Many profiles per user; multi-profile model added 2026-05-17. */
  user_id: string;
  full_name: string | null;
  role: UserRole;
  branch_id: string | null;
  position: string | null;
  position_other: string | null;
  membership_no: string | null;
  is_active: boolean;
  deactivated_at: string | null;
  deactivated_by_id: string | null;
  promoted_at: string | null;
  promoted_by_id: string | null;
  created_at: string;
  created_by_id: string | null;
}

export interface Branch {
  id: string;
  name: string;
  constituency: string | null;
  hq_email: string | null;
  email_from_display_name: string | null;
  invite_ttl_hours: number | null;
  default_routing_mode: RoutingMode | null;
  nudge_config: Record<string, unknown> | null;
  is_active: boolean;
  created_at: string;
  /** territorial | wing — see BranchType. Defaults to 'territorial'. */
  branch_type: BranchType;
  /**
   * For territorial branches only: optional FK to the wing they affiliate with.
   * Wings themselves always have NULL (single-level hierarchy enforced by DB trigger).
   */
  parent_wing_id: string | null;
}

/**
 * Events — wing-organised gatherings that generate inbound leads (Sprint 2+).
 * Belongs to a wing branch; DB trigger rejects events with a territorial branch_id.
 */
export interface Event {
  id: string;
  branch_id: string;
  name: string;
  slug: string;
  event_date: string | null;
  location: string | null;
  is_active: boolean;
  created_at: string;
  created_by_id: string | null;
}

/**
 * Leads — captured at booth, routed by wing, converted to applications.
 * Added in 20260517000002_leads_capture.sql. Status enum is 7-stage:
 * CAPTURED → ROUTED → ENGAGED → CONVERTED (success path), or
 * STALLED → COLD → ARCHIVED (non-success).
 */
export type LeadStatus =
  | "CAPTURED"
  | "ROUTED"
  | "ENGAGED"
  | "CONVERTED"
  | "STALLED"
  | "COLD"
  | "ARCHIVED";

export interface Lead {
  id: string;
  event_id: string;
  wing_branch_id: string;
  full_name: string;
  mobile_number: string;
  postal_code: string | null;
  nric_last_4: string;
  email: string | null;
  consent_pdpa: boolean;
  consent_text_version: string;
  captured_by_user_id: string | null;
  captured_at: string;
  ip_address: string | null;
  user_agent: string | null;
  status: LeadStatus;
  routed_to_branch_id: string | null;
  routed_at: string | null;
  routed_by_user_id: string | null;
  converted_to_application_id: string | null;
  converted_at: string | null;
  archived_at: string | null;
  archived_by_user_id: string | null;
  archive_reason: string | null;
  /** 0 on initial route; +1 per reroute. Added in Sprint 5. */
  reroute_count: number;
}

/**
 * Reasons a wing admin can attach to a routing decision. 'initial_route'
 * is reserved for the first route (auto-assigned by routeLeadAction); the
 * others are reroute reasons.
 */
export type LeadRouteReason =
  | "initial_route"
  | "no_engagement"
  | "branch_declined"
  | "applicant_request"
  | "wing_judgment"
  | "other";

export interface LeadRouteHistory {
  id: string;
  lead_id: string;
  wing_branch_id: string;
  /** NULL on initial route; required on every reroute (enforced by trigger). */
  from_branch_id: string | null;
  to_branch_id: string;
  reason: LeadRouteReason;
  reason_note: string | null;
  routed_by_user_id: string;
  routed_at: string;
}

/**
 * Per-wing thresholds for triage scoring + reroute / cold-path policy.
 * One row per wing branch; absence implies the defaults baked into the
 * DB check constraints (2/5/7/14/30 day buckets, saturation 10).
 */
export interface WingObservationPreferences {
  wing_branch_id: string;
  ack_attention_days: number;
  engagement_attention_days: number;
  form_sent_attention_days: number;
  lead_aging_days: number;
  lead_cold_days: number;
  branch_saturation_threshold: number;
  updated_at: string;
  updated_by_user_id: string | null;
}

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: Profile;
        Insert: Partial<Profile> & { id: string; role: UserRole };
        Update: Partial<Profile>;
        Relationships: [];
      };
      branches: {
        Row: Branch;
        Insert: Partial<Branch> & { name: string };
        Update: Partial<Branch>;
        Relationships: [];
      };
      events: {
        Row: Event;
        Insert: Partial<Event> & { branch_id: string; name: string; slug: string };
        Update: Partial<Event>;
        Relationships: [];
      };
      leads: {
        Row: Lead;
        Insert: Partial<Lead> & {
          event_id: string;
          wing_branch_id: string;
          full_name: string;
          mobile_number: string;
          nric_last_4: string;
          consent_text_version: string;
        };
        Update: Partial<Lead>;
        Relationships: [];
      };
      lead_route_history: {
        Row: LeadRouteHistory;
        Insert: Partial<LeadRouteHistory> & {
          lead_id: string;
          wing_branch_id: string;
          to_branch_id: string;
          reason: LeadRouteReason;
          routed_by_user_id: string;
        };
        Update: Partial<LeadRouteHistory>;
        Relationships: [];
      };
      applications: {
        Row: {
          id: string;
          branch_id: string;
          status: string;
          created_at: string;
          surname: string | null;
          given_names: string | null;
          name: string | null;
          chairman_name_on_form: string | null;
        };
        Insert: { branch_id: string; applicant_phone: string };
        Update: { status?: string };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}

export const BRANCH_ROLES = [
  "branch_master_admin",
  "branch_admin",
  "branch_team_member",
  "branch_chairman",
] as const satisfies readonly UserRole[];

export const BRANCH_ADMIN_TEAM_ROLES = [
  "branch_master_admin",
  "branch_admin",
  "branch_team_member",
] as const satisfies readonly UserRole[];

export const WING_ROLES = [
  "wing_admin",
  "wing_chairman",
] as const satisfies readonly UserRole[];

export function isBranchRole(r: UserRole): boolean {
  return (BRANCH_ROLES as readonly string[]).includes(r);
}

export function isBranchAdminTeam(r: UserRole): boolean {
  return (BRANCH_ADMIN_TEAM_ROLES as readonly string[]).includes(r);
}

export function isWingRole(r: UserRole): boolean {
  return (WING_ROLES as readonly string[]).includes(r);
}
