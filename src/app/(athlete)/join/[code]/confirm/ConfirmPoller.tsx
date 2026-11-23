"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { enrollmentAccessAction } from "../../../actions";

const POLL_MS = 2_000;
const TIMEOUT_MS = 30_000; // our call: after this the webhook is late, and the program will appear on its own

/** Polls the enrollment's access until the webhook unblocks it, then opens the program. */
export function ConfirmPoller({ programId }: { programId: string }) {
  const t = useTranslations("join");
  const router = useRouter();
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    let stopped = false;
    const started = Date.now();
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      const r = await enrollmentAccessAction(programId).catch(() => null); // a dropped request just tries again
      if (stopped) return;
      if (r?.ok && r.value.access !== null && r.value.access !== "blocked") {
        router.replace(`/?program=${programId}`);
        return;
      }
      if (Date.now() - started >= TIMEOUT_MS) setTimedOut(true);
      else timer = setTimeout(poll, POLL_MS);
    }
    void poll();
    return () => { stopped = true; clearTimeout(timer); };
  }, [programId, router]);

  return (
    <section className="flex min-h-[70vh] flex-col justify-center">
      <Card className="flex flex-col items-center gap-4 px-6 py-10 text-center">
        {timedOut ? (
          <>
            <p role="status" className="text-[15px] leading-relaxed">{t("processing")}</p>
            <Button href="/" variant="primary" block slanted>{t("toPrograms")}</Button>
          </>
        ) : (
          <>
            <Loader2 size={28} aria-hidden className="animate-spin text-muted" />
            <p role="status" className="text-lg">{t("confirming")}</p>
          </>
        )}
      </Card>
    </section>
  );
}
