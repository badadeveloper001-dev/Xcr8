"use client";

import React, { useEffect, useState } from "react";
import { apiClient } from "../../../../frontend/lib/api";
import { useCreatorStore } from "../../../../frontend/lib/store";

type PlanItem = { id: string; name: string; price: number };

export default function BillingPage() {
  const [plans, setPlans] = useState<PlanItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const userId = useCreatorStore((s) => s.userId);

  useEffect(() => {
    async function load() {
      try {
        const resp = await apiClient.get("/api/v1/plans");
        setPlans(resp.data || []);
      } catch (err) {
        console.error(err);
        setMessage("Failed to load plans.");
      }
    }
    load();
  }, []);

  async function handleUpgrade(planId: string) {
    if (!userId) {
      setMessage("Sign in to upgrade your plan.");
      return;
    }
    setLoading(true);
    setMessage(null);
    try {
      const resp = await apiClient.post(
        "/api/v1/plans/upgrade",
        { plan: planId },
        { params: { user_id: userId } },
      );
      setMessage(`Upgraded to ${resp.data.plan}`);
    } catch (err: any) {
      console.error(err);
      const text = err?.response?.data?.detail || err?.message || "Upgrade failed";
      setMessage(String(text));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-3xl mx-auto py-12">
      <h1 className="text-2xl font-semibold mb-4">Billing & Plans</h1>
      {message && <div className="mb-4 text-sm text-gray-700">{message}</div>}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {plans.map((p) => (
          <div key={p.id} className="border rounded-lg p-4">
            <div className="text-lg font-medium">{p.name}</div>
            <div className="text-sm text-gray-500">
              {p.id === "free" ? "Free" : `NGN ${p.price}`}
            </div>
            <div className="mt-4">
              <button
                className="px-4 py-2 bg-blue-600 text-white rounded"
                disabled={loading}
                onClick={() => handleUpgrade(p.id)}
              >
                {p.id === "free" ? "Current" : "Upgrade"}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
