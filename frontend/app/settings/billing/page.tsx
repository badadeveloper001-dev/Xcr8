"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { MobileShell } from "@/components/mobile-shell";
import { apiClient } from "@/lib/api";
import { useCreatorStore } from "@/lib/store";

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
  social_accounts: number;
  scheduled_posts: number;
  storage_megabytes: number;
};

type UsageResponse = {
  plan?: { id?: string };
};

function formatStorage(megabytes: number): string {
  if (megabytes >= 1024) return `${megabytes / 1024} GB`;
  return `${megabytes} MB`;
}

export default function BillingPage() {
  const router = useRouter();
  const hasHydrated = useCreatorStore((state) => state.hasHydrated);
  const [plans, setPlans] = useState<PlanItem[]>([]);
  const [currentPlan, setCurrentPlan] = useState("free");
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
      try {
        const plansResponse = await apiClient.get<PlanItem[]>("/api/v1/plans");
        setPlans(plansResponse.data || []);

        if (userId) {
          const usageResponse = await apiClient.get<UsageResponse>(
            `/api/v1/plans/${userId}/usage`,
          );
          const nextPlan = usageResponse.data.plan?.id || "free";
          setCurrentPlan(nextPlan);
          setPlan(nextPlan);
        }
      } catch (error) {
        console.error(error);
        setMessage("Could not load billing information.");
      }
    }

    if (hasHydrated && userId) {
      void load();
    }
  }, [hasHydrated, setPlan, userId]);

  function showUpgradeStatus(plan: PlanItem) {
    if (!userId) {
      setMessage("Sign in to upgrade your plan.");
      return;
    }
    setMessage(
      `${plan.name} checkout will be available here when Xcr8 pricing and secure payment are enabled.`,
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
          Compare plan limits here. Secure upgrades will be activated after pricing and payment
          checkout are finalized.
        </p>
      </div>

      {message && (
        <div className="mb-6 rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
          {message}
        </div>
      )}

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
                    {plan.price_cents === 0 ? "Free" : "Pricing to be announced"}
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
                  <dd className="font-medium">{plan.creator_profiles.toLocaleString()}</dd>
                </div>
                <div>
                  <dt className="text-gray-500">Social accounts</dt>
                  <dd className="font-medium">{plan.social_accounts.toLocaleString()}</dd>
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
                {isCurrent ? "Your current plan" : "Upgrade here soon"}
              </button>
            </section>
          );
        })}
      </div>
      </div>
    </MobileShell>
  );
}
