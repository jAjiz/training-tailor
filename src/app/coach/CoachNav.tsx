import Link from "next/link";
import { Brand } from "@/components/Brand";
import { CoachNavLinks } from "./CoachNavLinks";
import { UserMenu } from "./UserMenu";

type Props = { user: { name: string; image: string | null } | null; approved: boolean };

export function CoachNav({ user, approved }: Props) {
  return (
    <header className="sticky top-0 z-30 border-b bg-surface">
      <div className="flex h-16 items-center gap-8 px-6 lg:px-8">
        <Link href="/coach" className="rounded-lg focus-visible:outline-2 focus-visible:outline-foreground"><Brand /></Link>
        {approved && <CoachNavLinks />}
        {user && <div className="ml-auto"><UserMenu name={user.name} image={user.image} /></div>}
      </div>
    </header>
  );
}
