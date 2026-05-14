import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function PublicLanding() {
  return (
    <div className="flex flex-1 flex-col">
      <section className="mx-auto flex w-full max-w-3xl flex-col items-center gap-6 px-4 py-16 text-center">
        <p className="text-sm font-medium uppercase tracking-wide text-brand-blue">PAP</p>
        <h1 className="text-3xl font-bold leading-tight text-text-primary md:text-4xl">
          Kampong Glam Branch — Membership Application Portal
        </h1>
        <p className="max-w-xl text-base text-text-secondary">
          Apply to join PAP Kampong Glam Branch. Access is by invitation only — if you have a
          link from your branch coordinator, open it on your phone or computer.
        </p>
        <div className="flex flex-col items-center gap-3 sm:flex-row">
          <Button asChild>
            <Link href="/contact">Request an invite</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/login">Branch staff sign in</Link>
          </Button>
        </div>
      </section>

      <section className="mx-auto w-full max-w-5xl px-4 pb-16">
        <h2 className="mb-6 text-2xl font-semibold text-text-primary">How it works</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <Card>
            <CardHeader>
              <CardTitle>1. Get an invite</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-text-secondary">
              A Branch Admin sends you a one-time link by email or WhatsApp. The link is yours
              alone and expires after a few days.
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>2. Fill in your details</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-text-secondary">
              Open the link on any device. The form takes about 10 minutes and saves your
              progress automatically. Sign at the end.
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>3. Branch verifies, HQ approves</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-text-secondary">
              The branch reviews and the Chairman signs. We send the completed form to PAP HQ.
              You&rsquo;ll hear back on approval.
            </CardContent>
          </Card>
        </div>
      </section>

      <section className="mx-auto w-full max-w-3xl px-4 pb-20">
        <h2 className="mb-6 text-2xl font-semibold text-text-primary">Common questions</h2>
        <dl className="flex flex-col gap-6">
          <div>
            <dt className="font-semibold text-text-primary">
              Can I sign up directly?
            </dt>
            <dd className="mt-1 text-text-secondary">
              No. Applications go through a Branch Admin who vouches for the application before
              it reaches HQ. Use the <Link href="/contact" className="font-medium text-brand-blue hover:underline">request an invite</Link>{" "}
              page to start that conversation.
            </dd>
          </div>
          <div>
            <dt className="font-semibold text-text-primary">My link doesn&rsquo;t work.</dt>
            <dd className="mt-1 text-text-secondary">
              Links are single-use and time-bounded. If yours has expired or already been used,
              contact the branch and they can extend or re-issue it.
            </dd>
          </div>
          <div>
            <dt className="font-semibold text-text-primary">What do you do with my data?</dt>
            <dd className="mt-1 text-text-secondary">
              We collect only what the membership form requires. NRIC scans (foreign-born
              applicants only) are auto-deleted within 24 hours of submission to HQ. See the{" "}
              <Link href="/privacy" className="font-medium text-brand-blue hover:underline">privacy policy</Link>{" "}
              for full detail.
            </dd>
          </div>
        </dl>
      </section>
    </div>
  );
}
