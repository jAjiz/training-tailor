import Link from "next/link";
import { getSessionUser } from "@/lib/session";

const SECTIONS = [
  { href: "/tailor", title: "Tailor a workout", text: "Paste today's session and say how you are." },
  { href: "/profile", title: "Profile", text: "Injuries, equipment, benchmarks, goals." },
];

export default async function Home() {
  const user = await getSessionUser();
  if (!user) {
    return (
      <section className="flex flex-col gap-4 py-10">
        <h1 className="text-2xl font-semibold">Your programming, tailored to today</h1>
        <p className="text-neutral-700">
          Pain, little time, missing equipment or missed days: keep the stimulus of the workout and stay safe.
        </p>
        <Link href="/signin" className="w-fit rounded bg-black px-4 py-2 text-white">Sign in</Link>
      </section>
    );
  }
  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">Hi {user.name.split(" ")[0]}</h1>
      <div className="grid gap-3 sm:grid-cols-3">
        {SECTIONS.map((s) => (
          <Link key={s.href} href={s.href} className="rounded border p-4">
            <div className="font-medium">{s.title}</div>
            <div className="text-sm text-neutral-600">{s.text}</div>
          </Link>
        ))}
      </div>
    </section>
  );
}
