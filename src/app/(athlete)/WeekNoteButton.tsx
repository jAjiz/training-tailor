"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Info } from "lucide-react";
import { AnnouncementText } from "@/components/notifications/AnnouncementText";
import { Modal } from "@/components/ui/Modal";

/** Header pill that opens the coach's note for the program week being viewed. */
export function WeekNoteButton({ note, title }: { note: string; title: string }) {
  const t = useTranslations();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}
        className="inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-sm font-medium hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-on-chrome">
        <Info size={18} aria-hidden />
        {t("today.week")}
      </button>
      {open && (
        <Modal title={title} closeLabel={t("common.close")} onClose={() => setOpen(false)} size="md" placement="bottom">
          <AnnouncementText body={note} />
        </Modal>
      )}
    </>
  );
}
