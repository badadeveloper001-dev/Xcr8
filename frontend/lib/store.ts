import { create } from "zustand";

type CreatorState = {
  activeCreatorId: string | null;
  setActiveCreatorId: (id: string | null) => void;
  userId: number | null;
  email: string | null;
  displayName: string | null;
  onboardingComplete: boolean;
  theme: "dark" | "light";
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
    onboardingComplete: boolean;
  }) => void;
  clearSession: () => void;
  setTheme: (theme: "dark" | "light") => void;
  setDistributionDraft: (payload: CreatorState["distributionDraft"]) => void;
};

export const useCreatorStore = create<CreatorState>((set) => ({
  activeCreatorId: null,
  setActiveCreatorId: (id) => set({ activeCreatorId: id }),
  userId: null,
  email: null,
  displayName: null,
  onboardingComplete: false,
  theme: "dark",
  distributionDraft: null,
  setSession: ({ userId, email, displayName, onboardingComplete }) =>
    set({ userId, email, displayName, onboardingComplete, activeCreatorId: String(userId) }),
  clearSession: () =>
    set({
      userId: null,
      email: null,
      displayName: null,
      onboardingComplete: false,
      activeCreatorId: null,
      distributionDraft: null,
    }),
  setTheme: (theme) => set({ theme }),
  setDistributionDraft: (distributionDraft) => set({ distributionDraft }),
}));

