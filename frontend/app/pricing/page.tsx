import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Pricing",
  description:
    "Explore XCR8 plans for AI-assisted content creation, visual production, social publishing, and creator growth.",
  alternates: { canonical: "/pricing" },
  openGraph: {
    type: "website",
    title: "XCR8 Pricing | AI Creator Workspace",
    description:
      "Explore XCR8 plans for AI-assisted content creation, visual production, social publishing, and creator growth.",
    url: "/pricing",
  },
  twitter: {
    card: "summary_large_image",
    title: "XCR8 Pricing | AI Creator Workspace",
    description:
      "Explore XCR8 plans for AI-assisted content creation, visual production, social publishing, and creator growth.",
  },
};

const plans = [
  {
    name: "Free",
    monthly: "$0",
    annual: "$0",
    highlight: "Start creating",
    features: ["500 monthly credits", "50 text generations", "10 scheduled posts", "200 MiB storage"],
  },
  {
    name: "Starter",
    monthly: "$9",
    annual: "$90",
    highlight: "For consistent creators",
    features: ["5,000 monthly credits", "500 text generations", "25 image generations", "10 voiceovers"],
  },
  {
    name: "Pro",
    monthly: "$29",
    annual: "$290",
    highlight: "For growing creators",
    features: ["15,000 monthly credits", "2,500 text generations", "100 image generations", "10 HQ images", "50 voiceovers"],
  },
  {
    name: "Business",
    monthly: "$99",
    annual: "$990",
    highlight: "For teams and businesses",
    features: ["50,000 monthly credits", "5,000 text generations", "200 image generations", "20 HQ images", "100 voiceovers"],
  },
];

const pricingJsonLd = {
  "@context": "https://schema.org",
  "@type": "WebPage",
  name: "XCR8 Pricing",
  url: "https://www.xcr8.tech/pricing",
  description:
    "Explore XCR8 plans for AI-assisted content creation, visual production, social publishing, and creator growth.",
  isPartOf: {
    "@type": "WebSite",
    name: "XCR8",
    url: "https://www.xcr8.tech",
  },
};

export default function PricingPage() {
  return (
    <main className="min-h-screen bg-white text-slate-950 dark:bg-slate-950 dark:text-white">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(pricingJsonLd) }}
      />
      <div className="mx-auto max-w-6xl px-6 py-10">
        <header className="flex items-center justify-between">
          <Link href="/welcome" className="text-lg font-bold tracking-tight">XCR8</Link>
          <Link href="/auth/login" className="text-sm font-medium text-slate-600 hover:text-slate-950 dark:text-slate-300 dark:hover:text-white">
            Log in
          </Link>
        </header>

        <section className="mx-auto max-w-3xl py-20 text-center">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-cyan-600">Simple plans</p>
          <h1 className="mt-4 text-4xl font-bold tracking-tight sm:text-5xl">
            Choose the workspace that fits your creator journey.
          </h1>
          <p className="mt-5 text-lg text-slate-600 dark:text-slate-300">
            Start free, then scale your AI-assisted creation and publishing workflow as your needs grow.
          </p>
        </section>

        <section className="grid gap-6 md:grid-cols-2 lg:grid-cols-4" aria-label="XCR8 pricing plans">
          {plans.map((plan) => (
            <article key={plan.name} className="flex flex-col rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <h2 className="text-xl font-semibold">{plan.name}</h2>
              <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">{plan.highlight}</p>
              <div className="mt-6">
                <span className="text-4xl font-bold">{plan.monthly}</span>
                <span className="text-sm text-slate-500 dark:text-slate-400"> / month</span>
              </div>
              <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                {plan.annual} / year · 2 months free
              </p>
              <ul className="mt-6 space-y-3 text-sm text-slate-700 dark:text-slate-200">
                {plan.features.map((feature) => <li key={feature}>✓ {feature}</li>)}
              </ul>
              <Link href="/auth/signup" className="mt-auto inline-flex justify-center rounded-full border border-cyan-600 bg-cyan-600 px-5 py-3 text-sm font-semibold text-white hover:bg-cyan-700">
                Get started
              </Link>
            </article>
          ))}
        </section>

        <section className="mx-auto max-w-3xl py-16 text-center">
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Prices shown in USD are the global catalog. Nigerian customers receive the configured NGN catalog at checkout.
          </p>
          <Link href="/features" className="mt-5 inline-block text-sm font-semibold text-cyan-700 hover:underline dark:text-cyan-400">
            Explore XCR8 features →
          </Link>
        </section>
      </div>
    </main>
  );
}
