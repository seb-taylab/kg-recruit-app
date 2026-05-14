/**
 * Supabase Edge Function — runs the auto-nudge engine on a schedule.
 *
 * Deploy:
 *   supabase functions deploy process-nudges --no-verify-jwt
 *   supabase secrets set CRON_SECRET=<random> RESEND_API_KEY=<key>
 *
 * Schedule (15-minute tick — the engine is idempotent within interval_hours):
 *   select cron.schedule(
 *     'process-nudges',
 *     '*\/15 * * * *',
 *     $$select net.http_post(
 *        url := '<project-url>/functions/v1/process-nudges',
 *        headers := jsonb_build_object('Authorization', 'Bearer ' || current_setting('app.cron_secret'))
 *      )$$
 *   );
 *
 * The engine logic is mirrored from lib/nudges/engine.ts (Deno can't reach
 * the Next project's lib/). Keep both files in lock-step when iterating.
 */
// @ts-expect-error — Deno globals resolve at edge-runtime.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
// @ts-expect-error — Deno global
import { Resend } from "https://esm.sh/resend@4";

const NUDGE_STAGES = [
  "applicant_link_unopened",
  "applicant_form_in_draft",
  "referral_unsigned",
  "chairman_unsigned",
  "ready_to_send_unactioned",
  "at_hq_stalled",
] as const;
type NudgeStage = (typeof NUDGE_STAGES)[number];
type NudgeRecipientKind = "applicant" | "referral" | "chairman" | "admin" | "all_admins";

const STAGE_STATUS: Record<NudgeStage, string> = {
  applicant_link_unopened: "APPLICANT_INVITED",
  applicant_form_in_draft: "APPLICANT_FILLING",
  referral_unsigned: "REFERRAL_INVITED",
  chairman_unsigned: "PENDING_CHAIRMAN",
  ready_to_send_unactioned: "READY_TO_SEND",
  at_hq_stalled: "SENT_TO_HQ",
};

// @ts-expect-error — Deno global
Deno.serve(async (req: Request) => {
  // @ts-expect-error
  const secret = Deno.env.get("CRON_SECRET");
  if (req.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const sb = createClient(
    // @ts-expect-error
    Deno.env.get("SUPABASE_URL")!,
    // @ts-expect-error
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
  // @ts-expect-error
  const resend = new Resend(Deno.env.get("RESEND_API_KEY"));
  // @ts-expect-error
  const fromAddr = Deno.env.get("EMAIL_FROM_ADDRESS") ?? "noreply@kg.taylab.com";
  // @ts-expect-error
  const fromName = Deno.env.get("EMAIL_FROM_NAME") ?? "PAP Branch";

  const { data: platRow } = await sb
    .from("platform_settings")
    .select("value")
    .eq("key", "nudge_config")
    .single();
  // deno-lint-ignore no-explicit-any
  const platformConfig = (platRow as any)?.value ?? null;

  const { data: branchRows } = await sb
    .from("branches")
    .select("id, name, nudge_config")
    .eq("is_active", true);
  // deno-lint-ignore no-explicit-any
  const branches = (branchRows ?? []) as Array<any>;
  const branchById = new Map(branches.map((b) => [b.id, b]));

  const byStage: Record<string, number> = {};
  const errors: Array<{ stage: string; applicationId: string; error: string }> = [];
  const now = Date.now();

  for (const stage of NUDGE_STAGES) {
    byStage[stage] = 0;
    const { data: apps } = await sb
      .from("applications")
      .select(
        "id, branch_id, status, applicant_name_at_invite, applicant_email, invited_by_admin_id, assigned_referral_email, applicant_invited_at, applicant_filling_started_at, referral_assigned_at, branch_admin_review_at, referral_signed_at, ready_to_send_at, sent_to_hq_at",
      )
      .eq("status", STAGE_STATUS[stage]);
    // deno-lint-ignore no-explicit-any
    for (const app of ((apps ?? []) as any[])) {
      const branch = branchById.get(app.branch_id);
      if (!branch) continue;
      const cfg = branch.nudge_config?.[stage] ?? platformConfig?.[stage];
      if (!cfg || !cfg.enabled) continue;
      const interval = cfg.intervals_hours?.[0];
      if (!interval || interval <= 0) continue;

      const anchor =
        stage === "applicant_link_unopened" ? app.applicant_invited_at
        : stage === "applicant_form_in_draft" ? (app.applicant_filling_started_at ?? app.applicant_invited_at)
        : stage === "referral_unsigned" ? app.referral_assigned_at
        : stage === "chairman_unsigned" ? (app.branch_admin_review_at ?? app.referral_signed_at)
        : stage === "ready_to_send_unactioned" ? app.ready_to_send_at
        : stage === "at_hq_stalled" ? app.sent_to_hq_at
        : null;
      if (!anchor) continue;
      if (now - new Date(anchor).getTime() < interval * 60 * 60 * 1000) continue;

      const { data: lastRow } = await sb
        .from("nudge_sends")
        .select("sent_at")
        .eq("application_id", app.id)
        .eq("stage", stage)
        .order("sent_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      // deno-lint-ignore no-explicit-any
      const last = (lastRow as any)?.sent_at;
      if (last && now - new Date(last).getTime() < interval * 60 * 60 * 1000) continue;

      const recipients = new Set<string>();
      for (const kind of cfg.recipients as NudgeRecipientKind[]) {
        if (kind === "applicant" && app.applicant_email) recipients.add(app.applicant_email);
        else if (kind === "referral" && app.assigned_referral_email)
          recipients.add(app.assigned_referral_email);
        else {
          const roles =
            kind === "chairman"
              ? ["branch_chairman"]
              : ["branch_admin", "branch_master_admin"];
          const { data: profiles } = await sb
            .from("profiles")
            .select("id")
            .eq("branch_id", app.branch_id)
            .eq("is_active", true)
            .in("role", roles);
          // deno-lint-ignore no-explicit-any
          let ids = ((profiles ?? []) as any[]).map((p) => p.id);
          if (kind === "admin" && app.invited_by_admin_id) {
            ids = ids.filter((id) => id === app.invited_by_admin_id);
          }
          for (const id of ids) {
            const { data: u } = await sb.auth.admin.getUserById(id);
            if (u?.user?.email) recipients.add(u.user.email);
          }
        }
      }
      if (recipients.size === 0) continue;

      const applicantName = app.applicant_name_at_invite ?? "there";
      const branchName = branch.name;
      const subject = `Reminder — ${stage.replace(/_/g, " ")} for ${applicantName}`;
      const text = `Hi,\n\nReminder for ${applicantName}'s application — stage: ${stage}.\n\nPAP ${branchName}`;
      const html = `<p>Hi,</p><p>Reminder for <strong>${applicantName}</strong>'s application — stage: ${stage}.</p><p>PAP ${branchName}</p>`;

      try {
        const { error } = await resend.emails.send({
          from: `${fromName} <${fromAddr}>`,
          to: [...recipients],
          subject,
          html,
          text,
        });
        if (error) {
          errors.push({ stage, applicationId: app.id, error: error.message });
          continue;
        }
      } catch (e) {
        errors.push({
          stage,
          applicationId: app.id,
          error: e instanceof Error ? e.message : "send error",
        });
        continue;
      }

      await sb.from("nudge_sends").insert({
        application_id: app.id,
        branch_id: app.branch_id,
        stage,
        recipients: [...recipients],
        trigger: "scheduled",
      });
      await sb.from("audit_log").insert({
        application_id: app.id,
        branch_id: app.branch_id,
        actor_email: "system@kg-recruit",
        actor_role: "system",
        action: "NUDGE_SENT",
        metadata: { stage, recipients_count: recipients.size },
      });
      byStage[stage] += 1;
    }
  }

  const total = Object.values(byStage).reduce((a, b) => a + b, 0);
  return new Response(JSON.stringify({ total, byStage, errors }), {
    headers: { "content-type": "application/json" },
  });
});
