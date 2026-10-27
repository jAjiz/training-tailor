import { getTranslations } from "next-intl/server";
import { PageHeader } from "../ui";
import { DraftRevision } from "./JsonEntryEditor";
import { OpenDraftButton } from "./LibraryActions";
import { LibraryTabs } from "./LibraryTabs";

/** Header and tabs of an entry page; without a draft it says the page is read-only and offers to open one. */
export async function LibraryFrame({ title, revision, children }: { title: string; revision: number | null; children: React.ReactNode }) {
  const t = await getTranslations("admin.library");
  return (
    <section className="flex flex-col gap-6">
      <PageHeader title={title} back={{ href: "/admin/library", label: t("back") }} />
      <LibraryTabs />
      {revision === null && (
        <div role="status" className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-surface-2 p-4 text-sm">
          <p>{t("readOnly")}</p>
          <OpenDraftButton />
        </div>
      )}
      <DraftRevision revision={revision}>{children}</DraftRevision>
    </section>
  );
}
