/**
 * Date formatters.
 *
 * Addendum v1.3 Gap 2: the printed MF_V1.0 form requires DD/MM/YYYY on
 * every date field (Date of Birth, applicant signed, referral signed,
 * chairman signed). Postgres DATE serialises as YYYY-MM-DD; we format on
 * render only, never store reformatted.
 *
 * Design System §7.9: dashboards use DD MMM YYYY (e.g. 13 May 2026) — that
 * is a separate helper (`formatDateDDMMMYYYY`) and NOT used for the PDF.
 */

export function formatDateDDMMYYYY(input: Date | string | null | undefined): string {
  if (!input) return "";
  const d = typeof input === "string" ? new Date(input) : input;
  if (Number.isNaN(d.getTime())) return "";
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

/** Dashboard display format — DD MMM YYYY. */
export function formatDateDDMMMYYYY(input: Date | string | null | undefined): string {
  if (!input) return "";
  const d = typeof input === "string" ? new Date(input) : input;
  if (Number.isNaN(d.getTime())) return "";
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const dd = String(d.getDate()).padStart(2, "0");
  const mmm = months[d.getMonth()];
  const yyyy = d.getFullYear();
  return `${dd} ${mmm} ${yyyy}`;
}
