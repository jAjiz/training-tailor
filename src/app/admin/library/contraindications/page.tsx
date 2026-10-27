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

const TEMPLATE = JSON.stringify({ key: "", label: "", kind: "", rules: [], positionRules: [] }, null, 2);

export default async function AdminLibraryContraindicationsPage({ searchParams }: Props) {
  await requireAdminPage();
  const q = parseQuery(await searchParams);
  const [{ library, draft }, t, tc] = await Promise.all([loadLibraryView(), getTranslations("admin.library"), getTranslations("admin.common")]);
  const key = q ? normalizeMovementName(q) : "";
  const entries = key
    ? library.contraindications.filter((c) => [c.key, c.label].some((n) => normalizeMovementName(n).includes(key)))
    : library.contraindications;
  return (
    <LibraryFrame title={t("contraindicationsTitle")} revision={draft?.revision ?? null}>
      <form role="search" className="flex gap-2">
        <Input compact type="search" name="q" defaultValue={q} placeholder={t("searchContraindications")} aria-label={t("searchContraindications")} maxLength={100} className="w-64" />
        <Button type="submit" size="sm">{tc("search")}</Button>
      </form>
      {draft && <NewEntry type="contraindication" template={TEMPLATE} />}
      <p className="text-sm text-muted">{t("count", { count: entries.length })}</p>
      {entries.length === 0 ? <EmptyState>{t("noEntries")}</EmptyState> : (
        <ul className="flex flex-col gap-3">
          {entries.map((c) => (
            <EntryRow key={c.key} type="contraindication" id={c.key} title={c.label} detail={`${c.key} · ${c.kind}`}
              json={JSON.stringify(c, null, 2)} />
          ))}
        </ul>
      )}
    </LibraryFrame>
  );
}
