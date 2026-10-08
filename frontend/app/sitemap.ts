import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: "https://www.xcr8.tech/welcome", changeFrequency: "weekly", priority: 1 },
    { url: "https://www.xcr8.tech/features", changeFrequency: "monthly", priority: 0.8 },
    { url: "https://www.xcr8.tech/terms", changeFrequency: "yearly", priority: 0.3 },
    { url: "https://www.xcr8.tech/privacy", changeFrequency: "yearly", priority: 0.3 },
  ];
}
