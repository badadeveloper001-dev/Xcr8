import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";

export const dynamic = "force-dynamic";

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

type Plan = {
  id: string;
  name: string;
  monthly_credits: number;
  text_generations: number;
  image_generations: number;
  high_quality_images: number;
  voiceovers: number;
  scheduled_posts: number;
  storage_megabytes: number;
  pricing: {
    region: string;
    currency: "NGN" | "USD";
    monthly_formatted: string;
    annual_formatted: string;
    annual_savings_months: number;
  };
};

const BACKEND_URL =
  process.env.NEXT_PUBLIC_API_URL?.trim() ||
  "https://xcr8-creator-os-api-ml4p.onrender.com";

async function getPlans(): Promise<Plan[]> {
  const requestHeaders = await headers();
  const countryCode =
    requestHeaders.get("cf-ipcountry") ||
    requestHeaders.get("x-country-code") ||
    requestHeaders.get("x-vercel-ip-country") ||
    "";

  try {
    const response = await fetch(`${BACKEND_URL.replace(/\/$/, "")}/api/v1/plans/`, {
      headers: countryCode ? { "x-country-code": countryCode } : undefined,
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(`Pricing API returned ${response.status}`);
    }

    return (await response.json()) as Plan[];
  } catch {
    return [];
  }
}

function featureList(plan: Plan): string[] {
  return [
    `${plan.monthly_credits.toLocaleString()} monthly credits`,
    `${plan.text_generations.toLocaleString()} text generations`,
    plan.image_generations > 0
      ? `${plan.image_generations.toLocaleString()} image generations`
      : "No standard image generations",
    plan.high_quality_images > 0
      ? `${plan.high_quality_images.toLocaleString()} HQ images`
      : "No HQ images",
    plan.voiceovers > 0
      ? `${plan.voiceovers.toLocaleString()} voiceovers`
      : "No voiceovers",
    `${plan.scheduled_posts.toLocaleString()} scheduled posts`,
    `${plan.storage_megabytes >= 1024 ? `${plan.storage_megabytes / 1024} GiB` : `${plan.storage_megabytes} MiB`} storage`,
  ];
}

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

export default async function PricingPage() {
  const plans = await getPlans();
  const currency = plans[0]?.pricing.currency || "USD";
  const isNigeria = currency === "NGN";

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

        {plans.length > 0 ? (
          <section className="grid gap-6 md:grid-cols-2 lg:grid-cols-4" aria-label="XCR8 pricing plans">
            {plans.map((plan) => (
              <article key={plan.id} className="flex flex-col rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                <h2 className="text-xl font-semibold">{plan.name}</h2>
                <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                  {plan.id === "free"
                    ? "Start creating"
                    : plan.id === "starter"
                      ? "For consistent creators"
                      : plan.id === "pro"
                        ? "For growing creators"
                        : "For teams and businesses"}
                </p>
                <div className="mt-6">
                  <span className="text-4xl font-bold">{plan.pricing.monthly_formatted}</span>
                  <span className="text-sm text-slate-500 dark:text-slate-400"> / month</span>
                </div>
                <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                  {plan.pricing.annual_formatted} / year
                  {plan.pricing.annual_savings_months > 0
                    ? ` · ${plan.pricing.annual_savings_months} months free`
                    : ""}
                </p>
                <ul className="mt-6 space-y-3 text-sm text-slate-700 dark:text-slate-200">
                  {featureList(plan).map((feature) => <li key={feature}>✓ {feature}</li>)}
                </ul>
                <Link href="/auth/signup" className="mt-auto inline-flex justify-center rounded-full border border-cyan-600 bg-cyan-600 px-5 py-3 text-sm font-semibold text-white hover:bg-cyan-700">
                  Get started
                </Link>
              </article>
            ))}
          </section>
        ) : (
          <p className="py-12 text-center text-slate-600 dark:text-slate-300">
            Pricing is temporarily unavailable. Please try again shortly.
          </p>
        )}

        <section className="mx-auto max-w-3xl py-16 text-center">
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {isNigeria
              ? "Prices shown are the configured Nigerian catalog. Your final checkout amount is confirmed by XCR8 before payment."
              : "Prices shown are the configured global catalog. Regional pricing is applied where available."}
          </p>
          <Link href="/features" className="mt-5 inline-block text-sm font-semibold text-cyan-700 hover:underline dark:text-cyan-400">
            Explore XCR8 features →
          </Link>
        </section>
      </div>
    </main>
  );
}
