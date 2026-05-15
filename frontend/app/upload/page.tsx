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
    <main className="mx-auto flex min-h-screen w-full max-w-4xl flex-col px-6 py-16">
      <Link href="/" className="text-sm font-medium text-primary hover:underline">
        Back to home
      </Link>

      <div className="mt-8 rounded-2xl border bg-white/85 p-8 shadow-2xl backdrop-blur">
        <h1 className="text-3xl font-bold text-slate-900">Public Image Upload</h1>
        <p className="mt-3 max-w-2xl text-slate-600">
          Drop an image to publish it at a public URL. Then paste the URL in chat or open it and
          drag the downloaded file into chat.
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
          className={`mt-8 flex min-h-56 cursor-pointer items-center justify-center rounded-xl border-2 border-dashed p-8 text-center transition ${
            dragging ? "border-primary bg-primary/10" : "border-slate-300 bg-slate-50/80"
          }`}
        >
          <div>
            <p className="text-base font-medium text-slate-800">Drag and drop an image here</p>
            <p className="mt-2 text-sm text-slate-500">or click to browse (max 10MB)</p>
          </div>
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
              className="mt-6 text-sm font-medium text-primary"
            >
              Uploading...
            </motion.p>
          )}

          {state.error && (
            <motion.p
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              className="mt-6 text-sm font-medium text-red-600"
            >
              {state.error}
            </motion.p>
          )}

          {state.uploadedUrl && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 p-4"
            >
              <p className="text-sm font-semibold text-emerald-800">Upload complete</p>
              <a
                href={state.uploadedUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-2 block break-all text-sm text-emerald-700 underline"
              >
                {state.uploadedUrl}
              </a>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </main>
  );
}
