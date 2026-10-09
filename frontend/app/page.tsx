import type { Metadata } from "next";
import SplashPageClient from "./SplashPageClient";

export const metadata: Metadata = {
  alternates: {
    canonical: "/welcome",
  },
};

export default function SplashPage() {
  return <SplashPageClient />;
}
