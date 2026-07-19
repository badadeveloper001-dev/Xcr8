export const metadata = {
  title: "Privacy Policy | XCR8",
};

export default function PrivacyPage() {
  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-16 text-slate-900">
      <h1 className="text-3xl font-semibold tracking-tight">Privacy Policy</h1>
      <p className="mt-4 text-sm text-slate-600">Last updated: July 19, 2026</p>

      <section className="mt-8 space-y-4 text-sm leading-7 text-slate-700">
        <p>
          XCR8 collects account details, connected-platform authorization tokens, and content metadata
          needed to provide creator workflow features including drafting, scheduling, and publishing.
        </p>
        <p>
          We use platform API data only to perform user-authorized actions, such as displaying connection
          status and publishing content on behalf of the user.
        </p>
        <p>
          We do not sell personal data. We limit access to authorized personnel and service providers who
          help operate XCR8.
        </p>
        <p>
          You can disconnect platform integrations and request data deletion by contacting support.
          Deauthorization callbacks from supported platforms are processed by our backend integration service.
        </p>
        <p>
          We may update this policy periodically. Material changes will be reflected on this page.
        </p>
        <p>
          Contact: support@xcr8.app
        </p>
      </section>
    </main>
  );
}
