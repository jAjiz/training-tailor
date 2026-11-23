"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/Button";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import { Input } from "@/components/ui/controls";
import { Field } from "@/components/ui/Field";
import { Segmented } from "@/components/ui/Segmented";
import type { ErrorCode } from "@/lib/training/errors";
import { setProgramPriceAction } from "../../../program-actions";

type Props = {
  programId: string;
  kind: "continuous" | "closed";
  /** Minor units; null = free. */
  priceAmount: number | null;
  /** Stored currency, else the account's; null while the account cannot charge. */
  currency: string | null;
  canCharge: boolean;
  liveSubscriptions: number;
  archived: boolean;
};

const toMajor = (minor: number) => String(minor / 100);

export function PriceSection({ programId, kind, priceAmount, currency, canCharge, liveSubscriptions, archived }: Props) {
  const t = useTranslations();
  const router = useRouter();
  const { confirm, dialog } = useConfirm();
  const isPaid = priceAmount !== null;
  const [paid, setPaid] = useState(isPaid);
  const [amount, setAmount] = useState(priceAmount === null ? "" : toMajor(priceAmount));
  const [state, setState] = useState<"idle" | "saving" | "saved" | ErrorCode>("idle");

  // A paid program's amount cannot change yet, so only the switch to free is offered; free → paid needs charges.
  const disabled = archived || state === "saving" || (!canCharge && !isPaid);
  const dirty = paid !== isPaid;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (isPaid && !paid && !(await confirm({
      title: t("programs.price.freeConfirmTitle"),
      message: t("programs.price.freeConfirm", { count: liveSubscriptions }),
      confirmLabel: t("programs.price.freeConfirmLabel"),
    }))) return;
    setState("saving");
    const r = await setProgramPriceAction({ programId, paid, amount: paid ? amount : null });
    setState(r.ok ? "saved" : r.code);
    router.refresh();
  }

  return (
    <form onSubmit={save} className="flex flex-col gap-4 border-t pt-6">
      <h2 className="text-[15px] font-semibold">{t("programs.price.title")}</h2>
      <Segmented label={t("programs.price.title")} value={paid ? "paid" : "free"} className="max-w-xs"
        onChange={(v) => setPaid(v === "paid")}
        options={[
          { value: "free", label: t("programs.price.free"), disabled },
          { value: "paid", label: t("programs.price.paid"), disabled },
        ]} />
      {!canCharge && !isPaid && (
        <p className="text-sm text-muted">
          {t("programs.price.notReady")}{" "}
          <Link href="/coach/payments" className="underline">{t("programs.price.goToPayments")}</Link>
        </p>
      )}
      {paid && (
        <div className="grid max-w-md gap-4 sm:grid-cols-2">
          <Field label={t("programs.price.amount")}
            hint={isPaid ? t("programs.price.locked") : kind === "continuous" ? t("programs.price.perMonth") : t("programs.price.oneTime")}>
            <Input inputMode="decimal" required value={amount} disabled={disabled || isPaid}
              onChange={(e) => setAmount(e.target.value)} />
          </Field>
          <Field label={t("programs.price.currency")}>
            <Input readOnly value={(currency ?? "").toUpperCase()} />
          </Field>
        </div>
      )}
      <Button type="submit" variant="primary" className="justify-self-start" disabled={disabled || !dirty}>
        {t("programs.price.save")}
      </Button>
      {/* Cancellations Stripe refused are shown, with a retry, at the top of the settings page. */}
      {state === "saved" && <p role="status" className="text-sm text-success">{t("me.saved")}</p>}
      {state !== "idle" && state !== "saving" && state !== "saved" && <p role="alert" className="text-sm text-danger">{t(`errors.${state}`)}</p>}
      {dialog}
    </form>
  );
}
