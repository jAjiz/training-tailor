import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { SignOutButton } from "@/components/SignOutButton";
import { getSessionUser } from "@/lib/session";

export const metadata: Metadata = {
  title: "Training Tailor",
  description: "Tailor your programmed workout to today's body, time and equipment.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  return (
    <html lang="en">
      <body className="min-h-screen bg-white text-neutral-900 antialiased">
        <header className="border-b">
          <nav className="mx-auto flex max-w-3xl items-center gap-4 px-4 py-3 text-sm">
            <Link href="/" className="font-semibold">Training Tailor</Link>
            {user && (
              <>
                <Link href="/tailor">Tailor</Link>
                <Link href="/profile">Profile</Link>
                <span className="ml-auto"><SignOutButton /></span>
              </>
            )}
          </nav>
        </header>
        <main className="mx-auto max-w-3xl px-4 py-6">{children}</main>
        <footer className="mx-auto max-w-3xl px-4 py-6 text-xs text-neutral-500">
          Not medical advice. Training Tailor suggests workout modifications; it does not diagnose or treat
          injuries. When in doubt, consult a qualified professional.
        </footer>
      </body>
    </html>
  );
}
