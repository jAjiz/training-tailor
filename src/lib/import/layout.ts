/** One run of text from a PDF page, in PDF units: `y` grows upwards, `h` is the font height. */
export type TextItem = { str: string; x: number; y: number; h: number };

/** A block cut from a calendar PDF: its day (0 = Monday) is known, its text is still the raw lines. */
export type SourceBlock = { day: number; title: string; text: string };

const WEEKDAYS = [
  /^(lunes|lundi|monday)$/i, /^(martes|mardi|tuesday)$/i, /^(mi[eé]rcoles|mercredi|wednesday)$/i,
  /^(jueves|jeudi|thursday)$/i, /^(viernes|vendredi|friday)$/i, /^(s[aá]bado|samedi|saturday)$/i,
  /^(domingo|dimanche|sunday)$/i,
];
const MIN_HEADERS = 5;
const SAME_LINE = 2; // y distance under which two runs are on one line
const HEADING_JOIN = 14; // y distance under which two heading lines are one wrapped heading

function weekdayOf(str: string): number {
  return WEEKDAYS.findIndex((r) => r.test(str.trim()));
}

function mostCommonHeight(pages: TextItem[][]): number {
  const counts = new Map<number, number>();
  for (const item of pages.flat()) {
    const h = Math.round(item.h * 10) / 10;
    counts.set(h, (counts.get(h) ?? 0) + 1);
  }
  return [...counts].sort((a, b) => b[1] - a[1])[0][0];
}

type Line = { y: number; text: string; heading: boolean };

function linesOf(items: TextItem[], body: number): Line[] {
  const rows: TextItem[][] = [];
  for (const item of [...items].sort((a, b) => b.y - a.y)) {
    const row = rows[rows.length - 1];
    if (row && Math.abs(row[0].y - item.y) < SAME_LINE) row.push(item);
    else rows.push([item]);
  }
  const lines: Line[] = rows.map((row) => {
    const runs = row.sort((a, b) => a.x - b.x);
    return {
      y: runs[0].y,
      text: runs.reduce((text, r) => (text === "" || text.endsWith(" ") ? text + r.str : `${text} ${r.str}`), ""),
      heading: runs.some((r) => r.h > body + 0.5),
    };
  });
  const joined: Line[] = [];
  for (const line of lines) {
    const prev = joined[joined.length - 1];
    if (line.heading && prev?.heading && prev.y - line.y < HEADING_JOIN) {
      prev.text = `${prev.text} ${line.text.trim()}`;
      prev.y = line.y;
    } else joined.push({ ...line, text: line.text.trim() });
  }
  return joined;
}

/**
 * Reads a calendar laid out as one column per weekday: page 1 has a row of weekday
 * headers, and later pages continue the same columns without them. Text goes to the column it sits in;
 * a line in a larger font than the body starts a block, and text before a day's first heading on a later
 * page continues that day's previous block. A heading with no text under it (a day title or the week's
 * objectives) is still a block, with empty text; the page title above the weekday row is dropped. A gap
 * between two lines of more than twice the body size is a blank line. Returns null when the PDF is not
 * such a calendar.
 */
export function calendarBlocks(pages: TextItem[][]): SourceBlock[] | null {
  const items = pages.map((page) => page.filter((i) => i.str.trim()));
  if (items.length === 0 || items.flat().length === 0) return null;
  const headers = items[0].filter((i) => weekdayOf(i.str) >= 0);
  if (headers.length < MIN_HEADERS) return null;
  const rowY = Math.max(...headers.map((h) => h.y));
  const anchors = headers.filter((h) => Math.abs(h.y - rowY) < SAME_LINE).sort((a, b) => a.x - b.x);
  if (anchors.length < MIN_HEADERS) return null;

  const dayOf = (x: number) => {
    let day = weekdayOf(anchors[0].str);
    for (const a of anchors) if (x >= a.x - 4) day = weekdayOf(a.str);
    return day;
  };
  // Page 1 keeps only what sits below the weekday row.
  const content = items.map((page, p) => (p === 0 ? page.filter((i) => i.y < rowY - SAME_LINE) : page));
  const body = mostCommonHeight(content);
  const blocks: { day: number; title: string; lines: string[] }[] = [];
  for (let day = 0; day < 7; day++) {
    let current: (typeof blocks)[number] | null = null;
    content.forEach((page) => {
      let lastY: number | null = null; // previous body line on this page, for blank lines
      const mine = page.filter((i) => dayOf(i.x) === day);
      for (const line of linesOf(mine, body)) {
        if (line.heading) {
          current = { day, title: line.text, lines: [] };
          blocks.push(current);
          lastY = null;
        } else if (current) {
          if (lastY !== null && lastY - line.y > body * 2) current.lines.push("");
          current.lines.push(line.text);
          lastY = line.y;
        }
      }
    });
  }
  return blocks.map(({ day, title, lines }) => ({ day, title, text: lines.join("\n") }));
}

/** The text runs of every page; null when the PDF cannot be read. */
export async function readPdfText(pdf: Uint8Array): Promise<TextItem[][] | null> {
  try {
    const { getDocumentProxy } = await import("unpdf");
    // pdf.js may detach the buffer it is given; the caller still needs its bytes.
    const doc = await getDocumentProxy(pdf.slice());
    const pages: TextItem[][] = [];
    for (let n = 1; n <= doc.numPages; n++) {
      const { items } = await (await doc.getPage(n)).getTextContent();
      pages.push(items.flatMap((i) => ("str" in i ? [{ str: i.str, x: i.transform[4], y: i.transform[5], h: i.height }] : [])));
    }
    return pages;
  } catch {
    return null;
  }
}
