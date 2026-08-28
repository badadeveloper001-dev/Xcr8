export const platformLabels: Record<string, string> = {
  instagram: "Instagram", facebook: "Facebook", youtube_shorts: "YouTube", threads: "Threads",
};

export function safeSourceUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password ? url.toString() : null;
  } catch { return null; }
}

export function metricNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export const platformMetrics: Record<string, Array<[string, string, string]>> = {
  instagram: [
    ["followers_count", "Followers", "Current account total"],
    ["media_count", "Posts", "Current account total"],
    ["reach", "Accounts reached", "Provider-reported period"],
    ["views", "Views", "Provider-reported period"],
    ["avg_likes", "Average likes", "Recent post sample"],
    ["avg_comments", "Average comments", "Recent post sample"],
  ],
  facebook: [
    ["followers_count", "Followers", "Current account total"],
    ["page_fans", "Page likes", "Current account total"],
    ["recent_posts_count", "Posts sampled", "Up to 10 recent posts"],
    ["avg_likes", "Average likes", "Recent post sample"],
    ["avg_comments", "Average comments", "Recent post sample"],
  ],
  youtube_shorts: [
    ["subscriber_count", "Subscribers", "Current total; may be hidden or rounded"],
    ["view_count", "Channel views", "Lifetime; includes non-Shorts videos"],
    ["video_count", "Videos", "Channel total; not Shorts-only"],
  ],
  threads: [
    ["followers_count", "Followers", "Current account total"],
    ["views", "Views", "Latest reported interval"],
    ["likes", "Likes", "Provider-reported period"],
    ["replies", "Replies", "Provider-reported period"],
    ["reposts", "Reposts", "Provider-reported period"],
    ["quotes", "Quotes", "Provider-reported period"],
  ],
};

export function notificationCategory(topic: string): "support" | "trends" {
  return topic.startsWith("Pulse incident #") ? "support" : "trends";
}

export function displayDate(value?: string | null): string {
  if (!value) return "Date unavailable";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Date unavailable" : date.toLocaleString();
}
