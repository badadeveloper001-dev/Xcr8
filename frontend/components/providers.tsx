"use client";

import { QueryClientProvider } from "@tanstack/react-query";
import { ReactNode, useEffect, useState } from "react";
import { Cr8orAiWidget } from "@/components/cr8or-ai-widget";
import { getQueryClient } from "@/lib/query-client";
import { useCreatorStore } from "@/lib/store";

type ProvidersProps = {
  children: ReactNode;
};

export function Providers({ children }: ProvidersProps) {
  const [queryClient] = useState(() => getQueryClient());

  useEffect(() => {
    const theme = localStorage.getItem("xcr8-theme");
    if (theme === "dark" || theme === "light") {
      useCreatorStore.getState().setTheme(theme);
      document.documentElement.classList.toggle("dark", theme === "dark");
    }
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      {children}
      <Cr8orAiWidget />
    </QueryClientProvider>
  );
}
