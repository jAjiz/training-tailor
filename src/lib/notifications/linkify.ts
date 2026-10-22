export type Segment = { text: string } | { href: string; text: string };

const URL_RE = /https:\/\/[^\s<>"]+/g;
const TRAILING = /[.,;:!?)\]}'"]+$/;

/** Splits plain text into text and https link segments. Anything else stays text. */
export function linkify(body: string): Segment[] {
  const segments: Segment[] = [];
  let last = 0;
  for (const match of body.matchAll(URL_RE)) {
    const start = match.index;
    const url = match[0].replace(TRAILING, "");
    if (url === "https://") continue;
    if (start > last) segments.push({ text: body.slice(last, start) });
    segments.push({ href: url, text: url });
    last = start + url.length;
  }
  if (last < body.length) segments.push({ text: body.slice(last) });
  return segments;
}
