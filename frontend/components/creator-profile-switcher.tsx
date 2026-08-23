"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BriefcaseBusiness } from "lucide-react";
import { useRouter } from "next/navigation";
import { getCreatorWorkspaces } from "@/lib/api";
import { useCreatorStore } from "@/lib/store";

export function CreatorProfileSwitcher() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const userId = useCreatorStore((state) => state.userId);
  const displayName = useCreatorStore((state) => state.displayName);
  const activeCreatorId = useCreatorStore((state) => state.activeCreatorId);
  const setActiveCreatorId = useCreatorStore((state) => state.setActiveCreatorId);

  const { data } = useQuery({
    queryKey: ["creator-workspaces", userId],
    queryFn: () => getCreatorWorkspaces(userId as number),
    enabled: Boolean(userId),
    staleTime: 30_000,
  });

  if (!userId) return null;

  const selectedValue = activeCreatorId?.startsWith("workspace:")
    ? activeCreatorId
    : "main";

  const switchProfile = (value: string) => {
    setActiveCreatorId(value === "main" ? String(userId) : value);
    void queryClient.invalidateQueries();
    router.refresh();
  };

  return (
    <label className="flex min-w-0 items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-2.5 py-2 light:border-slate-200 light:bg-white">
      <BriefcaseBusiness size={14} className="shrink-0 text-fuchsia-300 light:text-fuchsia-700" />
      <span className="sr-only">Active creator profile</span>
      <select
        value={selectedValue}
        onChange={(event) => switchProfile(event.target.value)}
        className="max-w-36 min-w-0 bg-transparent text-xs font-semibold text-slate-100 outline-none light:text-slate-800 sm:max-w-48"
        aria-label="Switch active creator profile"
      >
        <option value="main">{displayName || "Main account"}</option>
        {(data?.items ?? []).map((profile) => (
          <option key={profile.id} value={`workspace:${profile.id}`}>
            {profile.name}
          </option>
        ))}
      </select>
    </label>
  );
}
