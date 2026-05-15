import Link from "next/link";

export default function PrivacyPage() {
  return (
    <article className="mx-auto w-full max-w-3xl flex-1 px-4 py-12">
      <h1 className="text-3xl font-bold leading-tight text-text-primary">Privacy policy</h1>
      <p className="mt-2 text-sm text-text-muted">
        Last updated 14 May 2026 · Draft pending PAP HQ review before public launch.
      </p>

      <div className="prose prose-neutral mt-8 max-w-none text-text-secondary">
        <p>
          This Privacy Policy explains how the PAP Kampong Glam Branch (&ldquo;we&rdquo;, &ldquo;us&rdquo;)
          collects, uses, discloses, and retains personal data when you apply for membership through
          this portal. We operate in accordance with the Personal Data Protection Act 2012
          (Singapore) and the membership application requirements of the People&rsquo;s Action Party.
        </p>

        <h2 className="mt-8 text-xl font-semibold text-text-primary">1. What we collect</h2>
        <p>The membership form (MF_V1.0) requires the following information:</p>
        <ul className="ml-6 list-disc">
          <li>
            <strong>Identity:</strong> full name (including underlined surname), Chinese name if
            applicable, NRIC number, date and place of birth, race, gender, marital status.
          </li>
          <li>
            <strong>Contact:</strong> home address (postal code, block, street, building, unit
            number), telephone numbers (home, office, mobile), email, social media handles.
          </li>
          <li>
            <strong>Address coordinates:</strong> when you enter your postal code, we look up the
            corresponding street address via the Singapore Land Authority&rsquo;s OneMap service.
            This returns approximate latitude / longitude for your block which we store alongside
            the address. We use the coordinates only to tag your application with the correct
            electoral constituency (GRC/SMC) for branch reporting. They are never published or
            shared outside the parties listed in section 3.
          </li>
          <li>
            <strong>Background:</strong> housing type, highest education, written and spoken
            languages, occupation and employer, monthly income bracket, hobbies, memberships in
            trade unions, associations, clubs, community organisations.
          </li>
          <li>
            <strong>Photograph:</strong> a colour passport-style photo for the printed form.
          </li>
          <li>
            <strong>Signatures:</strong> handwritten e-signatures from you, your referral, and
            the Branch Chairman, captured with timestamp and IP address.
          </li>
          <li>
            <strong>NRIC scans:</strong> only when your place of birth is outside Singapore. Front
            and back scans are captured for HQ verification and{" "}
            <strong>auto-deleted within 24 hours of being sent to HQ</strong>.
          </li>
        </ul>

        <h2 className="mt-8 text-xl font-semibold text-text-primary">2. Why we collect it</h2>
        <ul className="ml-6 list-disc">
          <li>To process your membership application end-to-end.</li>
          <li>
            To produce and send the completed MF_V1.0 form to PAP HQ for approval, including the
            three required signatures.
          </li>
          <li>
            To maintain an audit trail of who acted on your application and when, in line with
            PAP&rsquo;s internal accountability requirements.
          </li>
          <li>
            To communicate with you about the status of your application — invites, reminders,
            outcome notifications.
          </li>
        </ul>

        <h2 className="mt-8 text-xl font-semibold text-text-primary">3. Who sees your data</h2>
        <ul className="ml-6 list-disc">
          <li>
            <strong>Your Branch Admin Team</strong> (Master Admin, Admins, Team Members) — for
            verification and processing within the branch.
          </li>
          <li>
            <strong>Your assigned Referral</strong> — sees only the basic context needed to sign
            in support of your application.
          </li>
          <li>
            <strong>The Branch Chairman</strong> — reviews the completed form before HQ submission.
          </li>
          <li>
            <strong>PAP HQ</strong> — receives the completed PDF form by email when the branch sends
            it. Outcome (approval or rejection) is recorded back into the system.
          </li>
          <li>
            <strong>Taylab</strong> — the platform operator. Limited access for technical support;
            governed by a data-processing agreement with the branch.
          </li>
        </ul>
        <p>
          We do not sell or rent your personal data, and we do not disclose it to any party
          outside the list above except where required by law.
        </p>

        <h2 className="mt-8 text-xl font-semibold text-text-primary">4. How long we keep it</h2>
        <ul className="ml-6 list-disc">
          <li>
            <strong>NRIC scans (image files):</strong> auto-purged within 24 hours of the
            application being sent to HQ. The scan images are deleted from storage; no copy is
            retained.
          </li>
          <li>
            <strong>NRIC number:</strong> retained in encrypted-at-rest form as part of the
            application record. PAP HQ requires the number for membership verification and
            ongoing record-keeping. Access is restricted to the same parties listed in
            section 3.
          </li>
          <li>
            <strong>All other application data:</strong> retained for seven (7) years from the
            completion date, in line with audit and recordkeeping practice.
          </li>
          <li>
            <strong>Audit logs:</strong> retained for the same seven-year period and never
            include NRIC numbers in plain text.
          </li>
        </ul>

        <h2 className="mt-8 text-xl font-semibold text-text-primary">5. How we protect it</h2>
        <ul className="ml-6 list-disc">
          <li>
            All data is stored encrypted at rest in Supabase (AWS Singapore region) with
            tenant-level row-level security so one branch&rsquo;s data is never visible to another.
          </li>
          <li>
            Access by the Branch Admin Team is gated by individual login, multi-factor capable,
            with full audit trail of every read and write.
          </li>
          <li>
            Magic-link invitations are time-bounded and single-use; once consumed they cannot be
            re-opened.
          </li>
          <li>
            All transport is TLS 1.2+. Storage URLs are short-lived presigned links, not public.
          </li>
        </ul>

        <h2 className="mt-8 text-xl font-semibold text-text-primary">6. Your rights</h2>
        <p>Under the PDPA you have the right to:</p>
        <ul className="ml-6 list-disc">
          <li>Ask us what personal data we hold about you and how it has been used.</li>
          <li>Request correction of inaccurate data.</li>
          <li>
            Withdraw consent and request deletion (subject to legal retention obligations — see
            section 4).
          </li>
          <li>
            Lodge a complaint with the Personal Data Protection Commission (Singapore) if you
            believe we have not complied.
          </li>
        </ul>
        <p>
          To exercise any of these rights, contact the branch coordinator via the{" "}
          <Link href="/contact" className="font-medium text-brand-blue hover:underline">
            contact page
          </Link>
          .
        </p>

        <h2 className="mt-8 text-xl font-semibold text-text-primary">7. Cookies and analytics</h2>
        <p>
          This portal uses only the strictly necessary cookies needed to keep you signed in. We do
          not run third-party analytics, advertising, or tracking pixels.
        </p>

        <h2 className="mt-8 text-xl font-semibold text-text-primary">8. Changes to this policy</h2>
        <p>
          We will update this page if the form, retention periods, or data handling changes.
          Substantive changes will be notified to active applicants by email.
        </p>

        <p className="mt-8 text-sm text-text-muted">
          Last reviewed by the Branch Admin Team on 14 May 2026. Pending sign-off by PAP HQ before
          general public release.
        </p>
      </div>
    </article>
  );
}
