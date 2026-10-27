import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Card } from "@/components/ui/Card";
import { requireAdminPage } from "@/lib/accounts";
import { LIBRARY_DOCUMENTS, type LibraryDocument } from "@/lib/domain/library";
import { JsonEntryEditor } from "../../JsonEntryEditor";
import { LibraryFrame } from "../../LibraryFrame";
import { loadLibraryView } from "../../view";

const isDocument = (value: string): value is LibraryDocument => (LIBRARY_DOCUMENTS as readonly string[]).includes(value);

export default async function AdminLibraryDocumentPage({ params }: { params: Promise<{ document: string }> }) {
  await requireAdminPage();
  const { document } = await params;
  if (!isDocument(document)) notFound();
  const [{ library, draft }, t] = await Promise.all([loadLibraryView(), getTranslations("admin.library")]);
  const json = JSON.stringify(library[document], null, 2);
  return (
    <LibraryFrame title={t(`tabs.${document}`)} revision={draft?.revision ?? null}>
      <Card className="p-4">
        {draft
          ? <JsonEntryEditor key={`${draft.revision}`} target={{ type: "document", id: document }} initial={json} />
          : <pre className="overflow-x-auto font-mono text-xs">{json}</pre>}
      </Card>
    </LibraryFrame>
  );
}
