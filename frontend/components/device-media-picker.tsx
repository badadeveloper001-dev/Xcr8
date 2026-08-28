"use client";

import { FolderOpen, Images } from "lucide-react";
import { useId, useState } from "react";

type DeviceMediaPickerProps = {
  kind: "image" | "media";
  multiple?: boolean;
  disabled?: boolean;
  onFiles: (files: File[]) => void;
  className?: string;
  photoLabel?: string;
};

const extensionTypes: Record<string, string> = {
  jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp",
  gif: "image/gif", avif: "image/avif", heic: "image/heic", heif: "image/heif",
  mp4: "video/mp4", m4v: "video/mp4", mov: "video/quicktime", webm: "video/webm",
};

// Android document providers sometimes omit MIME types. The server must still
// validate the actual file bytes; extension inference only repairs picker UX.
export function normalizeSelectedMedia(file: File, kind: "image" | "media"): File | null {
  const extension = file.name.split(".").pop()?.toLowerCase() || "";
  const mime = !file.type || file.type === "application/octet-stream"
    ? extensionTypes[extension] || ""
    : file.type;
  if (!mime.startsWith("image/") && !(kind === "media" && mime.startsWith("video/"))) {
    return null;
  }
  return file.type === mime ? file : new File([file], file.name, {
    type: mime,
    lastModified: file.lastModified,
  });
}

export function DeviceMediaPicker({
  kind,
  multiple = false,
  disabled = false,
  onFiles,
  className = "",
  photoLabel,
}: DeviceMediaPickerProps) {
  const id = useId();
  const [selectionError, setSelectionError] = useState<string | null>(null);
  const acceptedTypes = kind === "image" ? "image/*" : "image/*,video/*";

  const selectFiles = (files: FileList | null) => {
    const selected = Array.from(files ?? []);
    if (!selected.length) return; // Picker cancellation is not an error.
    const supported = selected.map((file) => normalizeSelectedMedia(file, kind))
      .filter((file): file is File => file !== null);
    setSelectionError(supported.length < selected.length
      ? "Some selected files are not supported. Choose photos or videos from your device."
      : null);
    if (supported.length) onFiles(multiple ? supported : supported.slice(0, 1));
  };

  return (
    <div className={className}>
      <div className="flex flex-wrap gap-2">
        <label
          aria-disabled={disabled}
          className={`relative inline-flex min-h-11 items-center gap-2 rounded-xl bg-violet-600 px-3 py-2 text-xs font-semibold text-white focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 ${disabled ? "opacity-50" : "cursor-pointer hover:bg-violet-500"}`}
        >
          <input
            type="file"
            accept={acceptedTypes}
            multiple={multiple}
            disabled={disabled}
            className="sr-only"
            aria-label={photoLabel || (kind === "image" ? "Choose from photos" : "Choose photos or videos")}
            aria-describedby={id}
            onChange={(event) => {
              selectFiles(event.target.files);
              event.target.value = "";
            }}
          />
          <Images size={14} className="shrink-0" />
          {photoLabel || (kind === "image" ? "Choose from photos" : "Choose photos or videos")}
        </label>
        <label
          aria-disabled={disabled}
          className={`relative inline-flex min-h-11 items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-slate-200 focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 light:border-slate-200 light:bg-white light:text-slate-700 ${disabled ? "opacity-50" : "cursor-pointer hover:bg-white/10"}`}
        >
          <input
            type="file"
            multiple={multiple}
            disabled={disabled}
            className="sr-only"
            aria-label="Browse device files"
            aria-describedby={id}
            onChange={(event) => {
              selectFiles(event.target.files);
              event.target.value = "";
            }}
          />
          <FolderOpen size={14} className="shrink-0" />
          Browse device files
        </label>
      </div>
      {selectionError ? (
        <p role="alert" className="mt-2 text-xs text-rose-400">{selectionError}</p>
      ) : null}
      <p id={id} className="mt-2 max-w-2xl text-[11px] leading-relaxed text-slate-500">
        Xcr8 receives only the files you select. If photos are missing, try Browse device files
        or download cloud photos to the device first. Your browser and Android control which
        folders and providers are available; Xcr8 cannot request unrestricted library access.
      </p>
    </div>
  );
}
