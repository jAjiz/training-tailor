"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import { Field } from "@/components/ui/Field";
import { Pill } from "@/components/ui/Pill";
import { Segmented } from "@/components/ui/Segmented";
import { Input, Select } from "@/components/ui/controls";
import type { ErrorCode } from "@/lib/training/errors";
import { formatPrice } from "@/lib/training/payments";
import { createDiscountAction, deactivateDiscountAction } from "./actions";

export type DiscountRow = {
  promotionCodeId: string;
  code: string;
  percentOff: number | null;
  amountOff: number | null;
  currency: string | null;
  duration: string;
  durationInMonths: number | null;
  productIds: string[];
  timesRedeemed: number;
  maxRedemptions: number | null;
  /** ISO timestamp. */
  expiresAt: string | null;
  active: boolean;
};

export type PaidProgram = { id: string; name: string };

type Props = {
  /** `null` when Stripe could not be read. */
  discounts: DiscountRow[] | null;
  /** Paid programs the codes can be limited to. */
  programs: PaidProgram[];
  /** Stripe product id to program name, for every program of the coach (a code can name an archived one). */
  productNames: Record<string, string>;
  /** The account's currency; null until Stripe reports it (fixed amounts need it). */
  currency: string | null;
};

type Status = "idle" | "saving" | "created" | ErrorCode;

/** Typed number (comma or dot); NaN when not a number, so the schema refuses it. */
const toNumber = (text: string) => (text.trim() === "" ? NaN : Number(text.trim().replace(",", ".")));

function CreateForm({ programs, currency }: Pick<Props, "programs" | "currency">) {
  const t = useTranslations("coach.payments.discounts");
  const tAll = useTranslations();
  const router = useRouter();
  const [code, setCode] = useState("");
  const [kind, setKind] = useState<"percent" | "amount">("percent");
  const [value, setValue] = useState("");
  const [duration, setDuration] = useState<"once" | "repeating" | "forever">("once");
  const [months, setMonths] = useState("3");
  const [selected, setSelected] = useState<string[]>([]);
  const [maxRedemptions, setMaxRedemptions] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [status, setStatus] = useState<Status>("idle");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("saving");
    const number = toNumber(value);
    const r = await createDiscountAction({
      code,
      percentOff: kind === "percent" ? number : null,
      amount: kind === "amount" ? number : null,
      duration,
      durationInMonths: duration === "repeating" ? toNumber(months) : null,
      programIds: selected,
      maxRedemptions: maxRedemptions.trim() === "" ? null : toNumber(maxRedemptions),
      expiresAt,
    });
    if (!r.ok) return setStatus(r.code);
    setCode(""); setValue(""); setSelected([]); setMaxRedemptions(""); setExpiresAt("");
    setStatus("created");
    router.refresh();
  }

  const toggle = (id: string) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  return (
    <form onSubmit={submit} className="flex max-w-lg flex-col gap-5">
      <Field label={t("code")} hint={t("codeHint")}>
        <Input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} maxLength={20} required autoComplete="off" />
      </Field>
      <Field label={t("kind")} group>
        <Segmented label={t("kind")} value={kind} onChange={setKind} options={[
          { value: "percent", label: t("percent") },
          { value: "amount", label: t("amount"), disabled: !currency },
        ]} />
      </Field>
      <Field label={kind === "percent" ? t("percentValue") : t("amountValue", { currency: (currency ?? "").toUpperCase() })}>
        <Input value={value} onChange={(e) => setValue(e.target.value)} inputMode="decimal" required />
      </Field>
      <Field label={t("duration")} hint={t("durationHint")}>
        <Select value={duration} onChange={(e) => setDuration(e.target.value as typeof duration)}>
          <option value="once">{t("once")}</option>
          <option value="repeating">{t("repeating")}</option>
          <option value="forever">{t("forever")}</option>
        </Select>
      </Field>
      {duration === "repeating" && (
        <Field label={t("months")}>
          <Input value={months} onChange={(e) => setMonths(e.target.value)} inputMode="numeric" required />
        </Field>
      )}
      <Field label={t("programs")} hint={programs.length ? t("programsHint") : t("noPaidPrograms")} group>
        <div className="flex flex-col gap-2">
          {programs.map((p) => (
            <label key={p.id} className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={selected.includes(p.id)} onChange={() => toggle(p.id)} />
              {p.name}
            </label>
          ))}
        </div>
      </Field>
      <Field label={t("maxRedemptions")}>
        <Input value={maxRedemptions} onChange={(e) => setMaxRedemptions(e.target.value)} inputMode="numeric" />
      </Field>
      <Field label={t("expiresAt")}>
        <Input type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
      </Field>
      <Button type="submit" variant="primary" className="justify-self-start" disabled={status === "saving"}>
        {status === "saving" ? t("creating") : t("create")}
      </Button>
      {status === "created" && <p role="status" className="text-sm text-muted">{t("created")}</p>}
      {status !== "idle" && status !== "saving" && status !== "created" && (
        <p role="alert" className="text-sm text-danger">{tAll(`errors.${status}`)}</p>
      )}
    </form>
  );
}

function DiscountTable({ discounts, productNames }: { discounts: DiscountRow[]; productNames: Record<string, string> }) {
  const t = useTranslations("coach.payments.discounts");
  const tAll = useTranslations();
  const locale = useLocale();
  const router = useRouter();
  const { confirm, dialog } = useConfirm();
  const [error, setError] = useState<ErrorCode | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const amount = (d: DiscountRow) =>
    d.percentOff !== null ? `${d.percentOff}%` : formatPrice(d.amountOff ?? 0, d.currency ?? "eur", locale, false);
  const durationLabel = (d: DiscountRow) =>
    d.duration === "repeating" ? t("durationRepeating", { months: d.durationInMonths ?? 0 })
      : d.duration === "forever" ? t("durationForever") : t("durationOnce");
  const programNames = (d: DiscountRow) =>
    d.productIds.length ? d.productIds.map((id) => productNames[id] ?? id).join(", ") : t("allPrograms");
  // UTC so the server render and the browser agree on the day.
  const date = (iso: string) => new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeZone: "UTC" }).format(new Date(iso));

  async function deactivate(d: DiscountRow) {
    if (!(await confirm({ title: t("deactivateTitle", { code: d.code }), message: t("deactivateConfirm"), confirmLabel: t("deactivate") }))) return;
    setBusy(d.promotionCodeId);
    setError(null);
    const r = await deactivateDiscountAction(d.promotionCodeId);
    setBusy(null);
    if (r.ok) router.refresh();
    else setError(r.code);
  }

  if (discounts.length === 0) return <p className="text-sm text-muted">{t("empty")}</p>;
  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="text-muted">
            <tr>
              {(["Code", "Discount", "Duration", "Programs", "Redemptions", "Expiry", "Active"] as const).map((c) => (
                <th key={c} scope="col" className="px-3 py-2 font-medium">{t(`column${c}`)}</th>
              ))}
              <td />
            </tr>
          </thead>
          <tbody>
            {discounts.map((d) => (
              <tr key={d.promotionCodeId} className="border-t border-border">
                <th scope="row" className="px-3 py-2 font-mono font-medium">{d.code}</th>
                <td className="px-3 py-2">{amount(d)}</td>
                <td className="px-3 py-2">{durationLabel(d)}</td>
                <td className="px-3 py-2">{programNames(d)}</td>
                <td className="px-3 py-2">{d.maxRedemptions ? `${d.timesRedeemed} / ${d.maxRedemptions}` : d.timesRedeemed}</td>
                <td className="px-3 py-2">{d.expiresAt ? date(d.expiresAt) : t("noExpiry")}</td>
                <td className="px-3 py-2"><Pill tone={d.active ? "success" : "neutral"}>{d.active ? t("yes") : t("no")}</Pill></td>
                <td className="px-3 py-2 text-right">
                  {d.active && (
                    <Button variant="danger" size="sm" disabled={busy === d.promotionCodeId} onClick={() => deactivate(d)}>
                      {t("deactivate")}
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {error && <p role="alert" className="text-sm text-danger">{tAll(`errors.${error}`)}</p>}
      {dialog}
    </div>
  );
}

export function DiscountCodes({ discounts, programs, productNames, currency }: Props) {
  const t = useTranslations("coach.payments.discounts");
  return (
    <Card className="flex flex-col gap-6 p-6">
      <div className="flex flex-col gap-2">
        <h2 className="text-xl">{t("title")}</h2>
        <p className="max-w-prose text-muted">{t("intro")}</p>
      </div>
      <CreateForm programs={programs} currency={currency} />
      {discounts === null
        ? <p role="alert" className="text-sm text-danger">{t("unavailable")}</p>
        : <DiscountTable discounts={discounts} productNames={productNames} />}
    </Card>
  );
}
