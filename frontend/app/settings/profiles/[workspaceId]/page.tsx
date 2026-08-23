"use client";

import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { MobileShell } from "@/components/mobile-shell";
import {
  deleteCreatorWorkspace,
  getApiErrorMessage,
  getCreatorWorkspaces,
  updateCreatorWorkspace,
} from "@/lib/api";
import { useCreatorStore } from "@/lib/store";

export default function ManagedProfilePage() {
  const params = useParams<{ workspaceId: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const userId = useCreatorStore((state) => state.userId);
  const activeCreatorId = useCreatorStore((state) => state.activeCreatorId);
  const setActiveCreatorId = useCreatorStore((state) => state.setActiveCreatorId);
  const workspaceId = Number(params.workspaceId);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [notice, setNotice] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["creator-workspaces", userId],
    queryFn: () => getCreatorWorkspaces(userId as number),
    enabled: Boolean(userId && workspaceId),
  });
  const profile = useMemo(
    () => data?.items.find((item) => item.id === workspaceId),
    [data?.items, workspaceId],
  );

  useEffect(() => {
    if (!profile) return;
    setName(profile.name);
    setDescription(profile.description || "");
  }, [profile]);

  const saveMutation = useMutation({
    mutationFn: () =>
      updateCreatorWorkspace(userId as number, workspaceId, {
        name: name.trim(),
        description: description.trim() || null,
      }),
    onSuccess: async () => {
      setNotice("Profile identity updated.");
      await queryClient.invalidateQueries({ queryKey: ["creator-workspaces", userId] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteCreatorWorkspace(userId as number, workspaceId),
    onSuccess: async () => {
      if (activeCreatorId === `workspace:${workspaceId}`) {
        setActiveCreatorId(String(userId));
      }
      await queryClient.invalidateQueries();
      router.replace("/settings");
    },
  });

  const activate = async () => {
    setActiveCreatorId(`workspace:${workspaceId}`);
    await queryClient.invalidateQueries();
    setNotice("This profile is now active across Xcr8.");
  };

  const error = saveMutation.error || deleteMutation.error;

  return (
    <MobileShell
      title={profile?.name || "Managed profile"}
      subtitle="Control this profile’s identity and open its isolated workspace."
    >
      <div className="mx-auto max-w-3xl space-y-4">
        {notice ? (
          <p className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300 light:text-emerald-700">
            {notice}
          </p>
        ) : null}
        {error ? (
          <p className="rounded-xl border border-rose-500/20 bg-rose-500/10 px-3 py-2 text-sm text-rose-300 light:text-rose-700">
            {getApiErrorMessage(error, "Could not update this profile.")}
          </p>
        ) : null}

        <section className="xcr8-panel rounded-2xl p-5">
          <p className="xcr8-eyebrow">Profile identity</p>
          {isLoading ? (
            <p className="mt-3 text-sm text-slate-500">Loading profile...</p>
          ) : !profile ? (
            <p className="mt-3 text-sm text-rose-300">This profile was not found.</p>
          ) : (
            <div className="mt-4 space-y-3">
              <label className="block text-xs text-slate-400">
                Profile, brand, or client name
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  className="xcr8-input mt-1"
                  maxLength={180}
                />
              </label>
              <label className="block text-xs text-slate-400">
                Niche, audience, brand voice, and operating notes
                <textarea
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  className="xcr8-input mt-1 min-h-32"
                  maxLength={2000}
                />
              </label>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={!name.trim() || saveMutation.isPending}
                  onClick={() => saveMutation.mutate()}
                  className="rounded-xl bg-fuchsia-600 px-4 py-2 text-xs font-semibold text-white disabled:opacity-50"
                >
                  {saveMutation.isPending ? "Saving..." : "Save identity"}
                </button>
                <button
                  type="button"
                  onClick={() => void activate()}
                  className="rounded-xl border border-emerald-400/25 bg-emerald-500/10 px-4 py-2 text-xs font-semibold text-emerald-300 light:text-emerald-700"
                >
                  {activeCreatorId === `workspace:${workspaceId}` ? "Currently active" : "Make active"}
                </button>
              </div>
            </div>
          )}
        </section>

        <section className="xcr8-panel rounded-2xl p-5">
          <p className="xcr8-eyebrow">Profile workspace</p>
          <p className="mt-2 text-sm text-slate-400">
            Activate this profile, then use these areas. Connections, posts, schedules, analytics,
            trends, and Cr8or AI memory will stay inside this profile.
          </p>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {[
              { href: "/settings#connected-platforms", label: "Connect this profile’s socials" },
              { href: "/compose", label: "Create profile content" },
              { href: "/calendar", label: "Manage profile schedule" },
              { href: "/analytics", label: "View profile analytics" },
              { href: "/ai-studio", label: "Open profile AI Studio" },
              { href: "/dashboard", label: "Open profile dashboard" },
            ].map((action) => (
              <Link
                key={action.href}
                href={action.href}
                onClick={() => setActiveCreatorId(`workspace:${workspaceId}`)}
                className="surface-soft rounded-xl px-3 py-3 text-sm font-semibold text-slate-200 transition hover:bg-white/10 light:text-slate-700"
              >
                {action.label}
              </Link>
            ))}
          </div>
        </section>

        <section className="xcr8-panel rounded-2xl border border-rose-500/20 p-5">
          <p className="text-sm font-semibold text-rose-300 light:text-rose-700">Delete profile</p>
          <p className="mt-1 text-xs text-slate-500">
            This removes the profile container. Existing account data is not silently deleted.
          </p>
          <button
            type="button"
            disabled={deleteMutation.isPending}
            onClick={() => {
              if (window.confirm(`Delete ${profile?.name || "this profile"}?`)) {
                deleteMutation.mutate();
              }
            }}
            className="mt-3 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-2 text-xs font-semibold text-rose-300 disabled:opacity-50"
          >
            {deleteMutation.isPending ? "Deleting..." : "Delete managed profile"}
          </button>
        </section>
      </div>
    </MobileShell>
  );
}
