import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

type CreatorState = {
  hasHydrated: boolean;
  setHasHydrated: (value: boolean) => void;
  activeCreatorId: string | null;
  setActiveCreatorId: (id: string | null) => void;
  userId: number | null;
  email: string | null;
  displayName: string | null;
  avatarUrl: string | null;
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
    avatarUrl?: string | null;
    onboardingComplete: boolean;
  }) => void;
  clearSession: () => void;
  setAvatarUrl: (avatarUrl: string | null) => void;
  setTheme: (theme: "dark" | "light" | "system") => void;
  setDistributionDraft: (payload: CreatorState["distributionDraft"]) => void;
};

export const useCreatorStore = create<CreatorState>()(
  persist(
    (set) => ({
      hasHydrated: false,
      setHasHydrated: (value) => set({ hasHydrated: value }),
      activeCreatorId: null,
      setActiveCreatorId: (id) => set({ activeCreatorId: id }),
      userId: null,
      email: null,
      displayName: null,
      avatarUrl: null,
      fullName: null,
      username: null,
      onboardingComplete: false,
      theme: "system",
      distributionDraft: null,
      setSession: ({
        userId,
        email,
        displayName,
        fullName,
        username,
        avatarUrl,
        onboardingComplete,
      }) =>
        set({
          userId,
          email,
          displayName,
          avatarUrl: avatarUrl ?? null,
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
          avatarUrl: null,
          fullName: null,
          username: null,
          onboardingComplete: false,
          activeCreatorId: null,
          distributionDraft: null,
        }),
      setAvatarUrl: (avatarUrl) => set({ avatarUrl }),
      setTheme: (theme) => set({ theme }),
      setDistributionDraft: (distributionDraft) => set({ distributionDraft }),
    }),
    {
      name: "xcr8-creator-store",
      storage: createJSONStorage(() => localStorage),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
      partialize: (state) => ({
        userId: state.userId,
        email: state.email,
        displayName: state.displayName,
        avatarUrl: state.avatarUrl,
        fullName: state.fullName,
        username: state.username,
        onboardingComplete: state.onboardingComplete,
        theme: state.theme,
        activeCreatorId: state.activeCreatorId,
      }),
    },
  ),
);
