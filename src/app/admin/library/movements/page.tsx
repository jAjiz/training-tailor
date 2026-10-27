import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input } from "@/components/ui/controls";
import { requireAdminPage } from "@/lib/accounts";
import { normalizeMovementName } from "@/lib/domain/resolve";
import { LibraryFrame } from "../LibraryFrame";
import { EntryRow, NewEntry } from "../JsonEntryEditor";
import { loadLibraryView } from "../view";
import { parseQuery } from "../query";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

const TEMPLATE = JSON.stringify({
  name: "", patterns: [], positions: [], stresses: [], equipment: [], skill: "", substitutes: [], aliases: [], unilateral: null,
}, null, 2);

export default async function AdminLibraryMovementsPage({ searchParams }: Props) {
  await requireAdminPage();
  const q = parseQuery(await searchParams);
  const [{ library, draft }, t, tc] = await Promise.all([loadLibraryView(), getTranslations("admin.library"), getTranslations("admin.common")]);
  const key = q ? normalizeMovementName(q) : "";
  const movements = key
    ? library.movements.filter((m) => [m.name, ...m.aliases].some((n) => normalizeMovementName(n).includes(key)))
    : library.movements;
  return (
    <LibraryFrame title={t("movementsTitle")} revision={draft?.revision ?? null}>
      <form role="search" className="flex gap-2">
        <Input compact type="search" name="q" defaultValue={q} placeholder={t("searchMovements")} aria-label={t("searchMovements")} maxLength={100} className="w-64" />
        <Button type="submit" size="sm">{tc("search")}</Button>
      </form>
      {draft && <NewEntry type="movement" template={TEMPLATE} />}
      <p className="text-sm text-muted">{t("count", { count: movements.length })}</p>
      {movements.length === 0 ? <EmptyState>{t("noEntries")}</EmptyState> : (
        <ul className="flex flex-col gap-3">
          {movements.map((m) => (
            <EntryRow key={m.name} type="movement" id={m.name} title={m.name}
              detail={[m.patterns.join(", "), m.aliases.length > 0 && `${t("aliases")}: ${m.aliases.join(", ")}`].filter(Boolean).join(" · ")}
              json={JSON.stringify(m, null, 2)} />
          ))}
        </ul>
      )}
    </LibraryFrame>
  );
}
