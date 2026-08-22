"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  getAdminCreators,
  getApiErrorMessage,
  updateAdminCreatorPlan,
} from "@/lib/api";

type AssignablePlan = "free" | "starter" | "pro" | "business";

const planOptions: Array<{ id: AssignablePlan; label: string }> = [
  { id: "free", label: "Free" },
  { id: "starter", label: "Starter" },
  { id: "pro", label: "Pro" },
  { id: "business", label: "Business (Agency)" },
];

function normalizedPlan(plan: string): AssignablePlan {
  if (plan === "plus") return "starter";
  if (plan === "agency") return "business";
  if (plan === "starter" || plan === "pro" || plan === "business") return plan;
  return "free";
}

export default function CreatorsPage() {
  const queryClient = useQueryClient();
  const [query, setQuery] = useState("");
  const [selectedPlans, setSelectedPlans] = useState<Record<number, AssignablePlan>>({});
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const accessCode = useMemo(
    () => (typeof window === "undefined" ? "" : sessionStorage.getItem("xcr8-admin-access") ?? ""),
    [],
  );

  const { data, isLoading } = useQuery({
    queryKey: ["admin-creators", query],
    queryFn: () => getAdminCreators(accessCode, query),
    enabled: Boolean(accessCode),
  });

  const planMutation = useMutation({
    mutationFn: ({ userId, plan }: { userId: number; plan: AssignablePlan }) =>
      updateAdminCreatorPlan(accessCode, userId, plan),
    onSuccess: (result) => {
      setError(null);
      setNotice(`${result.email} moved to ${result.plan === "business" ? "Business (Agency)" : result.plan}.`);
      void queryClient.invalidateQueries({ queryKey: ["admin-creators"] });
    },
    onError: (mutationError) => {
      setNotice(null);
      setError(getApiErrorMessage(mutationError, "Could not change this creator's plan."));
    },
  });

  const items = data?.items ?? [];

  return (
    <section>
      <h2 className="xcr8-title-lg text-white light:text-slate-900">Creators</h2>
      <p className="mb-4 text-sm text-slate-400">
        Search creators, review their current plan, and grant an audited owner override.
      </p>

      {notice ? (
        <p className="mb-3 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300">
          {notice}
        </p>
      ) : null}
      {error ? (
        <p className="mb-3 rounded-xl border border-rose-500/20 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">
          {error}
        </p>
      ) : null}

      <input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search name or email"
        className="xcr8-input mb-4 max-w-md"
      />

      <div className="xcr8-panel divide-y divide-white/10 rounded-2xl">
        {items.map((creator) => {
          const currentPlan = normalizedPlan(creator.plan);
          const selectedPlan = selectedPlans[creator.user_id] ?? currentPlan;
          const isSaving = planMutation.isPending && planMutation.variables?.userId === creator.user_id;

          return (
            <article
              key={creator.user_id}
              className="flex flex-wrap items-center justify-between gap-4 p-4"
            >
              <div className="min-w-[220px]">
                <p className="font-medium text-white light:text-slate-900">
                  {creator.display_name}
                </p>
                <p className="text-xs text-slate-500">{creator.email}</p>
                <p className="mt-1 text-xs text-slate-400">
                  Current plan:{" "}
                  <span className="font-semibold text-violet-300">
                    {currentPlan === "business" ? "Business (Agency)" : currentPlan}
                  </span>
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  {creator.posts} posts · {creator.platforms.join(", ") || "No platforms"}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <select
                  aria-label={`Plan for ${creator.email}`}
                  value={selectedPlan}
                  onChange={(event) =>
                    setSelectedPlans((current) => ({
                      ...current,
                      [creator.user_id]: event.target.value as AssignablePlan,
                    }))
                  }
                  className="rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white light:bg-white light:text-slate-900"
                >
                  {planOptions.map((plan) => (
                    <option key={plan.id} value={plan.id}>
                      {plan.label}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={isSaving || selectedPlan === currentPlan}
                  onClick={() => {
                    if (
                      window.confirm(
                        `Move ${creator.email} from ${currentPlan} to ${selectedPlan}? This grants plan entitlements immediately.`,
                      )
                    ) {
                      planMutation.mutate({ userId: creator.user_id, plan: selectedPlan });
                    }
                  }}
                  className="rounded-xl bg-violet-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-45"
                >
                  {isSaving ? "Applying..." : "Apply plan"}
                </button>
              </div>
            </article>
          );
        })}

        {!isLoading && !items.length ? (
          <p className="p-4 text-sm text-slate-400">No creators found.</p>
        ) : null}
      </div>
    </section>
  );
}
