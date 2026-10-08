import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, BarChart3, CalendarDays, ImageIcon, Megaphone, Sparkles, Users } from "lucide-react";

export const metadata: Metadata = {
  title: "Features",
  description:
    "Explore XCR8 features for content planning, AI-assisted creation, visual production, social publishing, performance tracking, and creator growth.",
  alternates: {
    canonical: "/features",
  },
  openGraph: {
    type: "website",
    title: "XCR8 Features | AI Creator Workspace",
    description:
      "Plan, create, publish, measure, and grow from one AI creator workspace.",
    url: "/features",
  },
  twitter: {
    card: "summary_large_image",
    title: "XCR8 Features | AI Creator Workspace",
    description:
      "Plan, create, publish, measure, and grow from one AI creator workspace.",
  },
};

const features = [
  {
    icon: CalendarDays,
    title: "Plan your content",
    description:
      "Organize content ideas and build a clearer workflow from planning through publication.",
  },
  {
    icon: Sparkles,
    title: "Create with AI",
    description:
      "Use XCR8's AI-assisted creative workflows to develop content faster and turn ideas into usable drafts.",
  },
  {
    icon: ImageIcon,
    title: "Create visuals",
    description:
      "Produce and manage creator assets as part of the same workspace instead of switching between disconnected tools.",
  },
  {
    icon: Megaphone,
    title: "Publish across social platforms",
    description:
      "Connect supported social platforms and move content from creation toward publication from one workspace.",
  },
  {
    icon: BarChart3,
    title: "Understand performance",
    description:
      "Track content and audience performance so you can learn what is working and make better publishing decisions.",
  },
  {
    icon: Users,
    title: "Grow with attribution",
    description:
      "Use campaign, referral, and watermark attribution capabilities to understand where creator growth is coming from.",
  },
];

export default function FeaturesPage() {
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: "XCR8 Features",
    url: "https://www.xcr8.tech/features",
    description:
      "Features for planning, AI-assisted creation, visual production, social publishing, performance tracking, and creator growth.",
    isPartOf: {
      "@type": "WebSite",
      name: "XCR8",
      url: "https://www.xcr8.tech",
    },
  };

  return (
    <main className="lux-page min-h-screen px-5 py-12 lg:px-10">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />

      <div className="mx-auto w-full max-w-6xl">
        <header className="flex items-center justify-between">
          <Link
            href="/welcome"
            className="text-sm font-semibold text-slate-900 dark:text-white"
          >
            XCR8
          </Link>
          <Link
            href="/auth/login"
            className="rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800 shadow-sm transition hover:border-slate-400 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
          >
            Log In
          </Link>
        </header>

        <section className="mx-auto max-w-3xl py-16 text-center md:py-20">
          <p className="mb-3 inline-flex rounded-full border border-cyan-200 bg-cyan-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-cyan-700 dark:border-cyan-500/20 dark:bg-cyan-500/10 dark:text-cyan-200">
            XCR8 features
          </p>
          <h1 className="text-4xl font-semibold leading-tight tracking-tight text-slate-950 dark:text-white md:text-6xl">
            Everything creators need to plan, create, publish, and grow.
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-base leading-7 text-slate-600 dark:text-slate-300 md:text-lg">
            XCR8 brings the creator workflow into one workspace, combining planning,
            AI-assisted production, social publishing, performance tracking, and growth tools.
          </p>
        </section>

        <section className="grid gap-5 md:grid-cols-2 lg:grid-cols-3" aria-label="XCR8 features">
          {features.map(({ icon: Icon, title, description }) => (
            <article
              key={title}
              className="surface-card rounded-3xl border border-slate-200/70 bg-white/90 p-6 shadow-[0_14px_40px_rgba(15,23,42,0.06)] backdrop-blur dark:border-white/10 dark:bg-slate-950/72"
            >
              <div className="mb-5 inline-flex rounded-2xl border border-cyan-200 bg-cyan-50 p-3 text-cyan-700 dark:border-cyan-500/20 dark:bg-cyan-500/10 dark:text-cyan-200">
                <Icon size={21} aria-hidden="true" />
              </div>
              <h2 className="text-xl font-semibold text-slate-950 dark:text-white">{title}</h2>
              <p className="mt-3 text-sm leading-6 text-slate-600 dark:text-slate-300">
                {description}
              </p>
            </article>
          ))}
        </section>

        <section className="mx-auto max-w-3xl py-16 text-center md:py-20">
          <h2 className="text-3xl font-semibold tracking-tight text-slate-950 dark:text-white md:text-4xl">
            One workspace for the creator workflow.
          </h2>
          <p className="mt-4 text-base leading-7 text-slate-600 dark:text-slate-300">
            XCR8 is designed to connect the work between an idea, a finished piece of content,
            publication, and the performance data that helps you improve the next one.
          </p>
          <div className="mt-7 flex flex-wrap justify-center gap-3">
            <Link
              href="/auth/signup"
              className="inline-flex items-center gap-2 rounded-full border border-cyan-600 bg-cyan-600 px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-cyan-700 dark:border-cyan-400 dark:bg-cyan-400 dark:text-slate-950 dark:hover:bg-cyan-300"
            >
              Get started
              <ArrowRight size={16} />
            </Link>
            <Link
              href="/welcome"
              className="rounded-full border border-slate-300 bg-white px-6 py-3 text-sm font-medium text-slate-800 transition hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
            >
              Back to XCR8
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
