import type { Metadata } from "next";
import { DM_Sans, Playfair_Display } from "next/font/google";
import { Providers } from "@/components/providers";
import "./globals.css";

const dmSans = DM_Sans({ subsets: ["latin"], variable: "--font-body" });
const playfair = Playfair_Display({ subsets: ["latin"], variable: "--font-display" });

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
      <body className={`${dmSans.variable} ${playfair.variable} ${dmSans.className}`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
