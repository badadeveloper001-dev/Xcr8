"use client";

import { useEffect } from "react";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("App route error", error);
  }, [error]);

  return (
    <main className="flex min-h-screen w-full items-center justify-center px-5 py-12">
      <div className="surface-card max-w-md rounded-2xl p-5 text-center">
        <p className="section-kicker mb-2">Something went wrong</p>
        <h1 className="text-xl font-semibold text-white light:text-slate-900">
          We hit an unexpected error
        </h1>
        <p className="mt-2 text-sm text-slate-400 light:text-slate-600">
          Try again. If this keeps happening, reload the app.
        </p>
        <button
          type="button"
          onClick={reset}
          className="cta-btn mt-4 inline-flex rounded-xl px-4 py-2 text-sm font-semibold"
        >
          Try again
        </button>
      </div>
    </main>
  );
}
