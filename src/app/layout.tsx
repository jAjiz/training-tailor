import type { Metadata, Viewport } from "next";
import { Saira } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getLocale } from "next-intl/server";
import "./globals.css";

const saira = Saira({
  subsets: ["latin"], // Only preloads: other subsets, such as latin-ext, still load on demand.
  variable: "--font-saira",
  style: ["normal", "italic"],
  axes: ["wdth"],
});

export const metadata: Metadata = {
  title: "Training Tailor",
  description: "Follow your coach's programming, log your results and compare them.",
};

export const viewport: Viewport = {
  // cover lets the athlete tab bar pad itself with env(safe-area-inset-bottom).
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#eef2f7" },
    { media: "(prefers-color-scheme: dark)", color: "#0b1220" },
  ],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  return (
    <html lang={locale} className={saira.variable}>
      <body className="min-h-screen bg-background font-sans text-foreground antialiased">
        <NextIntlClientProvider>{children}</NextIntlClientProvider>
      </body>
    </html>
  );
}
