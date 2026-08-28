"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { MobileShell } from "@/components/mobile-shell";
import { apiClient, getApiErrorMessage, initializePaystackCheckout, verifyPaystackPayment } from "@/lib/api";
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
  pricing: RegionalPricing | undefined;
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

const FALLBACK_PLAN_LIMITS: PlanItemApi[] = [
  { id: "free", name: "Free", price_cents: 0, monthly_credits: 500, text_generations: 50, image_generations: 0, high_quality_images: 0, voiceovers: 0, creator_profiles: 0, social_accounts: null, scheduled_posts: 10, storage_megabytes: 200 },
  { id: "starter", name: "Starter", price_cents: 900, monthly_credits: 5000, text_generations: 500, image_generations: 25, high_quality_images: 0, voiceovers: 10, creator_profiles: 0, social_accounts: null, scheduled_posts: 100, storage_megabytes: 2048 },
  { id: "pro", name: "Pro", price_cents: 2900, monthly_credits: 15000, text_generations: 2500, image_generations: 100, high_quality_images: 10, voiceovers: 50, creator_profiles: 0, social_accounts: null, scheduled_posts: 500, storage_megabytes: 10240 },
  { id: "business", name: "Business", price_cents: 9900, monthly_credits: 50000, text_generations: 10000, image_generations: 300, high_quality_images: 50, voiceovers: 200, creator_profiles: 5, social_accounts: null, scheduled_posts: 2000, storage_megabytes: 51200 },
];

function formatStorage(megabytes: number): string {
  if (megabytes >= 1024) return `${megabytes / 1024} GB`;
  return `${megabytes} MB`;
}

export default function BillingPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const hasHydrated = useCreatorStore((state) => state.hasHydrated);
  const storedPlan = useCreatorStore((state) => state.plan);
  const queryClient = useQueryClient();
  const [currentPlan, setCurrentPlan] = useState(storedPlan || "free");
  const [billingCycle, setBillingCycle] = useState<"monthly" | "annual">("monthly");
  const [message, setMessage] = useState<string | null>(null);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const userId = useCreatorStore((state) => state.userId);
  const setPlan = useCreatorStore((state) => state.setPlan);

  useEffect(() => {
    if (hasHydrated && !userId) {
      router.replace("/auth/login");
    }
  }, [hasHydrated, router, userId]);

  const enabled = Boolean(hasHydrated && userId);
  const catalog = useQuery({
    queryKey: ["billing-catalog", userId],
    enabled,
    staleTime: 5 * 60_000,
    retry: false,
    queryFn: async ({ signal }) =>
      (await apiClient.get<PlanItemApi[]>("/api/v1/plans/", { signal, timeout: 15_000 })).data,
  });
  const pricing = useQuery({
    queryKey: ["billing-pricing", userId],
    enabled,
    staleTime: 60_000,
    retry: false,
    queryFn: async ({ signal }) =>
      (await apiClient.get<PricingCatalogResponse>("/api/pricing", { signal, timeout: 10_000 })).data,
  });
  const usage = useQuery({
    queryKey: ["billing-current-plan", userId],
    enabled,
    staleTime: 30_000,
    retry: false,
    queryFn: async ({ signal }) =>
      (await apiClient.get<UsageResponse>(`/api/v1/plans/${userId}/usage`, { signal, timeout: 20_000 })).data,
  });
  const plans = useMemo<PlanItem[]>(() =>
    (catalog.data?.length ? catalog.data : FALLBACK_PLAN_LIMITS).map((plan) => ({
      ...plan,
      pricing: pricing.data?.plans?.[plan.id] || plan.pricing,
    })), [catalog.data, pricing.data]);

  useEffect(() => {
    const nextPlan = usage.data?.plan?.id;
    if (nextPlan) {
      setCurrentPlan(nextPlan);
      setPlan(nextPlan);
    }
  }, [usage.data, setPlan]);

  const billingUnavailable = catalog.isError || pricing.isError || usage.isError;
  const retryBilling = () => {
    void catalog.refetch();
    void pricing.refetch();
    void usage.refetch();
  };

  useEffect(() => {
    const reference = searchParams.get("reference")?.trim();
    if (!hasHydrated || !userId || !reference) return;

    let cancelled = false;
    setMessage("Confirming your Paystack payment securely…");
    void verifyPaystackPayment(userId, reference)
      .then((result) => {
        if (cancelled) return;
        queryClient.setQueryData(["billing-current-plan", userId], { plan: { id: result.plan } });
        void queryClient.invalidateQueries({ queryKey: ["billing-current-plan", userId] });
        setCurrentPlan(result.plan);
        setPlan(result.plan);
        setMessage(
          result.duplicate
            ? "This payment was already confirmed. Your plan is active."
            : "Payment confirmed. Your Xcr8 plan is now active.",
        );
        router.replace("/settings/billing");
      })
      .catch((error) => {
        if (!cancelled) {
          setMessage(getApiErrorMessage(error, "We could not confirm this payment yet. Please retry shortly."));
        }
      });

    return () => {
      cancelled = true;
    };
  }, [hasHydrated, queryClient, router, searchParams, setPlan, userId]);

  async function showUpgradeStatus(plan: PlanItem) {
    if (!userId) {
      setMessage("Sign in to upgrade your plan.");
      return;
    }
    if (!plan.pricing || !usage.data || usage.isError) {
      setMessage("Please wait for current pricing and account verification, or retry loading billing.");
      return;
    }
    const quotedPrice =
      billingCycle === "annual"
        ? plan.pricing.annual_formatted
        : plan.pricing.monthly_formatted;
    setCheckoutLoading(true);
    setMessage("Preparing secure Paystack test checkout for " + plan.name + " at " + quotedPrice + "…");
    try {
      const checkout = await initializePaystackCheckout(userId, plan.id, billingCycle);
      if (!checkout.authorization_url) {
        throw new Error("Paystack did not return a checkout URL.");
      }
      window.location.assign(checkout.authorization_url);
    } catch (error) {
      setMessage(getApiErrorMessage(error, "Could not start Paystack checkout. Check the Paystack test key configuration."));
    } finally {
      setCheckoutLoading(false);
    }
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

        {billingUnavailable ? (
          <p role="status" className="mb-4 rounded-xl border p-3 text-sm">
            Some billing details could not refresh. Showing available information.{" "}
            <button type="button" onClick={retryBilling} className="underline">Retry</button>
          </p>
        ) : null}
        {usage.isPending ? <p role="status" className="mb-4 text-sm text-gray-500">Checking your current plan…</p> : null}
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
                      ) : !plan.pricing ? (
                        <span role="status">Loading price…</span>
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
                  disabled={isCurrent || plan.id === "free" || checkoutLoading || !plan.pricing || !usage.data || usage.isError}
                  onClick={() => showUpgradeStatus(plan)}
                >
                  {isCurrent
                    ? "Your current plan"
                    : plan.id === "free"
                      ? "Free plan"
                      : checkoutLoading ? "Opening checkout…" : `Choose ${plan.name}`}
                </button>
              </section>
            );
          })}
        </div>
      </div>
    </MobileShell>
  );
}
