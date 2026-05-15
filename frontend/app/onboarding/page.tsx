"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { completeOnboarding } from "@/lib/api";
import { useCreatorStore } from "@/lib/store";
import { CheckCircle2, Circle, Loader2 } from "lucide-react";
import { Logo } from "@/components/logo";

const steps = [
  { id: 1, label: "Initializing creator profile", detail: "Setting up your workspace identity" },
  { id: 2, label: "Calibrating adaptive tone", detail: "Learning your writing style" },
  { id: 3, label: "Enabling multilingual engine", detail: "EN · Pidgin · Yoruba · Code-switch" },
  { id: 4, label: "Activating creator memory", detail: "Publishing behavior tracking online" },
];

export default function OnboardingPage() {
  const router = useRouter();
  const userId = useCreatorStore((state) => state.userId);
  const setSession = useCreatorStore((state) => state.setSession);
  const displayName = useCreatorStore((state) => state.displayName) ?? "Creator";
  const email = useCreatorStore((state) => state.email) ?? "user@xcr8.app";
  const [currentStep, setCurrentStep] = useState(0);

  useEffect(() => {
    if (!userId) {
      router.replace("/auth/login");
      return;
    }

    const autoBootstrap = async () => {
      // Simulate step-through for UX
      for (let i = 0; i < steps.length; i++) {
        setCurrentStep(i + 1);
        await new Promise((res) => setTimeout(res, 600));
      }

      try {
        const session = await completeOnboarding({
          user_id: userId,
          niche: "creator",
          tone: "adaptive",
          emoji_style: "auto",
          slang_profile: "adaptive",
          multilingual_profile: ["english", "nigerian_pidgin", "yoruba", "code_switch"],
        });
        setSession({
          userId: session.user_id,
          email,
          displayName,
          onboardingComplete: true,
        });
      } finally {
        router.replace("/dashboard");
      }
    };

    void autoBootstrap();
  }, [displayName, email, router, setSession, userId]);

  if (!userId) return null;

  const progress = (currentStep / steps.length) * 100;

  return (
    <main className="flex min-h-screen w-full items-center justify-center px-5 py-12">
      <div className="pointer-events-none fixed left-[-120px] top-[-80px] h-[400px] w-[400px] rounded-full bg-violet-600/20 blur-[100px]" />
      <div className="pointer-events-none fixed bottom-[-100px] right-[-100px] h-[350px] w-[350px] rounded-full bg-fuchsia-600/15 blur-[90px]" />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45 }}
        className="surface-card relative w-full max-w-[480px] overflow-hidden rounded-[28px] p-8"
      >
        {/* Logo */}
        <div className="mb-6 flex items-center gap-2.5">
          <Logo size="md" className="!w-[220px] max-w-full" />
        </div>

        <h1 className="text-2xl font-bold tracking-tight text-white light:text-slate-900">
          Setting up your workspace
        </h1>
        <p className="mt-1.5 text-sm text-slate-400 light:text-slate-500">
          Preparing your AI profile,{" "}
          <span className="text-violet-400 light:text-violet-600">{displayName}</span>
        </p>

        {/* Progress bar */}
        <div className="mt-6 mb-6">
          <div className="mb-2 flex items-center justify-between text-xs">
            <span className="text-slate-400 light:text-slate-500">Initialization</span>
            <span className="font-medium text-violet-400">{Math.round(progress)}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-white/10 light:bg-slate-100">
            <motion.div
              className="h-full rounded-full bg-gradient-to-r from-violet-500 to-indigo-500"
              initial={{ width: "0%" }}
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.4, ease: "easeOut" }}
            />
          </div>
        </div>

        {/* Steps list */}
        <div className="space-y-3">
          {steps.map((step) => {
            const done = currentStep > step.id;
            const active = currentStep === step.id;
            return (
              <div
                key={step.id}
                className={`flex items-start gap-3 rounded-2xl p-3 transition-colors ${
                  active ? "surface-soft" : done ? "opacity-60" : "opacity-30"
                }`}
              >
                <span className="mt-0.5 shrink-0">
                  {done ? (
                    <CheckCircle2 size={18} className="text-emerald-400" />
                  ) : active ? (
                    <Loader2 size={18} className="animate-spin text-violet-400" />
                  ) : (
                    <Circle size={18} className="text-slate-600" />
                  )}
                </span>
                <div>
                  <p className="text-sm font-medium text-white light:text-slate-900">
                    {step.label}
                  </p>
                  <p className="text-xs text-slate-500">{step.detail}</p>
                </div>
              </div>
            );
          })}
        </div>

        <p className="mt-6 text-center text-xs text-slate-500">Redirecting to your dashboard…</p>
      </motion.div>
    </main>
  );
}
