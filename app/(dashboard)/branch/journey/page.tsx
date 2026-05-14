import { redirect } from "next/navigation";
import { requireAuth } from "@/lib/auth/get-user";
import { isBranchRole } from "@/types/database";
import { createClient } from "@/lib/supabase/server";
import { loadJourneyApplications, loadJourneyEvents } from "@/lib/journey/data";
import { JourneyViewSwitcher, type JourneyView } from "@/components/branch/journey/JourneyViewSwitcher";
import { JourneyTable } from "@/components/branch/journey/JourneyTable";
import { JourneyKanban } from "@/components/branch/journey/JourneyKanban";
import { JourneyTimeline } from "@/components/branch/journey/JourneyTimeline";

interface SearchParams {
  view?: string;
}

const ALLOWED: JourneyView[] = ["table", "kanban", "timeline"];

export default async function JourneyPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const auth = await requireAuth();
  if (!auth.branch || !isBranchRole(auth.profile.role)) {
    redirect("/branch");
  }
  const { view: rawView } = await searchParams;
  const view: JourneyView = (ALLOWED as readonly string[]).includes(rawView ?? "")
    ? (rawView as JourneyView)
    : "table";

  const supabase = await createClient();

  // Fetch only what the chosen view needs — kanban/table share the same
  // app list; timeline pulls from the parallel application_events table.
  const apps =
    view === "timeline"
      ? []
      : await loadJourneyApplications(supabase, auth.branch.id);
  const events = view === "timeline" ? await loadJourneyEvents(supabase, auth.branch.id) : [];

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <p className="text-sm font-medium uppercase tracking-wide text-brand-blue">
          {auth.branch.name}
        </p>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h1 className="text-3xl font-bold leading-tight text-text-primary">Journey</h1>
          <JourneyViewSwitcher current={view} />
        </div>
        <p className="text-text-secondary">
          {view === "timeline"
            ? "Every milestone across this branch, newest first."
            : `Every active application across this branch (archived rows are hidden — see the Archived tab).`}
        </p>
      </header>

      {view === "table" && <JourneyTable apps={apps} />}
      {view === "kanban" && <JourneyKanban apps={apps} />}
      {view === "timeline" && <JourneyTimeline events={events} />}
    </div>
  );
}
