import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  async redirects() {
    return [
      { source: "/admin/login", destination: "/admin", permanent: false },
      { source: "/admin/dashboard/login", destination: "/admin", permanent: false },
    ];
  },
  eslint: {
    // Linting is run via dedicated scripts/CI to avoid Next's false plugin-detection warning.
    ignoreDuringBuilds: true,
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.unsplash.com",
      },
    ],
  },
};

export default nextConfig;
