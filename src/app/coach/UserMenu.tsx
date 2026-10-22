"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useSignOut } from "@/components/SignOutButton";
import { Avatar } from "@/components/ui/Avatar";
import { Menu } from "@/components/ui/Menu";

export function UserMenu({ name, image, signOutTo = "/coach/signin", notifications = false }: {
  name: string; image: string | null; signOutTo?: string;
  /** Adds the link to the coach notification settings (not for the admin zone). */
  notifications?: boolean;
}) {
  const t = useTranslations();
  const signOut = useSignOut(signOutTo);
  const router = useRouter();
  return (
    <Menu label={`${t("nav.account")}: ${name}`} icon={<Avatar name={name} image={image} />}
      items={[
        ...(notifications ? [{ label: t("nav.notifications"), onSelect: () => router.push("/coach/settings/notifications") }] : []),
        { label: t("auth.signOut"), onSelect: () => void signOut() },
      ]} />
  );
}
