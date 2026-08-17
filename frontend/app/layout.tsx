import type { Metadata } from "next";
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
  title: "Xcr8",
  description: "Xcr8 is an AI-powered creator distribution platform.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover"
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
