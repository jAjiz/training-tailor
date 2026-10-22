export type InstallPlatform = "ios-safari" | "ios-other" | "android" | "in-app" | "other";

export function installPlatform(userAgent: string): InstallPlatform {
  if (/Instagram|FBAN|FBAV|WhatsApp/i.test(userAgent)) return "in-app";
  if (/iPhone|iPad|iPod/.test(userAgent)) return /CriOS|FxiOS|EdgiOS/.test(userAgent) ? "ios-other" : "ios-safari";
  if (/Android/.test(userAgent)) return "android";
  return "other";
}

const UNGATED = [/^\/signin(\/|$)/, /^\/onboarding(\/|$)/, /^\/join\//, /^\/disabled(\/|$)/];

/** Whether the athlete zone shows the "Install the app" page instead of its content. */
export function shouldGate(o: { enabled: boolean; phone: boolean; standalone: boolean; pathname: string }): boolean {
  if (!o.enabled || !o.phone || o.standalone) return false;
  return !UNGATED.some((re) => re.test(o.pathname));
}
