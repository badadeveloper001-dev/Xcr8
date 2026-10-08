import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "AI Creator Workspace",
  description:
    "XCR8 helps creators and marketing teams plan content, create visuals, publish across social platforms, and track performance from one workspace.",
  alternates: {
    canonical: "/welcome",
  },
  openGraph: {
    type: "website",
    title: "XCR8 | AI Creator Workspace",
    description:
      "Plan, create, publish, and grow with XCR8 from one creator workspace.",
    url: "/welcome",
  },
  twitter: {
    card: "summary_large_image",
    title: "XCR8 | AI Creator Workspace",
    description:
      "Plan, create, publish, and grow with XCR8 from one creator workspace.",
  },
};

export default function WelcomeLayout({ children }: { children: React.ReactNode }) {
  return children;
}
