import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

type CreatorState = {
  activeCreatorId: string | null;
  setActiveCreatorId: (id: string | null) => void;
  userId: number | null;
  email: string | null;
  displayName: string | null;
  fullName: string | null;
  username: string | null;
  onboardingComplete: boolean;
  theme: "dark" | "light" | "system";
  distributionDraft: {
    postId: number;
    variants: Array<{
      platform: string;
      language: string;
      adaptedCaption: string;
      approved: boolean;
      hashtags: string[];
      hook: string;
    }>;
  } | null;
  setSession: (payload: {
    userId: number;
    email: string;
    displayName: string;
    fullName?: string | null;
    username?: string | null;
    onboardingComplete: boolean;
  }) => void;
  clearSession: () => void;
  setTheme: (theme: "dark" | "light" | "system") => void;
  setDistributionDraft: (payload: CreatorState["distributionDraft"]) => void;
};

export const useCreatorStore = create<CreatorState>()(
  persist(
    (set) => ({
      activeCreatorId: null,
      setActiveCreatorId: (id) => set({ activeCreatorId: id }),
      userId: null,
      email: null,
      displayName: null,
      fullName: null,
      username: null,
      onboardingComplete: false,
      theme: "system",
      distributionDraft: null,
      setSession: ({ userId, email, displayName, fullName, username, onboardingComplete }) =>
        set({
          userId,
          email,
          displayName,
          fullName: fullName ?? displayName,
          username: username ?? null,
          onboardingComplete,
          activeCreatorId: String(userId),
        }),
      clearSession: () =>
        set({
          userId: null,
          email: null,
          displayName: null,
          fullName: null,
          username: null,
          onboardingComplete: false,
          activeCreatorId: null,
          distributionDraft: null,
        }),
      setTheme: (theme) => set({ theme }),
      setDistributionDraft: (distributionDraft) => set({ distributionDraft }),
    }),
    {
      name: "xcr8-creator-store",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        userId: state.userId,
        email: state.email,
        displayName: state.displayName,
        fullName: state.fullName,
        username: state.username,
        onboardingComplete: state.onboardingComplete,
        theme: state.theme,
        activeCreatorId: state.activeCreatorId,
      }),
    },
  ),
);
