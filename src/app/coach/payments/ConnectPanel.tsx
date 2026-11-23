"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { loadConnectAndInitialize, type StripeConnectInstance } from "@stripe/connect-js";
import {
  ConnectAccountOnboarding, ConnectComponentsProvider, ConnectNotificationBanner, ConnectPayments, ConnectPayouts,
} from "@stripe/react-connect-js";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Select } from "@/components/ui/controls";
import type { ErrorCode } from "@/lib/training/errors";
import { accountSessionAction, connectStripeAction, syncStripeAccountAction } from "./actions";

/** The app's theme tokens (globals.css) as Stripe's appearance variables; the tokens already switch with the OS theme. */
function appearance() {
  const root = getComputedStyle(document.documentElement);
  const token = (name: string) => root.getPropertyValue(name).trim();
  return {
    variables: {
      colorPrimary: token("--primary"),
      colorBackground: token("--surface"),
      colorText: token("--foreground"),
      fontFamily: getComputedStyle(document.body).fontFamily,
      borderRadius: "12px",
    },
  };
}

async function fetchClientSecret(): Promise<string> {
  const r = await accountSessionAction();
  if (!r.ok) throw new Error(r.code);
  return r.value;
}

function ConnectForm({ countries, defaultCountry }: { countries: { code: string; name: string }[]; defaultCountry: string }) {
  const t = useTranslations();
  const router = useRouter();
  const [country, setCountry] = useState(defaultCountry);
  const [state, setState] = useState<"idle" | "saving" | ErrorCode>("idle");

  async function connect(e: React.FormEvent) {
    e.preventDefault();
    setState("saving");
    const r = await connectStripeAction(country);
    if (r.ok) router.refresh();
    else setState(r.code);
  }

  return (
    <form onSubmit={connect} className="flex max-w-sm flex-col gap-5">
      <Field label={t("coach.payments.country")} hint={t("coach.payments.countryHint")}>
        <Select value={country} onChange={(e) => setCountry(e.target.value)}>
          {countries.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
        </Select>
      </Field>
      <Button type="submit" variant="primary" className="justify-self-start" disabled={state === "saving"}>
        {state === "saving" ? t("coach.payments.connecting") : t("coach.payments.connect")}
      </Button>
      {state !== "idle" && state !== "saving" && <p role="alert" className="text-sm text-danger">{t(`errors.${state}`)}</p>}
    </form>
  );
}

let connect: StripeConnectInstance | null = null;

/** One instance per page load, created in the browser only (the server snapshot is null, so hydration matches). */
function connectInstance(): StripeConnectInstance {
  connect ??= loadConnectAndInitialize({
    publishableKey: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY as string,
    fetchClientSecret,
    appearance: appearance(),
  });
  return connect;
}

const subscribeNothing = () => () => {};

function Embedded({ stage }: { stage: "onboarding" | "ready" }) {
  const router = useRouter();
  const instance = useSyncExternalStore(subscribeNothing, connectInstance, () => null);

  useEffect(() => {
    // The tokens change with the OS theme; so does the embedded UI.
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const restyle = () => instance?.update({ appearance: appearance() });
    media.addEventListener("change", restyle);
    return () => media.removeEventListener("change", restyle);
  }, [instance]);

  async function onExit() {
    await syncStripeAccountAction();
    router.refresh();
  }

  if (!instance) return null;
  return (
    <ConnectComponentsProvider connectInstance={instance}>
      {stage === "onboarding" ? (
        <ConnectAccountOnboarding onExit={onExit} />
      ) : (
        <div className="flex flex-col gap-8">
          <ConnectNotificationBanner />
          <ConnectPayments />
          <ConnectPayouts />
        </div>
      )}
    </ConnectComponentsProvider>
  );
}

type Props =
  | { stage: "connect"; countries: { code: string; name: string }[]; defaultCountry: string }
  | { stage: "onboarding" | "ready" };

export function ConnectPanel(props: Props) {
  return props.stage === "connect"
    ? <ConnectForm countries={props.countries} defaultCountry={props.defaultCountry} />
    : <Embedded stage={props.stage} />;
}
