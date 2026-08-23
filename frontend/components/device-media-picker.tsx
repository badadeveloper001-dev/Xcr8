"use client";

import { FolderOpen, Images } from "lucide-react";
import { useRef } from "react";

type DeviceMediaPickerProps = {
  kind: "image" | "media";
  multiple?: boolean;
  disabled?: boolean;
  onFiles: (files: File[]) => void;
  className?: string;
  photoLabel?: string;
};

export function DeviceMediaPicker({
  kind,
  multiple = false,
  disabled = false,
  onFiles,
  className = "",
  photoLabel,
}: DeviceMediaPickerProps) {
  const libraryInputRef = useRef<HTMLInputElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const acceptedTypes = kind === "image" ? "image/*" : "image/*,video/*";

  const selectFiles = (files: FileList | null) => {
    const supported = Array.from(files ?? []).filter((file) =>
      kind === "image"
        ? file.type.startsWith("image/")
        : file.type.startsWith("image/") || file.type.startsWith("video/"),
    );
    if (supported.length) onFiles(multiple ? supported : supported.slice(0, 1));
  };

  return (
    <div className={className}>
      <input
        ref={libraryInputRef}
        type="file"
        accept={acceptedTypes}
        multiple={multiple}
        className="hidden"
        onChange={(event) => {
          selectFiles(event.target.files);
          event.target.value = "";
        }}
      />
      <input
        ref={fileInputRef}
        type="file"
        multiple={multiple}
        className="hidden"
        onChange={(event) => {
          selectFiles(event.target.files);
          event.target.value = "";
        }}
      />

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={disabled}
          onClick={() => libraryInputRef.current?.click()}
          className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-violet-500 disabled:opacity-50"
        >
          <Images size={14} />
          {photoLabel || (kind === "image" ? "Choose from photos" : "Choose photos or videos")}
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => fileInputRef.current?.click()}
          className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-slate-200 transition hover:bg-white/10 disabled:opacity-50 light:border-slate-200 light:bg-white light:text-slate-700"
        >
          <FolderOpen size={14} />
          Browse device files
        </button>
      </div>

      <p className="mt-2 max-w-2xl text-[11px] leading-relaxed text-slate-500">
        Xcr8 only receives the files you choose. Your browser controls photo-library access. If
        some photos are missing, select “Allow full access” or “All photos” in the phone’s
        browser/app photo permissions, then try again. “Browse device files” is always available
        as a fallback.
      </p>
    </div>
  );
}
