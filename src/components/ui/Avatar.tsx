import { initials } from "@/lib/format";

/** Decorative: the name is always shown or announced next to it. */
export function Avatar({ name, image, size = 32 }: { name: string; image?: string | null; size?: number }) {
  const style = { width: size, height: size };
  if (image) {
    // eslint-disable-next-line @next/next/no-img-element -- Google profile pictures; next/image would need remotePatterns for one avatar.
    return <img src={image} alt="" referrerPolicy="no-referrer" style={style} className="shrink-0 rounded-full object-cover" />;
  }
  return (
    <span aria-hidden style={style} className="inline-flex shrink-0 items-center justify-center rounded-full bg-surface-2 text-xs font-bold text-muted">
      {initials(name)}
    </span>
  );
}
