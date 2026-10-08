import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { DM_Sans, Poppins } from "next/font/google";
import { Providers } from "@/components/providers";
import "./globals.css";

const dmSans = DM_Sans({ subsets: ["latin"], variable: "--font-body" });
const poppins = Poppins({
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
  variable: "--font-display",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://www.xcr8.tech"),
  title: {
    default: "XCR8 | AI Creator Workspace",
    template: "%s | XCR8",
  },
  description:
    "XCR8 is an AI creator workspace for planning content, creating visuals, publishing across social platforms, and tracking performance from one workspace.",
  applicationName: "XCR8",
  generator: "Next.js",
  referrer: "origin-when-cross-origin",
  icons: {
    icon: "/favicon.ico",
  },
  openGraph: {
    type: "website",
    siteName: "XCR8",
    title: "XCR8 | AI Creator Workspace",
    description:
      "Plan, create, publish, and grow with XCR8, an AI creator workspace built for creators and marketing teams.",
    url: "https://www.xcr8.tech/welcome",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: "XCR8 | AI Creator Workspace",
    description:
      "Plan, create, publish, and grow with XCR8 from one creator workspace.",
  },
};

const organizationSchema = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "XCR8",
  url: "https://www.xcr8.tech",
  description:
    "XCR8 is an AI creator workspace for planning content, creating visuals, publishing across social platforms, and tracking performance.",
};

const websiteSchema = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: "XCR8",
  url: "https://www.xcr8.tech",
  description:
    "AI creator workspace for planning, creating, publishing, and tracking social content.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  interactiveWidget: "resizes-content",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationSchema) }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteSchema) }}
        />
        <script
          dangerouslySetInnerHTML={{
            __html: `(() => {
  try {
    const raw = localStorage.getItem('xcr8-theme');
    const theme = raw === 'dark' || raw === 'light' || raw === 'system' ? raw : 'system';
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const resolved = theme === 'system' ? (prefersDark ? 'dark' : 'light') : theme;
    document.documentElement.classList.toggle('dark', resolved === 'dark');
  } catch (_) {}
})();`,
          }}
        />
      </head>
      <body className={`${dmSans.variable} ${poppins.variable} ${dmSans.className}`}>
        <Providers>
          <div className="flex min-h-screen flex-col">
            <div className="flex-1">{children}</div>
            <footer className="border-t border-slate-200 bg-white/80 py-5 backdrop-blur-sm dark:border-slate-800 dark:bg-slate-950/70">
              <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-5 px-6 text-xs text-slate-600 dark:text-slate-400">
                <Link href="/terms" className="transition hover:text-slate-900 dark:hover:text-slate-200">
                  Terms of Service
                </Link>
                <Link href="/privacy" className="transition hover:text-slate-900 dark:hover:text-slate-200">
                  Privacy Policy
                </Link>
              </div>
            </footer>
          </div>
        </Providers>
      </body>
    </html>
  );
}
