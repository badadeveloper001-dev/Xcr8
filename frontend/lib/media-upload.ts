export type UploadedMediaItem = {
  url: string;
  mediaType: "image" | "video";
  name: string;
};

function mediaType(file: File): "image" | "video" {
  return file.type.startsWith("video/") ? "video" : "image";
}

function validSignedUploadUrl(value: string | undefined): boolean {
  if (!value) return false;
  const normalized = value.trim();
  if (!normalized.startsWith("http://") && !normalized.startsWith("https://")) return false;
  return (
    normalized.includes("/storage/v1/object/upload/sign/") ||
    normalized.includes("/object/upload/sign/")
  );
}

function apiDetail(payload: unknown, fallback: string): string {
  if (!payload || typeof payload !== "object" || !("detail" in payload)) return fallback;
  const detail = (payload as { detail?: unknown }).detail;
  if (typeof detail === "string" && detail.trim()) return detail;
  if (detail && typeof detail === "object" && "message" in detail) {
    const message = (detail as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message;
  }
  return fallback;
}

export async function uploadMediaFile(userId: number, file: File): Promise<UploadedMediaItem> {
  if (!file.type.startsWith("image/") && !file.type.startsWith("video/")) {
    throw new Error("Choose an image or video file.");
  }

  const idempotencyKey = crypto.randomUUID();
  let presignResponse: Response | null = null;

  try {
    presignResponse = await fetch("/_/backend/api/v1/upload/presign", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": idempotencyKey,
      },
      body: JSON.stringify({
        user_id: userId,
        filename: file.name,
        content_type: file.type || "application/octet-stream",
        size_bytes: file.size,
      }),
    });
  } catch {
    presignResponse = null;
  }

  if (presignResponse?.ok) {
    const presignData = (await presignResponse.json()) as {
      signed_url?: string;
      public_url?: string;
    };
    if (
      presignData.public_url &&
      validSignedUploadUrl(presignData.signed_url)
    ) {
      try {
        const storageResponse = await fetch(presignData.signed_url as string, {
          method: "PUT",
          headers: { "Content-Type": file.type || "application/octet-stream" },
          body: file,
        });
        if (storageResponse.ok) {
          return {
            url: presignData.public_url,
            mediaType: mediaType(file),
            name: file.name,
          };
        }
      } catch {
        // Fall through to the backend upload path for smaller files.
      }
    }
  } else if (presignResponse) {
    const payload = await presignResponse.json().catch(() => null);
    if ([403, 413, 415, 429].includes(presignResponse.status)) {
      throw new Error(apiDetail(payload, "This file is not allowed by your current plan."));
    }
  }

  const formData = new FormData();
  formData.append("file", file);
  formData.append("user_id", String(userId));

  const fallbackResponse = await fetch("/_/backend/api/v1/upload", {
    method: "POST",
    headers: { "Idempotency-Key": idempotencyKey },
    body: formData,
  });
  const fallbackData = await fallbackResponse.json().catch(() => null);
  if (!fallbackResponse.ok) {
    throw new Error(apiDetail(fallbackData, "Upload failed. Please try again."));
  }

  const url =
    fallbackData && typeof fallbackData === "object" && "url" in fallbackData
      ? String((fallbackData as { url: unknown }).url || "")
      : "";
  if (!url) throw new Error("Upload succeeded but no media URL was returned.");

  return { url, mediaType: mediaType(file), name: file.name };
}
