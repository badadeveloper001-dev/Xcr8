"use client";

import { AnimatePresence, motion } from "framer-motion";
import Link from "next/link";
import { ChangeEvent, DragEvent, useRef, useState } from "react";

type UploadState = {
  isUploading: boolean;
  error: string | null;
  uploadedUrl: string | null;
};

async function uploadImage(file: File): Promise<string> {
  const payload = new FormData();
  payload.append("file", file);

  const response = await fetch("/api/upload", {
    method: "POST",
    body: payload,
  });

  const data = (await response.json()) as { url?: string; error?: string };
  if (!response.ok || !data.url) {
    throw new Error(data.error ?? "Upload failed.");
  }

  return data.url;
}

export default function UploadPage() {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [dragging, setDragging] = useState(false);
  const [state, setState] = useState<UploadState>({
    isUploading: false,
    error: null,
    uploadedUrl: null,
  });

  const processFile = async (file: File | null) => {
    if (!file) {
      return;
    }

    setState({ isUploading: true, error: null, uploadedUrl: null });
    try {
      const uploadedUrl = await uploadImage(file);
      setState({ isUploading: false, error: null, uploadedUrl });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Upload failed.";
      setState({ isUploading: false, error: message, uploadedUrl: null });
    }
  };

  const onDrop = async (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer.files.item(0);
    await processFile(file);
  };

  const onChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.item(0) ?? null;
    await processFile(file);
    event.target.value = "";
  };

  return (
    <main className="lux-page mx-auto min-h-screen w-full max-w-5xl px-5 py-12 lg:px-10">
      <div className="lux-orb-a" />
      <div className="lux-orb-b" />
      <div className="lux-orb-c" />

      <div className="mb-8 flex items-center justify-between">
        <Link
          href="/"
          className="text-sm font-medium text-slate-300 hover:text-white light:text-slate-600 light:hover:text-slate-900"
        >
          Back to home
        </Link>
        <p className="section-kicker">Upload Studio</p>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.08fr_0.92fr]">
        <div className="surface-luxe lux-panel cyber-grid rounded-[28px] p-5 sm:p-6">
          <p className="section-kicker mb-2">Public image upload</p>
          <h1 className="text-3xl font-semibold tracking-tight text-white light:text-slate-900 sm:text-4xl">
            Drop an image into your workflow.
          </h1>
          <p className="mt-3 max-w-2xl text-sm text-slate-400 light:text-slate-500">
            Upload once, get a public URL, and reuse it across chat, scheduling, and creation.
          </p>

          <label
            onDragOver={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(event) => {
              void onDrop(event);
            }}
            className={`mt-6 flex min-h-72 cursor-pointer flex-col items-center justify-center rounded-[24px] border border-dashed p-8 text-center transition ${
              dragging
                ? "border-violet-400 bg-violet-500/10 shadow-[0_0_0_1px_rgba(139,92,246,0.3)]"
                : "border-white/10 bg-black/10 light:border-slate-200 light:bg-white/70"
            }`}
          >
            <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white shadow-lg">
              <span className="text-lg font-bold">+</span>
            </div>
            <p className="mt-4 text-base font-semibold text-white light:text-slate-900">
              Drag and drop an image here
            </p>
            <p className="mt-1 text-sm text-slate-400 light:text-slate-600">
              or click to choose a file up to 10MB
            </p>
            <input
              ref={inputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              className="hidden"
              onChange={(event) => {
                void onChange(event);
              }}
            />
          </label>

          <AnimatePresence mode="wait">
            {state.isUploading && (
              <motion.p
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                className="mt-5 text-sm font-medium text-violet-300 light:text-violet-700"
              >
                Uploading...
              </motion.p>
            )}

            {state.error && (
              <motion.p
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                className="mt-5 rounded-xl border border-rose-500/20 bg-rose-500/10 px-3 py-2 text-sm text-rose-300 light:text-rose-700"
              >
                {state.error}
              </motion.p>
            )}

            {state.uploadedUrl && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="mt-5 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-4"
              >
                <p className="text-sm font-semibold text-emerald-300 light:text-emerald-700">
                  Upload complete
                </p>
                <a
                  href={state.uploadedUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2 block break-all text-sm text-emerald-200 underline light:text-emerald-700"
                >
                  {state.uploadedUrl}
                </a>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="space-y-4">
          <div className="surface-card rounded-[28px] p-5">
            <p className="section-kicker mb-2">Workflow hints</p>
            <div className="space-y-3 text-sm text-slate-300 light:text-slate-600">
              <p>1. Upload once, then reuse the URL across the workspace.</p>
              <p>2. Keep crops clean for feed, story, and carousel formats.</p>
              <p>3. Paste the URL into Compose or AI Studio to reuse instantly.</p>
            </div>
          </div>

          <div className="surface-card rounded-[28px] p-5">
            <p className="section-kicker mb-2">Preview state</p>
            <div className="aspect-[4/3] rounded-[22px] border border-white/10 bg-gradient-to-br from-violet-500/20 via-fuchsia-500/10 to-cyan-500/10 p-4 light:border-slate-200">
              <div className="flex h-full items-end justify-between">
                <div>
                  <p className="text-lg font-semibold text-white light:text-slate-900">
                    Ready to upload
                  </p>
                  <p className="mt-1 text-sm text-slate-300 light:text-slate-600">
                    Your preview appears here after upload.
                  </p>
                </div>
                <div className="h-16 w-16 rounded-2xl bg-white/10" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
