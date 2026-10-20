"use client";

import { useTranslations } from "next-intl";
import { usePathname } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/Button";
import { installPlatform, shouldGate, type InstallPlatform } from "@/lib/notifications/install";

type InstallPromptEvent = Event & { prompt: () => Promise<void> };
type Env = { phone: boolean; standalone: boolean; platform: InstallPlatform };

// Browser facts are read only on the client; the server (and hydration) snapshot is "" so children render first.
const noSubscribe = () => () => {};
function readEnv(): string {
  const phone = window.matchMedia("(pointer: coarse)").matches && Math.min(screen.width, screen.height) < 600;
  const standalone =
    window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return [phone, standalone, installPlatform(navigator.userAgent)].join("|");
}
function parseEnv(raw: string): Env | null {
  if (!raw) return null;
  const [phone, standalone, platform] = raw.split("|");
  return { phone: phone === "true", standalone: standalone === "true", platform: platform as InstallPlatform };
}

/** Replaces the athlete zone with an "install the app" page on phones that have not installed it. SSR and desktops render children. */
export function InstallGate({ enabled, children }: { enabled: boolean; children: React.ReactNode }) {
  const t = useTranslations("install");
  const pathname = usePathname();
  const env = parseEnv(useSyncExternalStore(noSubscribe, readEnv, () => ""));
  const [prompt, setPrompt] = useState<InstallPromptEvent | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setPrompt(e as InstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  if (!env || !shouldGate({ enabled, phone: env.phone, standalone: env.standalone, pathname })) return <>{children}</>;

  const ios = env.platform === "ios-safari" || env.platform === "ios-other" || (env.platform === "in-app" && /iPhone|iPad|iPod/.test(navigator.userAgent));

  async function install() {
    if (!prompt) return;
    await prompt.prompt();
    setPrompt(null);
  }
  async function copyLink() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
    } catch {
      // Clipboard unavailable: the URL is shown below for manual copy.
      setCopied(false);
    }
  }

  let content: React.ReactNode;
  if (env.platform === "ios-safari") {
    content = (
      <ol className="space-y-2 text-[15px]">
        <li>{t("iosShare")}</li>
        <li>{t("iosAdd")}</li>
        <li>{t("iosOpen")}</li>
      </ol>
    );
  } else if (env.platform === "ios-other" || env.platform === "in-app") {
    content = (
      <div className="space-y-3">
        <p className="text-[15px] font-semibold">{ios ? t("openInSafari") : t("openInChrome")}</p>
        <Button block onClick={copyLink}>{t("copyLink")}</Button>
        <p role="status" className="break-all text-sm text-muted">{copied ? t("copied") : window.location.href}</p>
      </div>
    );
  } else {
    content = (
      <div className="space-y-3">
        {prompt && <Button variant="primary" block onClick={install}>{t("install")}</Button>}
        <p className="text-[15px]">{t("androidMenu")}</p>
      </div>
    );
  }

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="install-title" className="fixed inset-0 z-50 overflow-y-auto bg-background">
      <div className="mx-auto flex min-h-full max-w-md flex-col justify-center gap-5 px-6 py-10">
        <h1 id="install-title" className="text-2xl font-bold">{t("title")}</h1>
        <p className="text-muted">{t("body")}</p>
        {content}
        <p className="text-sm text-muted">{t("signInAgain")}</p>
      </div>
    </div>
  );
}
