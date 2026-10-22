import { linkify } from "@/lib/notifications/linkify";

/** Plain announcement text: line breaks kept, `https://` URLs as links, everything else literal (no HTML is ever injected). */
export function AnnouncementText({ body }: { body: string }) {
  return (
    <p className="whitespace-pre-wrap break-words">
      {linkify(body).map((seg, i) =>
        "href" in seg ? (
          <a key={i} href={seg.href} target="_blank" rel="noopener noreferrer" className="underline">{seg.text}</a>
        ) : (
          <span key={i}>{seg.text}</span>
        ))}
    </p>
  );
}
