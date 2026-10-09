import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: "OAI-SearchBot", allow: "/" },
      { userAgent: "GPTBot", allow: "/" },
      { userAgent: "Googlebot", allow: "/" },
      { userAgent: "Bingbot", allow: "/" },
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/admin/", "/auth/", "/dashboard/", "/onboarding/", "/settings/", "/api/"],
      },
    ],
    sitemap: "https://xcr8.tech/sitemap.xml",
  };
}
