"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Logo } from "@/components/logo";
import { getSession } from "@/lib/api";
import { useCreatorStore } from "@/lib/store";

export default function SplashPage() {
  const router = useRouter();

  useEffect(() => {
    const boot = async () => {
      const { userId, setSession, clearSession } = useCreatorStore.getState();
      if (userId) {
        try {
          const session = await getSession(userId);
          setSession({
            userId: session.user_id,
            email: session.email,
            displayName: session.display_name,
            fullName: session.full_name,
            username: session.username,
            onboardingComplete: session.onboarding_complete,
          });
          router.replace(session.onboarding_complete ? "/dashboard" : "/onboarding");
          return;
        } catch {
          clearSession();
        }
      }
      router.replace("/welcome");
    };

    const timer = window.setTimeout(() => {
      void boot();
    }, 2000);

    return () => window.clearTimeout(timer);
  }, [router]);

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden px-5 py-12">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_20%,rgba(99,102,241,0.2),transparent_42%),radial-gradient(circle_at_80%_80%,rgba(34,211,238,0.14),transparent_34%)] dark:bg-[radial-gradient(circle_at_50%_20%,rgba(99,102,241,0.26),transparent_42%),radial-gradient(circle_at_80%_80%,rgba(34,211,238,0.18),transparent_34%)]" />
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.7, ease: "easeOut" }}
        className="relative z-10"
      >
        <motion.div
          animate={{ y: [0, -10, 0], scale: [1, 1.02, 1] }}
          transition={{ duration: 3.8, repeat: Infinity, ease: "easeInOut" }}
          className="mx-auto w-fit"
        >
          <Logo size="md" className="!w-[280px] max-w-full" />
        </motion.div>
      </motion.div>
    </main>
  );
}
