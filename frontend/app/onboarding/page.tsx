"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { CheckCircle2, Circle, Loader2, Sparkles } from "lucide-react";
import { completeOnboarding, getApiErrorMessage } from "@/lib/api";
import { useCreatorStore } from "@/lib/store";
import { Logo } from "@/components/logo";

const creatorTypes = [
  "influencer",
  "educator",
  "podcaster",
  "DJ",
  "musician",
  "brand",
  "agency",
  "entrepreneur",
];

const platforms = ["instagram", "tiktok", "x", "linkedin", "youtube", "facebook", "threads"];

const niches = [
  "entertainment",
  "business",
  "fashion",
  "music",
  "tech",
  "education",
  "lifestyle",
  "sports",
  "gaming",
];

const audienceLocations = ["Nigeria", "US", "UK", "Global", "African diaspora"];

const goals = [
  "grow audience",
  "increase engagement",
  "monetize content",
  "build personal brand",
  "automate workflow",
  "improve consistency",
];

const tones = [
  "bold",
  "funny",
  "educational",
  "luxury",
  "conversational",
  "motivational",
  "Gen Z",
  "corporate",
];

const frequencies = ["Daily", "3-4x weekly", "Weekly", "Bi-weekly"];

const wizardSteps = [
  "Creator Type",
  "Connect Platforms",
  "Content Niche",
  "Audience Location",
  "Creator Goals",
  "Tone & Personality",
];

function toggleMany(value: string, current: string[], set: (v: string[]) => void) {
  if (current.includes(value)) {
    set(current.filter((item) => item !== value));
    return;
  }
  set([...current, value]);
}

export default function OnboardingPage() {
  const router = useRouter();
  const hasHydrated = useCreatorStore((state) => state.hasHydrated);
  const userId = useCreatorStore((state) => state.userId);
  const setSession = useCreatorStore((state) => state.setSession);
  const displayName = useCreatorStore((state) => state.displayName) ?? "Creator";
  const fullName = useCreatorStore((state) => state.fullName) ?? displayName;

  const [step, setStep] = useState(1);
  const [initializing, setInitializing] = useState(false);
  const [initProgress, setInitProgress] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [creatorType, setCreatorType] = useState<string[]>(["influencer"]);
  const [platformsUsed, setPlatformsUsed] = useState<string[]>(["instagram", "tiktok"]);
  const [contentNiche, setContentNiche] = useState<string[]>(["entertainment"]);
  const [audienceLocation, setAudienceLocation] = useState<string[]>(["Nigeria"]);
  const [contentGoals, setContentGoals] = useState<string[]>(["grow audience"]);
  const [postingFrequency, setPostingFrequency] = useState<string[]>(["3-4x weekly"]);
  const [tone, setTone] = useState<string[]>(["bold"]);
  const [personality, setPersonality] = useState<string[]>(["conversational"]);

  useEffect(() => {
    if (hasHydrated && !userId) {
      router.replace("/auth/login");
    }
  }, [hasHydrated, router, userId]);

  const progress = useMemo(() => {
    if (initializing) return initProgress;
    return Math.round((step / (wizardSteps.length + 1)) * 100);
  }, [initProgress, initializing, step]);

  if (!hasHydrated || !userId) return null;

  const canContinue = () => {
    if (step === 1) return creatorType.length > 0;
    if (step === 2) return true;
    if (step === 3) return contentNiche.length > 0;
    if (step === 4) return audienceLocation.length > 0;
    if (step === 5) return contentGoals.length > 0 && postingFrequency.length > 0;
    if (step === 6) return tone.length > 0 && personality.length > 0;
    return true;
  };

  const nextStep = () => {
    if (!canContinue()) {
      setError("Please complete this step to continue.");
      return;
    }
    setError(null);
    if (step < 6) {
      setStep((prev) => prev + 1);
      return;
    }
    void finalizeOnboarding();
  };

  const finalizeOnboarding = async () => {
    setLoading(true);
    setError(null);
    setInitializing(true);

    for (let i = 0; i <= 100; i += 5) {
      setInitProgress(i);
      await new Promise((resolve) => setTimeout(resolve, 90));
    }

    try {
      const session = await completeOnboarding({
        user_id: userId,
        creator_type: creatorType,
        platforms_used: platformsUsed,
        content_niche: contentNiche,
        audience_location: audienceLocation,
        content_goals: contentGoals,
        posting_frequency: postingFrequency,
        tone,
        personality,
      });
      setSession({
        userId: session.user_id,
        email: session.email,
        displayName: session.display_name,
        fullName: session.full_name,
        username: session.username,
        onboardingComplete: true,
      });
      router.replace("/dashboard");
    } catch (err) {
      setInitializing(false);
      setError(getApiErrorMessage(err, "Could not complete onboarding. Please try again."));
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="lux-page flex min-h-screen w-full items-center justify-center px-5 py-12">
      <div className="lux-orb-a" />
      <div className="lux-orb-b" />
      <div className="lux-orb-c" />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45 }}
        className="xcr8-panel relative w-full max-w-[720px] overflow-hidden rounded-[28px] p-6 sm:p-8"
      >
        <div className="mb-5 flex items-center justify-between gap-3">
          <Logo size="md" className="!w-[220px] max-w-full" />
          <span className="rounded-full border border-violet-500/30 bg-violet-500/10 px-3 py-1 text-xs font-medium text-violet-300 light:border-violet-500/20 light:bg-violet-50 light:text-violet-700">
            Step {initializing ? 7 : step} / 7
          </span>
        </div>

        <div className="mb-5">
          <div className="mb-2 flex items-center justify-between text-xs">
            <span className="text-slate-400 light:text-slate-500">
              {initializing ? "Final AI initialization" : wizardSteps[step - 1]}
            </span>
            <span className="font-medium text-violet-400">{progress}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-white/10 light:bg-slate-100">
            <motion.div
              className="h-full rounded-full bg-gradient-to-r from-violet-500 to-indigo-500"
              initial={{ width: "0%" }}
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.3, ease: "easeOut" }}
            />
          </div>
        </div>

        {!initializing && (
          <div className="mb-5 flex flex-wrap gap-2">
            {wizardSteps.map((label, index) => {
              const num = index + 1;
              const done = step > num;
              const active = step === num;
              return (
                <span
                  key={label}
                  className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium ${
                    active
                      ? "bg-violet-500/20 text-violet-300"
                      : done
                        ? "bg-emerald-500/15 text-emerald-300"
                        : "bg-white/5 text-slate-500"
                  }`}
                >
                  {done ? <CheckCircle2 size={12} /> : <Circle size={12} />}
                  {label}
                </span>
              );
            })}
          </div>
        )}

        {!initializing ? (
          <div className="space-y-4">
            <h1 className="xcr8-title-lg text-white light:text-slate-900">
              {step === 1 && "What kind of creator are you?"}
              {step === 2 && "Connect your platforms"}
              {step === 3 && "Select your content niche"}
              {step === 4 && "Where is your audience?"}
              {step === 5 && "What are your goals?"}
              {step === 6 && "Choose your tone and personality"}
            </h1>
            <p className="xcr8-subtle text-sm">
              Personalizing XCR8 for {fullName}.
            </p>

            {step === 1 && (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {creatorTypes.map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => toggleMany(item, creatorType, setCreatorType)}
                    className={`rounded-xl px-3 py-2 text-sm font-medium transition ${
                      creatorType.includes(item)
                        ? "bg-violet-500/20 text-violet-300 ring-1 ring-violet-500/40"
                        : "surface-soft text-slate-300 light:text-slate-700"
                    }`}
                  >
                    {item}
                  </button>
                ))}
              </div>
            )}

            {step === 2 && (
              <>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {platforms.map((item) => (
                    <button
                      key={item}
                      type="button"
                      onClick={() => toggleMany(item, platformsUsed, setPlatformsUsed)}
                      className={`rounded-xl px-3 py-2 text-sm font-medium transition ${
                        platformsUsed.includes(item)
                          ? "bg-violet-500/20 text-violet-300 ring-1 ring-violet-500/40"
                          : "surface-soft text-slate-300 light:text-slate-700"
                      }`}
                    >
                      {item}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-slate-500">
                  You can also skip and connect later from Settings.
                </p>
              </>
            )}

            {step === 3 && (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {niches.map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => toggleMany(item, contentNiche, setContentNiche)}
                    className={`rounded-xl px-3 py-2 text-sm font-medium transition ${
                      contentNiche.includes(item)
                        ? "bg-indigo-500/20 text-indigo-300 ring-1 ring-indigo-500/40"
                        : "surface-soft text-slate-300 light:text-slate-700"
                    }`}
                  >
                    {item}
                  </button>
                ))}
              </div>
            )}

            {step === 4 && (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {audienceLocations.map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => toggleMany(item, audienceLocation, setAudienceLocation)}
                    className={`rounded-xl px-3 py-2 text-sm font-medium transition ${
                      audienceLocation.includes(item)
                        ? "bg-fuchsia-500/20 text-fuchsia-300 ring-1 ring-fuchsia-500/40"
                        : "surface-soft text-slate-300 light:text-slate-700"
                    }`}
                  >
                    {item}
                  </button>
                ))}
              </div>
            )}

            {step === 5 && (
              <>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {goals.map((item) => (
                    <button
                      key={item}
                      type="button"
                      onClick={() => toggleMany(item, contentGoals, setContentGoals)}
                      className={`rounded-xl px-3 py-2 text-sm font-medium transition ${
                        contentGoals.includes(item)
                          ? "bg-emerald-500/20 text-emerald-300 ring-1 ring-emerald-500/40"
                          : "surface-soft text-slate-300 light:text-slate-700"
                      }`}
                    >
                      {item}
                    </button>
                  ))}
                </div>
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Posting frequency
                  </p>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {frequencies.map((item) => (
                      <button
                        key={item}
                        type="button"
                        onClick={() => toggleMany(item, postingFrequency, setPostingFrequency)}
                        className={`rounded-xl px-3 py-2 text-sm font-medium transition ${
                          postingFrequency.includes(item)
                            ? "bg-cyan-500/20 text-cyan-300 ring-1 ring-cyan-500/40"
                            : "surface-soft text-slate-300 light:text-slate-700"
                        }`}
                      >
                        {item}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}

            {step === 6 && (
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Tone
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    {tones.map((item) => (
                      <button
                        key={item}
                        type="button"
                        onClick={() => toggleMany(item, tone, setTone)}
                        className={`rounded-xl px-3 py-2 text-sm font-medium transition ${
                          tone.includes(item)
                            ? "bg-violet-500/20 text-violet-300 ring-1 ring-violet-500/40"
                            : "surface-soft text-slate-300 light:text-slate-700"
                        }`}
                      >
                        {item}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Personality
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    {tones.map((item) => (
                      <button
                        key={`p-${item}`}
                        type="button"
                        onClick={() => toggleMany(item, personality, setPersonality)}
                        className={`rounded-xl px-3 py-2 text-sm font-medium transition ${
                          personality.includes(item)
                            ? "bg-rose-500/20 text-rose-300 ring-1 ring-rose-500/40"
                            : "surface-soft text-slate-300 light:text-slate-700"
                        }`}
                      >
                        {item}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {error ? (
              <p className="rounded-xl border border-rose-500/20 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">
                {error}
              </p>
            ) : null}

            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => setStep((prev) => Math.max(1, prev - 1))}
                disabled={step === 1 || loading}
                className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-slate-200 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Back
              </button>
              <button
                type="button"
                onClick={nextStep}
                disabled={loading}
                className="cta-btn inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold disabled:opacity-60"
              >
                {step < 6 ? "Continue" : "Initialize AI"}
              </button>
            </div>
          </div>
        ) : (
          <div className="py-6 text-center">
            <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-violet-500/20 text-violet-300">
              <Loader2 size={24} className="animate-spin" />
            </div>
            <h2 className="text-holo text-2xl font-bold">
              Building Your Creator Intelligence System
            </h2>
            <p className="mx-auto mt-2 max-w-md text-sm text-slate-400 light:text-slate-500">
              Creator brain initialization, voice profile setup, audience analysis, and AI memory
              activation in progress.
            </p>
            <div className="mt-5 space-y-2 text-left">
              {[
                "Creator brain initialization",
                "Voice profile setup",
                "Audience analysis",
                "AI memory activation",
              ].map((label, idx) => (
                <div
                  key={label}
                  className="surface-soft flex items-center gap-3 rounded-xl px-3 py-2.5"
                >
                  {initProgress > idx * 25 ? (
                    <CheckCircle2 size={16} className="text-emerald-400" />
                  ) : (
                    <Sparkles size={16} className="text-violet-400" />
                  )}
                  <span className="text-sm text-slate-300 light:text-slate-600">{label}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </motion.div>
    </main>
  );
}
