import { safeNext } from "@/lib/routes";
import { OnboardingRunner } from "./OnboardingRunner";

export default async function OnboardingPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return <OnboardingRunner next={safeNext(next)} />;
}
