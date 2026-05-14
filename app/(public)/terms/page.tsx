import Link from "next/link";

export default function TermsPage() {
  return (
    <article className="mx-auto w-full max-w-3xl flex-1 px-4 py-12">
      <h1 className="text-3xl font-bold leading-tight text-text-primary">Terms of use</h1>
      <p className="mt-2 text-sm text-text-muted">
        Last updated 14 May 2026 · Draft pending PAP HQ review before public launch.
      </p>

      <div className="prose prose-neutral mt-8 max-w-none text-text-secondary">
        <p>
          These terms govern your use of the PAP Kampong Glam Branch membership application
          portal (the &ldquo;Portal&rdquo;). By signing in, opening an invitation link, or
          submitting an application, you agree to be bound by them.
        </p>

        <h2 className="mt-8 text-xl font-semibold text-text-primary">1. What this portal is</h2>
        <p>
          The Portal is an internal application processing tool for the PAP Kampong Glam Branch.
          It is operated by the branch on infrastructure provided by Taylab and is not a public
          membership sign-up service.
        </p>

        <h2 className="mt-8 text-xl font-semibold text-text-primary">2. Access</h2>
        <ul className="ml-6 list-disc">
          <li>
            Access is by invitation only. Applicants receive a single-use, time-bounded link
            from a Branch Admin.
          </li>
          <li>
            Branch staff access via individual accounts. Sharing logins is prohibited and may
            result in account deactivation.
          </li>
          <li>
            You may not attempt to access another applicant&rsquo;s data, to circumvent role
            restrictions, or to interfere with the operation of the Portal.
          </li>
        </ul>

        <h2 className="mt-8 text-xl font-semibold text-text-primary">3. Your obligations as an applicant</h2>
        <ul className="ml-6 list-disc">
          <li>Information you provide must be true, accurate, and current.</li>
          <li>
            You must not impersonate another person, submit forged signatures, or upload
            documents that aren&rsquo;t yours.
          </li>
          <li>
            By signing the form you confirm you are eligible to apply for PAP membership under
            the rules set by PAP HQ. Decisions on eligibility rest with HQ.
          </li>
        </ul>

        <h2 className="mt-8 text-xl font-semibold text-text-primary">
          4. Your obligations as a Referral or Chairman
        </h2>
        <ul className="ml-6 list-disc">
          <li>
            By signing as a Referral, you affirm that you know the applicant in good standing
            for the period stated.
          </li>
          <li>
            By signing as Chairman, you affirm the application has been reviewed under branch
            procedures and is fit to forward to HQ.
          </li>
        </ul>

        <h2 className="mt-8 text-xl font-semibold text-text-primary">5. Withdrawal</h2>
        <p>
          You may withdraw your application at any time before HQ records an outcome by
          contacting the branch. The branch will archive the record; some data is retained for
          audit purposes (see{" "}
          <Link href="/privacy" className="font-medium text-brand-blue hover:underline">
            Privacy Policy §4
          </Link>
          ).
        </p>

        <h2 className="mt-8 text-xl font-semibold text-text-primary">6. Availability</h2>
        <p>
          We aim to keep the Portal available at all times, but we do not guarantee uninterrupted
          access. We may take it offline for maintenance, security, or operational reasons
          without notice.
        </p>

        <h2 className="mt-8 text-xl font-semibold text-text-primary">7. No warranty</h2>
        <p>
          The Portal is provided &ldquo;as is&rdquo;. To the maximum extent permitted by law, the
          PAP Kampong Glam Branch and Taylab disclaim all warranties, express or implied,
          including merchantability and fitness for a particular purpose. The Portal does not
          guarantee that an application will be approved by PAP HQ.
        </p>

        <h2 className="mt-8 text-xl font-semibold text-text-primary">8. Limitation of liability</h2>
        <p>
          To the maximum extent permitted by law, neither the branch nor Taylab is liable for any
          indirect, incidental, or consequential loss arising from use of the Portal, except
          where such liability cannot be excluded under Singapore law.
        </p>

        <h2 className="mt-8 text-xl font-semibold text-text-primary">9. Changes</h2>
        <p>
          We may update these terms from time to time. Material changes will be notified to
          active applicants by email; continued use of the Portal after a change constitutes
          acceptance of the revised terms.
        </p>

        <h2 className="mt-8 text-xl font-semibold text-text-primary">10. Governing law</h2>
        <p>
          These terms are governed by the laws of Singapore. Any dispute will be subject to the
          exclusive jurisdiction of the Singapore courts.
        </p>

        <h2 className="mt-8 text-xl font-semibold text-text-primary">11. Contact</h2>
        <p>
          For questions about these terms, write to the branch via the{" "}
          <Link href="/contact" className="font-medium text-brand-blue hover:underline">
            contact page
          </Link>
          .
        </p>

        <p className="mt-8 text-sm text-text-muted">
          Pending sign-off by PAP HQ before general public release.
        </p>
      </div>
    </article>
  );
}
