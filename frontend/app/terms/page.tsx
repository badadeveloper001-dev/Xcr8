export const metadata = {
  title: "Terms of Service | XCR8",
};

export default function TermsPage() {
  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-16 text-slate-900">
      <h1 className="text-3xl font-semibold tracking-tight">Terms of Service</h1>
      <p className="mt-4 text-sm text-slate-600">Last updated: July 19, 2026</p>

      <section className="mt-8 space-y-4 text-sm leading-7 text-slate-700">
        <p>
          XCR8 is a creator workflow platform for drafting, scheduling, and publishing social content.
          By using XCR8, you agree to these terms.
        </p>
        <p>
          You are responsible for all content published through your connected social accounts and for
          complying with each platform&apos;s policies and applicable laws.
        </p>
        <p>
          You may disconnect connected platforms at any time from your account settings. We may suspend
          access for abuse, security risk, or policy violations.
        </p>
        <p>
          XCR8 is provided on an "as is" basis without warranties of uninterrupted availability.
          To the maximum extent permitted by law, XCR8 is not liable for indirect or consequential damages.
        </p>
        <p>
          We may update these terms from time to time. Continued use of XCR8 after updates means you
          accept the revised terms.
        </p>
        <p>
          Contact: support@xcr8.app
        </p>
      </section>
    </main>
  );
}
