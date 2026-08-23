"use client";

import { AnimatePresence, motion } from "framer-motion";
import { DragEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { DeviceMediaPicker } from "@/components/device-media-picker";
import { MobileShell } from "@/components/mobile-shell";
import { uploadMediaFile, type UploadedMediaItem } from "@/lib/media-upload";
import { useCreatorStore } from "@/lib/store";

type UploadState = {
  isUploading: boolean;
  error: string | null;
  uploaded: UploadedMediaItem | null;
};

export default function UploadPage() {
  const router = useRouter();
  const hasHydrated = useCreatorStore((state) => state.hasHydrated);
  const userId = useCreatorStore((state) => state.userId);
  const [dragging, setDragging] = useState(false);
  const [state, setState] = useState<UploadState>({
    isUploading: false,
    error: null,
    uploaded: null,
  });

  useEffect(() => {
    if (hasHydrated && !userId) router.replace("/auth/login");
  }, [hasHydrated, router, userId]);

  const processFiles = async (files: File[]) => {
    const file = files[0];
    if (!file || !userId) return;

    setState({ isUploading: true, error: null, uploaded: null });
    try {
      const uploaded = await uploadMediaFile(userId, file);
      setState({ isUploading: false, error: null, uploaded });
    } catch (error) {
      setState({
        isUploading: false,
        error: error instanceof Error ? error.message : "Upload failed.",
        uploaded: null,
      });
    }
  };

  const onDrop = async (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    await processFiles(Array.from(event.dataTransfer.files));
  };

  if (!hasHydrated || !userId) return null;

  return (
    <MobileShell
      title="Upload Studio"
      subtitle="Choose an image or video from your photo library or device files."
    >
      <div className="mx-auto grid max-w-5xl gap-5 lg:grid-cols-[1.08fr_0.92fr]">
        <section className="xcr8-panel cyber-grid rounded-[28px] p-5 sm:p-6">
          <p className="xcr8-eyebrow mb-2">Media upload</p>
          <h1 className="xcr8-title-xl text-white light:text-slate-900 sm:text-4xl">
            Add media to your Xcr8 workflow.
          </h1>
          <p className="xcr8-subtle mt-3 max-w-2xl text-sm">
            Upload an image or video once, then reuse its URL in Compose, scheduling, and AI Studio.
          </p>

          <div
            onDragOver={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(event) => void onDrop(event)}
            className={`mt-6 flex min-h-64 flex-col items-center justify-center rounded-[24px] border border-dashed p-8 text-center transition ${
              dragging
                ? "border-violet-400 bg-violet-500/10 shadow-[0_0_0_1px_rgba(139,92,246,0.3)]"
                : "border-white/10 bg-black/10 light:border-slate-200 light:bg-white/70"
            }`}
          >
            <div className="grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-violet-500 to-fuchsia-500 text-lg font-bold text-white shadow-lg">
              +
            </div>
            <p className="mt-4 text-base font-semibold text-white light:text-slate-900">
              Drop an image or video here
            </p>
            <p className="mt-1 text-sm text-slate-400 light:text-slate-600">
              or choose where Xcr8 should open the system picker
            </p>
            <DeviceMediaPicker
              kind="media"
              disabled={state.isUploading}
              className="mt-4"
              onFiles={(files) => void processFiles(files)}
            />
          </div>

          <AnimatePresence mode="wait">
            {state.isUploading ? (
              <motion.p
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                className="mt-5 text-sm font-medium text-violet-300 light:text-violet-700"
              >
                Uploading securely...
              </motion.p>
            ) : null}

            {state.error ? (
              <motion.p
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                className="mt-5 rounded-xl border border-rose-500/20 bg-rose-500/10 px-3 py-2 text-sm text-rose-300 light:text-rose-700"
              >
                {state.error}
              </motion.p>
            ) : null}

            {state.uploaded ? (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="mt-5 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-4"
              >
                <p className="text-sm font-semibold text-emerald-300 light:text-emerald-700">
                  Upload complete
                </p>
                <p className="mt-1 truncate text-xs text-slate-400">{state.uploaded.name}</p>
                <a
                  href={state.uploaded.url}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2 block break-all text-sm text-emerald-200 underline light:text-emerald-700"
                >
                  {state.uploaded.url}
                </a>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </section>

        <div className="space-y-4">
          <section className="xcr8-panel rounded-[28px] p-5">
            <p className="xcr8-eyebrow mb-2">Preview</p>
            <div className="overflow-hidden rounded-[22px] border border-white/10 bg-black/20 light:border-slate-200">
              {state.uploaded?.mediaType === "video" ? (
                <video src={state.uploaded.url} controls className="max-h-80 w-full" />
              ) : state.uploaded ? (
                // eslint-disable-next-line @next/next/no-img-element -- dynamic user upload
                <img
                  src={state.uploaded.url}
                  alt={state.uploaded.name}
                  className="max-h-80 w-full object-contain"
                />
              ) : (
                <div className="grid min-h-56 place-items-center p-5 text-sm text-slate-500">
                  Your image or video preview appears here.
                </div>
              )}
            </div>
          </section>

          <section className="xcr8-panel rounded-[28px] p-5">
            <p className="xcr8-eyebrow mb-2">Privacy and access</p>
            <div className="space-y-2 text-sm text-slate-300 light:text-slate-600">
              <p>Xcr8 cannot view your library until you choose specific files.</p>
              <p>The phone and browser decide whether to show selected photos or your full library.</p>
              <p>If items are missing, enable All Photos/full access in the device permissions.</p>
            </div>
          </section>
        </div>
      </div>
    </MobileShell>
  );
}
