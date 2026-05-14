import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function ContactPage() {
  return (
    <article className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-4 py-12">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold leading-tight text-text-primary">
          Request an invite
        </h1>
        <p className="text-text-secondary">
          Applications to join PAP Kampong Glam are sponsored by a Branch Admin. Reach out
          using one of the channels below and someone from the branch will get back to you with
          an application link.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Branch coordinator</CardTitle>
          <CardDescription>
            For new applicants, existing members, and general enquiries.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 text-sm text-text-secondary">
          <p>
            <span className="text-text-muted">Email</span>{" "}
            <a
              href="mailto:kampongglam@pap.org.sg"
              className="font-medium text-brand-blue hover:underline"
            >
              kampongglam@pap.org.sg
            </a>
          </p>
          <p>
            <span className="text-text-muted">Branch office</span>{" "}
            <span className="font-medium text-text-primary">
              PAP Kampong Glam Branch, Singapore
            </span>
          </p>
          <p>
            <span className="text-text-muted">Office hours</span>{" "}
            <span className="font-medium text-text-primary">
              By appointment — please email ahead
            </span>
          </p>
        </CardContent>
      </Card>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-semibold text-text-primary">What to include in your message</h2>
        <ul className="ml-6 list-disc text-text-secondary">
          <li>Your full name (as it appears on NRIC).</li>
          <li>A mobile phone number we can reach you on.</li>
          <li>Whether anyone at the branch already knows you (and who).</li>
          <li>Any preferred time to follow up.</li>
        </ul>
        <p className="text-sm text-text-muted">
          A coordinator typically responds within five working days. By contacting us you agree
          to our{" "}
          <Link href="/privacy" className="font-medium text-brand-blue hover:underline">
            privacy policy
          </Link>{" "}
          and{" "}
          <Link href="/terms" className="font-medium text-brand-blue hover:underline">
            terms of use
          </Link>
          .
        </p>
      </section>
    </article>
  );
}
