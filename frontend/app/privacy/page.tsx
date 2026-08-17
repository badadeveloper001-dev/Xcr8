export const metadata = {
  title: "Privacy Policy | XCR8",
};

export default function PrivacyPage() {
  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-16 text-slate-900 dark:text-white">
      <h1 className="text-3xl font-semibold tracking-tight text-slate-950 dark:text-white">
        Privacy Policy
      </h1>
      <p className="mt-4 text-sm text-slate-600 dark:text-slate-300">
        Last updated: August 17, 2026
      </p>

      <section className="mt-8 space-y-6 text-sm leading-7 text-slate-700 dark:text-slate-200">
        <h2 className="text-lg font-medium text-slate-950 dark:text-white">1. Introduction</h2>
        <p>
          XCR8 ("we", "us", "our") provides an AI-powered creator distribution platform
          ("Services"). This Privacy Policy explains what personal data we collect, how we use it,
          with whom we share it, and your rights.
        </p>

        <h2 className="text-lg font-medium text-slate-950 dark:text-white">2. Data we collect</h2>
        <p>
          We collect information you provide (name, email, billing details), content metadata
          (titles, descriptions, tags), and platform connection data (OAuth tokens, account
          identifiers) necessary to interact with third-party platforms on your behalf. We also
          collect usage data and technical logs (IP address, device and browser information) to
          operate and secure the Services.
        </p>

        <h2 className="text-lg font-medium text-slate-950 dark:text-white">
          3. How we use your data
        </h2>
        <p>
          We use data to provide and improve the Services, process payments, communicate with you,
          perform publishing actions to connected platforms, detect fraud or abuse, and comply with
          legal obligations. Where required, we rely on your consent or contractual necessity to
          process data.
        </p>

        <h2 className="text-lg font-medium text-slate-950 dark:text-white">
          4. Sharing and disclosure
        </h2>
        <p>
          We share data with service providers who perform services on our behalf (hosting, payment
          processing, analytics). We may disclose data if required by law or to protect rights,
          safety, or property. We do not sell personal data.
        </p>

        <h2 className="text-lg font-medium text-slate-950 dark:text-white">
          5. Third-party platforms
        </h2>
        <p>
          When you connect third-party accounts (e.g., YouTube, Instagram), we store access tokens
          to carry out actions you request. Those tokens are encrypted and scoped; you can
          disconnect the integration from your account settings at any time.
        </p>

        <h2 className="text-lg font-medium text-slate-950 dark:text-white">
          6. Data retention and deletion
        </h2>
        <p>
          We retain personal data as long as necessary to provide the Services and as required by
          law. You may request account deletion or data export by contacting support; we will
          respond within a reasonable timeframe and delete data where required.
        </p>

        <h2 className="text-lg font-medium text-slate-950 dark:text-white">7. Security</h2>
        <p>
          We implement administrative, technical, and physical safeguards designed to protect
          personal data. No system is perfectly secure; if a breach occurs we will follow legal
          obligations, including notifying affected users when required.
        </p>

        <h2 className="text-lg font-medium text-slate-950 dark:text-white">8. Your rights</h2>
        <p>
          Depending on your jurisdiction, you may have rights to access, correct, or delete your
          personal data, or to restrict or object to certain processing. To exercise these rights
          contact us at support@xcr8.app.
        </p>

        <h2 className="text-lg font-medium text-slate-950 dark:text-white">9. Children</h2>
        <p>
          The Services are not directed to children under 13. We do not knowingly collect personal
          data from children under the applicable minimum age; if you believe we have, contact us to
          request deletion.
        </p>

        <h2 className="text-lg font-medium text-slate-950 dark:text-white">
          10. Changes to this Privacy Policy
        </h2>
        <p>
          We may update this policy. We will post the updated policy here with a revised "Last
          updated" date. Continued use of the Services after changes constitutes acceptance of the
          updated policy.
        </p>

        <h2 className="text-lg font-medium text-slate-950 dark:text-white">11. Contact</h2>
        <p>For questions about privacy or to make requests, email support@xcr8.app.</p>
      </section>
    </main>
  );
}
