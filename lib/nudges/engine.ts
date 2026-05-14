/**
 * Auto-nudge engine.
 *
 * For each enabled stage:
 *   1. Pick candidate applications (status + time anchor > interval ago).
 *   2. Skip apps that already got this stage's nudge within `interval_hours`.
 *   3. Resolve recipient emails by kind (applicant / referral / chairman / admin / all_admins).
 *   4. Send via Resend; record nudge_sends row + audit log; nothing else.
 *
 * Designed to run from an Edge Function (Deno) or a Node script — only
 * depends on a Supabase client and a `sendEmail` function passed in.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  NUDGE_STAGES,
  STAGE_STATUS,
  type NudgeStage,
  type NudgeConfig,
  type NudgeRecipientKind,
  type StageConfig,
} from "@/lib/nudges/stages";
import { NUDGE_TEMPLATES } from "@/lib/nudges/templates";

export interface SendEmailFn {
  (params: {
    to: string | string[];
    subject: string;
    html: string;
    text: string;
  }): Promise<{ ok: boolean; error?: string }>;
}

export interface NudgeRunResult {
  total: number;
  byStage: Record<NudgeStage, number>;
  errors: Array<{ stage: NudgeStage; applicationId: string; error: string }>;
}

interface ApplicationRow {
  id: string;
  branch_id: string;
  status: string;
  applicant_name_at_invite: string | null;
  applicant_email: string | null;
  invited_by_admin_id: string | null;
  assigned_referral_email: string | null;
  applicant_invited_at: string | null;
  applicant_filling_started_at: string | null;
  referral_assigned_at: string | null;
  branch_admin_review_at: string | null;
  referral_signed_at: string | null;
  ready_to_send_at: string | null;
  sent_to_hq_at: string | null;
}

interface BranchRow {
  id: string;
  name: string;
  nudge_config: NudgeConfig | null;
}

interface PlatformNudgeRow {
  value: NudgeConfig | null;
}

/**
 * Stage → anchor column on the applications row. We schedule the next
 * nudge `interval_hours` after this timestamp (or after the previous
 * nudge_sends.sent_at, whichever is later).
 */
function anchorFor(stage: NudgeStage, app: ApplicationRow): string | null {
  switch (stage) {
    case "applicant_link_unopened":
      return app.applicant_invited_at;
    case "applicant_form_in_draft":
      return app.applicant_filling_started_at ?? app.applicant_invited_at;
    case "referral_unsigned":
      return app.referral_assigned_at;
    case "chairman_unsigned":
      return app.branch_admin_review_at ?? app.referral_signed_at;
    case "ready_to_send_unactioned":
      return app.ready_to_send_at;
    case "at_hq_stalled":
      return app.sent_to_hq_at;
  }
}

function resolveStageConfig(
  stage: NudgeStage,
  branchConfig: NudgeConfig | null,
  platformConfig: NudgeConfig | null,
): StageConfig | null {
  return branchConfig?.[stage] ?? platformConfig?.[stage] ?? null;
}

async function resolveRecipients(
  sb: SupabaseClient,
  kinds: NudgeRecipientKind[],
  app: ApplicationRow,
): Promise<string[]> {
  const out = new Set<string>();
  for (const kind of kinds) {
    switch (kind) {
      case "applicant":
        if (app.applicant_email) out.add(app.applicant_email);
        break;
      case "referral":
        if (app.assigned_referral_email) out.add(app.assigned_referral_email);
        break;
      case "chairman":
      case "admin":
      case "all_admins": {
        const roles =
          kind === "chairman"
            ? ["branch_chairman"]
            : kind === "admin"
              ? ["branch_admin", "branch_master_admin"]
              : ["branch_admin", "branch_master_admin"];
        const { data: profiles } = await sb
          .from("profiles")
          .select("id")
          .eq("branch_id", app.branch_id)
          .eq("is_active", true)
          .in("role", roles);
        const ids = ((profiles ?? []) as Array<{ id: string }>).map((p) => p.id);
        // The `admin` kind specifically targets the inviting admin, not all admins.
        const filteredIds = kind === "admin" && app.invited_by_admin_id
          ? ids.filter((id) => id === app.invited_by_admin_id)
          : ids;
        for (const id of filteredIds) {
          const { data: u } = await sb.auth.admin.getUserById(id);
          if (u?.user?.email) out.add(u.user.email);
        }
        break;
      }
    }
  }
  return [...out];
}

/**
 * Main entrypoint. Run once per scheduling tick. Idempotent within the
 * interval (nudge_sends recency check), so it's safe to invoke more
 * frequently than the interval.
 */
export async function runNudgeEngine(
  sb: SupabaseClient,
  sendEmail: SendEmailFn,
): Promise<NudgeRunResult> {
  const byStage: Record<NudgeStage, number> = {
    applicant_link_unopened: 0,
    applicant_form_in_draft: 0,
    referral_unsigned: 0,
    chairman_unsigned: 0,
    ready_to_send_unactioned: 0,
    at_hq_stalled: 0,
  };
  const errors: NudgeRunResult["errors"] = [];

  // Platform default config.
  const { data: platRow } = await sb
    .from("platform_settings")
    .select("value")
    .eq("key", "nudge_config")
    .single();
  const platformConfig = (platRow as PlatformNudgeRow | null)?.value ?? null;

  // All active branches with their per-branch override config.
  const { data: branchRows } = await sb
    .from("branches")
    .select("id, name, nudge_config")
    .eq("is_active", true);
  const branches = (branchRows as BranchRow[] | null) ?? [];
  const branchById = new Map(branches.map((b) => [b.id, b] as const));

  const now = Date.now();

  for (const stage of NUDGE_STAGES) {
    const status = STAGE_STATUS[stage];
    const { data: appRows } = await sb
      .from("applications")
      .select(
        "id, branch_id, status, applicant_name_at_invite, applicant_email, invited_by_admin_id, assigned_referral_email, applicant_invited_at, applicant_filling_started_at, referral_assigned_at, branch_admin_review_at, referral_signed_at, ready_to_send_at, sent_to_hq_at",
      )
      .eq("status", status);
    const apps = (appRows as ApplicationRow[] | null) ?? [];

    for (const app of apps) {
      const branch = branchById.get(app.branch_id);
      if (!branch) continue;

      const cfg = resolveStageConfig(stage, branch.nudge_config, platformConfig);
      if (!cfg || !cfg.enabled) continue;
      const intervalHours = cfg.intervals_hours?.[0];
      if (!intervalHours || intervalHours <= 0) continue;

      const anchor = anchorFor(stage, app);
      if (!anchor) continue;
      const anchorMs = new Date(anchor).getTime();
      if (now - anchorMs < intervalHours * 60 * 60 * 1000) continue;

      const { data: lastSendRow } = await sb
        .from("nudge_sends")
        .select("sent_at")
        .eq("application_id", app.id)
        .eq("stage", stage)
        .order("sent_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      const lastSend = (lastSendRow as { sent_at: string } | null)?.sent_at;
      if (lastSend) {
        const lastMs = new Date(lastSend).getTime();
        if (now - lastMs < intervalHours * 60 * 60 * 1000) continue;
      }

      const recipients = await resolveRecipients(sb, cfg.recipients, app);
      if (recipients.length === 0) continue;

      const tmpl = NUDGE_TEMPLATES[stage];
      const vars = {
        applicantName: app.applicant_name_at_invite ?? "there",
        branchName: branch.name,
      };
      const sendRes = await sendEmail({
        to: recipients,
        subject: tmpl.subject(vars),
        text: tmpl.text(vars),
        html: tmpl.html(vars),
      });
      if (!sendRes.ok) {
        errors.push({ stage, applicationId: app.id, error: sendRes.error ?? "send failed" });
        continue;
      }

      await sb.from("nudge_sends").insert({
        application_id: app.id,
        branch_id: app.branch_id,
        stage,
        recipients,
        trigger: "scheduled",
      });
      await sb.from("audit_log").insert({
        application_id: app.id,
        branch_id: app.branch_id,
        actor_email: "system@kg-recruit",
        actor_role: "system",
        action: "NUDGE_SENT",
        metadata: { stage, recipients_count: recipients.length },
      });

      byStage[stage] += 1;
    }
  }

  const total = Object.values(byStage).reduce((a, b) => a + b, 0);
  return { total, byStage, errors };
}
