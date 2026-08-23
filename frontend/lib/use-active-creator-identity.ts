"use client";

import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { getCreatorWorkspaces, type CreatorWorkspace } from "@/lib/api";
import { useCreatorStore } from "@/lib/store";

export type ActiveCreatorIdentity = {
  ownerName: string;
  activeName: string;
  isManaged: boolean;
  activeProfile: CreatorWorkspace | null;
  profiles: CreatorWorkspace[];
};

export function useActiveCreatorIdentity(): ActiveCreatorIdentity {
  const userId = useCreatorStore((state) => state.userId);
  const ownerName = useCreatorStore((state) => state.displayName) || "Main account";
  const activeCreatorId = useCreatorStore((state) => state.activeCreatorId);
  const setActiveCreatorId = useCreatorStore((state) => state.setActiveCreatorId);

  const { data } = useQuery({
    queryKey: ["creator-workspaces", userId],
    queryFn: () => getCreatorWorkspaces(userId as number),
    enabled: Boolean(userId),
    staleTime: 30_000,
  });

  const profiles = data?.items ?? [];
  const activeWorkspaceId = activeCreatorId?.startsWith("workspace:")
    ? Number(activeCreatorId.slice("workspace:".length))
    : null;
  const activeProfile =
    activeWorkspaceId && Number.isFinite(activeWorkspaceId)
      ? profiles.find((profile) => profile.id === activeWorkspaceId) ?? null
      : null;

  useEffect(() => {
    if (
      data &&
      userId &&
      activeCreatorId?.startsWith("workspace:") &&
      !activeProfile
    ) {
      setActiveCreatorId(String(userId));
    }
  }, [activeCreatorId, activeProfile, data, setActiveCreatorId, userId]);

  return {
    ownerName,
    activeName: activeProfile?.name || ownerName,
    isManaged: Boolean(activeProfile),
    activeProfile,
    profiles,
  };
}
