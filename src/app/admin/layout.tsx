import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Brand } from "@/components/Brand";
import { isAdminSession } from "@/lib/admin-access";
import { getSessionContext } from "@/lib/session";
import { UserMenu } from "../coach/UserMenu";
import { AdminNavLinks } from "./AdminNavLinks";

/** Desktop-first, like the coach zone. Navigation only for a real admin session; pages check access themselves. */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getSessionContext();
  const admin = isAdminSession(ctx) ? ctx?.user ?? null : null;
  const t = await getTranslations("admin");
  return (
    <>
      <header className="sticky top-0 z-30 border-b bg-surface">
        <div className="flex h-16 items-center gap-8 px-6 lg:px-8">
          <Link href="/admin" className="flex items-center gap-2 rounded-lg focus-visible:outline-2 focus-visible:outline-foreground">
            <Brand />
            <span className="rounded-md border px-1.5 py-0.5 text-xs font-semibold text-muted">{t("badge")}</span>
          </Link>
          {admin && <AdminNavLinks />}
          {admin && <div className="ml-auto"><UserMenu name={admin.name} image={admin.image} signOutTo="/admin/signin" /></div>}
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-8 lg:px-8">{children}</main>
    </>
  );
}
