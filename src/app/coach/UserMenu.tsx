"use client";

import { useTranslations } from "next-intl";
import { useSignOut } from "@/components/SignOutButton";
import { Avatar } from "@/components/ui/Avatar";
import { Menu } from "@/components/ui/Menu";

export function UserMenu({ name, image }: { name: string; image: string | null }) {
  const t = useTranslations();
  const signOut = useSignOut("/coach/signin");
  return (
    <Menu label={`${t("nav.account")}: ${name}`} icon={<Avatar name={name} image={image} />}
      items={[{ label: t("auth.signOut"), onSelect: () => void signOut() }]} />
  );
}
