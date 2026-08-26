"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { MobileShell } from "@/components/mobile-shell";
import { apiClient } from "@/lib/api";
import { useCreatorStore } from "@/lib/store";

type RegionalPricing = {
  region: "nigeria" | "global";
  country_code: string | null;
  currency: "NGN" | "USD";
  monthly_amount_minor: number;
  annual_amount_minor: number;
  monthly_formatted: string;
  annual_formatted: string;
  annual_savings_months: number;
};

type PlanItem = {
  id: string;
  name: string;
  price_cents: number | null;
  monthly_credits: number;
  text_generations: number;
  image_generations: number;
  high_quality_images: number;
  voiceovers: number;
  creator_profiles: number;
  social_accounts: number | null;
  scheduled_posts: number;
  storage_megabytes: number;
  pricing: RegionalPricing;
};

type PlanItemApi = Omit<PlanItem, "pricing"> & {
  pricing?: RegionalPricing;
};

type PricingCatalogResponse = {
  plans?: Record<string, RegionalPricing>;
};

type UsageResponse = {
  plan?: { id?: string };
};

const GLOBAL_FALLBACK_PRICES: Record<string, { monthly: number; annual: number }> = {
  free: { monthly: 0, annual: 0 },
  starter: { monthly: 900, annual: 9000 },
  pro: { monthly: 2900, annual: 29000 },
  business: { monthly: 9900, annual: 99000 },
};

const FALLBACK_PLAN_LIMITS: PlanItemApi[] = [
  { id: "free", name: "Free", price_cents: 0, monthly_credits: 500, text_generations: 50, image_generations: 0, high_quality_images: 0, voiceovers: 0, creator_profiles: 0, social_accounts: null, scheduled_posts: 10, storage_megabytes: 200 },
  { id: "starter", name: "Starter", price_cents: 900, monthly_credits: 5000, text_generations: 500, image_generations: 25, high_quality_images: 0, voiceovers: 10, creator_profiles: 0, social_accounts: null, scheduled_posts: 100, storage_megabytes: 2048 },
  { id: "pro", name: "Pro", price_cents: 2900, monthly_credits: 15000, text_generations: 2500, image_generations: 100, high_quality_images: 10, voiceovers: 50, creator_profiles: 0, social_accounts: null, scheduled_posts: 500, storage_megabytes: 10240 },
  { id: "business", name: "Business", price_cents: 9900, monthly_credits: 50000, text_generations: 10000, image_generations: 300, high_quality_images: 50, voiceovers: 200, creator_profiles: 5, social_accounts: null, scheduled_posts: 2000, storage_megabytes: 51200 },
];

function fallbackPricing(planId: string): RegionalPricing {
  const price = GLOBAL_FALLBACK_PRICES[planId] ?? { monthly: 0, annual: 0 };
  const format = (amount: number) =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    }).format(amount / 100);

  return {
    region: "global",
    country_code: null,
    currency: "USD",
    monthly_amount_minor: price.monthly,
    annual_amount_minor: price.annual,
    monthly_formatted: format(price.monthly),
    annual_formatted: format(price.annual),
    annual_savings_months: 2,
  };
}

function formatStorage(megabytes: number): string {
  if (megabytes >= 1024) return `${megabytes / 1024} GB`;
  return `${megabytes} MB`;
}

export default function BillingPage() {
  const router = useRouter();
  const hasHydrated = useCreatorStore((state) => state.hasHydrated);
  const storedPlan = useCreatorStore((state) => state.plan);
  const [plans, setPlans] = useState<PlanItem[]>([]);
  const [currentPlan, setCurrentPlan] = useState(storedPlan || "free");
  const [billingCycle, setBillingCycle] = useState<"monthly" | "annual">("monthly");
  const [message, setMessage] = useState<string | null>(null);
  const userId = useCreatorStore((state) => state.userId);
  const setPlan = useCreatorStore((state) => state.setPlan);

  useEffect(() => {
    if (hasHydrated && !userId) {
      router.replace("/auth/login");
    }
  }, [hasHydrated, router, userId]);

  useEffect(() => {
    async function load() {
      const pricingCatalogPromise = fetch("/api/pricing", { cache: "no-store" })
        .then(async (response) =>
          response.ok ? ((await response.json()) as PricingCatalogResponse) : null,
        )
        .catch(() => null);

      let sourcePlans = FALLBACK_PLAN_LIMITS;
      try {
        const plansResponse = await apiClient.get<PlanItemApi[]>("/api/v1/plans/");
        if (plansResponse.data?.length) sourcePlans = plansResponse.data;
      } catch (error) {
        console.error("Plan catalog request failed; using the safe local catalog.", error);
      }

      const pricingCatalog = await pricingCatalogPromise;
      const pricingByPlan = pricingCatalog?.plans || {};
      setPlans(
        sourcePlans.map((plan) => ({
          ...plan,
          pricing: pricingByPlan[plan.id] || plan.pricing || fallbackPricing(plan.id),
        })),
      );

      try {
        const usageResponse = await apiClient.get<UsageResponse>(
          `/api/v1/plans/${userId}/usage`,
        );
        const nextPlan = usageResponse.data.plan?.id || "free";
        setCurrentPlan(nextPlan);
        setPlan(nextPlan);
      } catch (error) {
        console.error("Plan usage request failed; keeping the signed-in plan.", error);
        setCurrentPlan(storedPlan || "free");
      }
    }

    if (hasHydrated && userId) {
      void load();
    }
  }, [hasHydrated, setPlan, storedPlan, userId]);

  function showUpgradeStatus(plan: PlanItem) {
    if (!userId) {
      setMessage("Sign in to upgrade your plan.");
      return;
    }
    const quotedPrice =
      billingCycle === "annual"
        ? plan.pricing.annual_formatted
        : plan.pricing.monthly_formatted;
    setMessage(
      `${plan.name} is ${quotedPrice}/${billingCycle === "annual" ? "year" : "month"}. Secure checkout is the remaining payment-provider step; no plan will activate without a verified payment webhook.`,
    );
  }

  if (!hasHydrated || !userId) return null;

  return (
    <MobileShell
      title="Plans & billing"
      subtitle="Your credits, plan limits, and secure upgrade options."
    >
      <div className="mx-auto max-w-5xl">
        <div className="mb-8">
          <p className="text-sm font-medium text-blue-600">Plans & usage</p>
          <h1 className="mt-1 text-3xl font-semibold">Billing & Plans</h1>
          <p className="mt-2 max-w-2xl text-sm text-gray-500">
            Compare plan limits and choose monthly or annual billing.
          </p>
        </div>

        {message && (
          <div className="mb-6 rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
            {message}
          </div>
        )}

        {plans.length > 0 ? (
          <div className="mb-5 flex justify-end">
            <div className="inline-flex rounded-xl bg-gray-100 p-1">
              {(["monthly", "annual"] as const).map((cycle) => (
                <button
                  key={cycle}
                  type="button"
                  onClick={() => setBillingCycle(cycle)}
                  className={`rounded-lg px-4 py-2 text-xs font-semibold capitalize transition ${
                    billingCycle === cycle
                      ? "bg-blue-600 text-white shadow-sm"
                      : "text-gray-600 hover:text-gray-900"
                  }`}
                >
                  {cycle}
                  {cycle === "annual" ? " · 2 months free" : ""}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {plans.map((plan) => {
            const isCurrent = plan.id === currentPlan;
            return (
              <section
                key={plan.id}
                className={`rounded-2xl border p-5 ${
                  isCurrent ? "border-blue-500 bg-blue-50/40" : "border-gray-200 bg-white"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-xl font-semibold">{plan.name}</h2>
                    <p className="mt-1 text-sm text-gray-500">
                      {plan.id === "free" ? (
                        "Free"
                      ) : (
                        <>
                          <span className="text-lg font-semibold text-gray-900">
                            {billingCycle === "annual"
                              ? plan.pricing.annual_formatted
                              : plan.pricing.monthly_formatted}
                          </span>
                          <span> / {billingCycle === "annual" ? "year" : "month"}</span>
                        </>
                      )}
                    </p>
                  </div>
                  {isCurrent && (
                    <span className="rounded-full bg-blue-600 px-3 py-1 text-xs font-medium text-white">
                      Current plan
                    </span>
                  )}
                </div>

                <dl className="mt-5 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                  <div>
                    <dt className="text-gray-500">Monthly credits</dt>
                    <dd className="font-medium">{plan.monthly_credits.toLocaleString()}</dd>
                  </div>
                  <div>
                    <dt className="text-gray-500">Text generations</dt>
                    <dd className="font-medium">{plan.text_generations.toLocaleString()}</dd>
                  </div>
                  <div>
                    <dt className="text-gray-500">Images</dt>
                    <dd className="font-medium">{plan.image_generations.toLocaleString()}</dd>
                  </div>
                  <div>
                    <dt className="text-gray-500">Voiceovers</dt>
                    <dd className="font-medium">{plan.voiceovers.toLocaleString()}</dd>
                  </div>
                  <div>
                    <dt className="text-gray-500">Creator profiles</dt>
                    <dd className="font-medium">
                      {plan.creator_profiles > 0
                        ? plan.creator_profiles.toLocaleString()
                        : "Business only"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-gray-500">Social accounts</dt>
                    <dd className="font-medium">{plan.social_accounts == null ? "Unlimited" : plan.social_accounts.toLocaleString()}</dd>
                  </div>
                  <div>
                    <dt className="text-gray-500">Scheduled posts</dt>
                    <dd className="font-medium">{plan.scheduled_posts.toLocaleString()}</dd>
                  </div>
                  <div>
                    <dt className="text-gray-500">Storage</dt>
                    <dd className="font-medium">{formatStorage(plan.storage_megabytes)}</dd>
                  </div>
                  <div>
                    <dt className="text-gray-500">High-quality images</dt>
                    <dd className="font-medium">
                      {plan.high_quality_images > 0
                        ? plan.high_quality_images.toLocaleString()
                        : "Not included"}
                    </dd>
                  </div>
                </dl>

                <button
                  type="button"
                  className="mt-6 w-full rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-gray-300"
                  disabled={isCurrent}
                  onClick={() => showUpgradeStatus(plan)}
                >
                  {isCurrent
                    ? "Your current plan"
                    : plan.id === "free"
                      ? "Free plan"
                      : `Choose ${plan.name}`}
                </button>
              </section>
            );
          })}
        </div>
      </div>
    </MobileShell>
  );
}
