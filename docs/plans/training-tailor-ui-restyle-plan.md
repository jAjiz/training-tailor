# UI Restyle (Strivee look, light and dark) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle every existing screen so the app looks like Strivee, in light and dark following the OS, without changing behavior.

**Architecture:** Semantic CSS variables in `globals.css` (light on `:root`, dark under `prefers-color-scheme`) exposed to Tailwind 4 through `@theme inline`; block colors resolved from a `data-color` attribute. A small set of our own primitives in `src/components/ui/` (no domain state, no next-intl), then each screen rebuilt on top of them. Server actions, services, data fetching and drag and drop stay as they are.

**Tech Stack:** Next.js 16 App Router, React 19, Tailwind 4, next-intl 4, dnd-kit, `lucide-react` (new), Inter via `next/font/google`, Vitest 4 + Testing Library + jsdom (already installed).

**Spec:** `docs/specs/training-tailor-ui-restyle-design.md`

## Global Constraints

- The theme follows the operating system only (`prefers-color-scheme`): no selector, no cookie, no DB field.
- No new screens; server actions, services, queries and drag and drop logic do not change.
- New dependencies: `lucide-react` only. No shadcn, Radix, Headless UI, clsx or tailwind-merge.
- Colors come from tokens. After Task 14, `src/` contains no `neutral-*`, `bg-white`, `bg-black`, `text-white`, `text-red-*`, `text-green-*`, `text-amber-*`, `bg-amber-*` or `border-black` classes.
- `src/components/ui/*` never calls next-intl: every visible string comes in through props.
- `Button` keeps native `type` semantics: inside forms, submit buttons pass `type="submit"` and every other button passes `type="button"`.
- Every new message key goes into both `src/i18n/messages/es.json` and `en.json` (`tests/i18n/messages.test.ts` fails otherwise).
- Since there is no tailwind-merge, never pass a `className` that fights a class the primitive already sets (for example a second `text-*` size or `p-*`); add a prop or a wrapper instead.
- Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- `@swc/core` stays pinned to 1.16.2 in `pnpm-workspace.yaml` (see memory `swc-native-cache-acl`).

## File map

| Path | Responsibility |
|------|----------------|
| `src/app/globals.css` | Tokens (light and dark), block color mapping, base border color |
| `src/app/layout.tsx` | Inter font, viewport/theme color, token-based body |
| `src/components/training/colors.ts` | `blockColor()` fallback helper |
| `src/components/ui/cx.ts` | Class joiner |
| `src/components/ui/Button.tsx` | `Button`, `buttonClasses` |
| `src/components/ui/IconButton.tsx` | Icon-only button or link |
| `src/components/ui/Card.tsx`, `EmptyState.tsx`, `Pill.tsx`, `Avatar.tsx` | Surfaces and small display pieces (`Pill.tsx` also exports `navPillClasses`, `chipClasses`) |
| `src/components/ui/Field.tsx`, `controls.tsx` | Form field wrapper; `Input`, `Textarea`, `Select`, `controlClasses` |
| `src/components/ui/radio-keys.ts` | Arrow-key navigation math shared by radio groups and menus |
| `src/components/ui/Segmented.tsx`, `ColorSwatches.tsx` | Radio groups |
| `src/components/ui/Modal.tsx`, `Menu.tsx` | `<dialog>` modal, "⋯" menu |
| `src/components/Brand.tsx` | Logo mark plus name |
| `src/app/(athlete)/AthleteTabBar.tsx`, `AthleteHeader.tsx`, `ProgramTitle.tsx`, `WeekStrip.tsx` | Athlete navigation (replaces `AthleteNav.tsx`, `ProgramSelect.tsx`) |
| `src/app/coach/CoachNav.tsx`, `CoachNavLinks.tsx`, `UserMenu.tsx` | Coach navigation |
| `src/app/coach/programs/[id]/ProgramHeader.tsx` | Program name plus Planner / Athletes / Settings pills |
| `src/app/coach/programs/[id]/planner/CopyDialog.tsx` | Target week/day modal (replaces `CopyForm.tsx`) |

---

### Task 1: Theme tokens, block colors and font

**Files:**
- Modify: `src/app/globals.css` (full rewrite)
- Modify: `src/app/layout.tsx` (full rewrite)
- Modify: `src/components/training/colors.ts` (full rewrite)
- Modify: `src/components/training/BlockCard.tsx` (import and `<article>` line)
- Modify: `src/app/coach/programs/[id]/planner/BlockEditor.tsx` (swatch import and swatch button)
- Test: `tests/ui/tokens.test.ts`

**Interfaces:**
- Produces: Tailwind color utilities `background`, `surface`, `surface-2`, `raised`, `border`, `foreground`, `muted`, `primary`, `on-primary`, `chrome`, `on-chrome`, `danger`, `success` (for example `bg-surface`, `text-muted`); CSS variables `--block-stripe`, `--block-fill`, `--block-ink` on any element with `data-color`; `blockColor(color: string): BlockColor` from `@/components/training/colors`.

- [ ] **Step 1: Write the failing test** — `tests/ui/tokens.test.ts`

```ts
import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import { blockColor } from "@/components/training/colors";
import { BLOCK_COLORS } from "@/lib/training/schemas";

const css = readFileSync("src/app/globals.css", "utf8");
const darkAt = css.indexOf("@media (prefers-color-scheme: dark)");
const light = css.slice(0, darkAt);
const dark = css.slice(darkAt);
const BASE = ["background", "surface", "surface-2", "raised", "border", "foreground", "muted", "primary", "on-primary", "danger", "success"];

describe("theme tokens", () => {
  it("has a dark theme block at the end of the file", () => {
    expect(darkAt).toBeGreaterThan(0);
  });

  it("defines every base token in both themes", () => {
    for (const name of BASE) {
      expect(light, name).toContain(`--${name}:`);
      expect(dark, name).toContain(`--${name}:`);
    }
  });

  it("defines stripe, fill and ink for every block color in both themes", () => {
    for (const c of BLOCK_COLORS) {
      for (const k of ["stripe", "fill", "ink"]) {
        expect(light, `${c}-${k}`).toContain(`--color-block-${c}-${k}:`);
        expect(dark, `${c}-${k}`).toContain(`--color-block-${c}-${k}:`);
      }
    }
  });

  it("maps every block color from data-color", () => {
    for (const c of BLOCK_COLORS) {
      if (c !== "neutral") expect(css, c).toContain(`[data-color="${c}"]`);
    }
  });
});

describe("blockColor", () => {
  it("keeps known colors and falls back to neutral", () => {
    expect(blockColor("blue")).toBe("blue");
    expect(blockColor("magenta")).toBe("neutral");
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `pnpm vitest run tests/ui/tokens.test.ts`
Expected: FAIL (`blockColor` is not exported, tokens missing).

- [ ] **Step 3: Rewrite `src/app/globals.css`**

```css
@import "tailwindcss";

/* Semantic tokens. Light values here; dark values in the media query that closes this file.
   The theme follows the operating system only (docs/specs/training-tailor-ui-restyle-design.md). */
:root {
  color-scheme: light dark;
  --background: #f5f5f5;
  --surface: #ffffff;
  --surface-2: #f0f0f0;
  --raised: #ffffff;
  --border: #e5e5e5;
  --foreground: #111111;
  --muted: #666666;
  --primary: #111111;
  --on-primary: #ffffff;
  --chrome: #000000;
  --on-chrome: #ffffff;
  --danger: #dc2626;
  --success: #15803d;

  /* Block colors: stripe (athlete card), fill (planner block, tinted buttons), ink (text on a fill). */
  --color-block-neutral-stripe: #d4d4d4;
  --color-block-neutral-fill: #f0f0f0;
  --color-block-neutral-ink: #404040;
  --color-block-red-stripe: #fca5a5;
  --color-block-red-fill: #fee2e2;
  --color-block-red-ink: #b91c1c;
  --color-block-orange-stripe: #fdba74;
  --color-block-orange-fill: #ffedd5;
  --color-block-orange-ink: #c2410c;
  --color-block-yellow-stripe: #fde047;
  --color-block-yellow-fill: #fef9c3;
  --color-block-yellow-ink: #a16207;
  --color-block-green-stripe: #86efac;
  --color-block-green-fill: #dcfce7;
  --color-block-green-ink: #15803d;
  --color-block-blue-stripe: #93c5fd;
  --color-block-blue-fill: #dbeafe;
  --color-block-blue-ink: #1d4ed8;
  --color-block-purple-stripe: #d8b4fe;
  --color-block-purple-fill: #f3e8ff;
  --color-block-purple-ink: #7e22ce;
}

@theme inline {
  --color-background: var(--background);
  --color-surface: var(--surface);
  --color-surface-2: var(--surface-2);
  --color-raised: var(--raised);
  --color-border: var(--border);
  --color-foreground: var(--foreground);
  --color-muted: var(--muted);
  --color-primary: var(--primary);
  --color-on-primary: var(--on-primary);
  --color-chrome: var(--chrome);
  --color-on-chrome: var(--on-chrome);
  --color-danger: var(--danger);
  --color-success: var(--success);
  --font-sans: var(--font-inter), ui-sans-serif, system-ui, sans-serif;
}

@layer base {
  *, ::after, ::before, ::backdrop, ::file-selector-button {
    border-color: var(--border);
  }
}

/* An element with data-color exposes its block color as --block-stripe / --block-fill / --block-ink.
   Unknown values keep neutral (the generic rule comes first and has the same specificity). */
[data-color] {
  --block-stripe: var(--color-block-neutral-stripe);
  --block-fill: var(--color-block-neutral-fill);
  --block-ink: var(--color-block-neutral-ink);
}
[data-color="red"] {
  --block-stripe: var(--color-block-red-stripe);
  --block-fill: var(--color-block-red-fill);
  --block-ink: var(--color-block-red-ink);
}
[data-color="orange"] {
  --block-stripe: var(--color-block-orange-stripe);
  --block-fill: var(--color-block-orange-fill);
  --block-ink: var(--color-block-orange-ink);
}
[data-color="yellow"] {
  --block-stripe: var(--color-block-yellow-stripe);
  --block-fill: var(--color-block-yellow-fill);
  --block-ink: var(--color-block-yellow-ink);
}
[data-color="green"] {
  --block-stripe: var(--color-block-green-stripe);
  --block-fill: var(--color-block-green-fill);
  --block-ink: var(--color-block-green-ink);
}
[data-color="blue"] {
  --block-stripe: var(--color-block-blue-stripe);
  --block-fill: var(--color-block-blue-fill);
  --block-ink: var(--color-block-blue-ink);
}
[data-color="purple"] {
  --block-stripe: var(--color-block-purple-stripe);
  --block-fill: var(--color-block-purple-fill);
  --block-ink: var(--color-block-purple-ink);
}

/* Keep this block last: tests/ui/tokens.test.ts reads everything after it as the dark theme. */
@media (prefers-color-scheme: dark) {
  :root {
    --background: #111111;
    --surface: #1e1e1e;
    --surface-2: #2c2c2c;
    --raised: #555555;
    --border: #2e2e2e;
    --foreground: #f5f5f5;
    --muted: #a3a3a3;
    --primary: #f5f5f5;
    --on-primary: #111111;
    --danger: #f87171;
    --success: #4ade80;

    --color-block-neutral-stripe: #525252;
    --color-block-neutral-fill: #262626;
    --color-block-neutral-ink: #d4d4d4;
    --color-block-red-stripe: #dc2626;
    --color-block-red-fill: #3b1d1d;
    --color-block-red-ink: #fca5a5;
    --color-block-orange-stripe: #ea580c;
    --color-block-orange-fill: #3b2414;
    --color-block-orange-ink: #fdba74;
    --color-block-yellow-stripe: #a16207;
    --color-block-yellow-fill: #352b12;
    --color-block-yellow-ink: #fde047;
    --color-block-green-stripe: #16a34a;
    --color-block-green-fill: #15301f;
    --color-block-green-ink: #86efac;
    --color-block-blue-stripe: #2563eb;
    --color-block-blue-fill: #172a46;
    --color-block-blue-ink: #93c5fd;
    --color-block-purple-stripe: #7e22ce;
    --color-block-purple-fill: #2e1a40;
    --color-block-purple-ink: #d8b4fe;
  }
}
```

- [ ] **Step 4: Rewrite `src/components/training/colors.ts`**

```ts
import { BLOCK_COLORS, type BlockColor } from "@/lib/training/schemas";

/**
 * Block colors live in globals.css as tokens: an element carries data-color={blockColor(color)} and reads
 * --block-stripe / --block-fill / --block-ink. Unknown stored values render as neutral.
 */
export const blockColor = (color: string): BlockColor =>
  (BLOCK_COLORS as readonly string[]).includes(color) ? (color as BlockColor) : "neutral";
```

- [ ] **Step 5: Keep the two current users compiling**

In `src/components/training/BlockCard.tsx` replace `import { borderFor } from "./colors";` with `import { blockColor } from "./colors";` and the `<article …>` opening line with:

```tsx
    <article data-color={blockColor(block.color)} className="flex flex-col gap-2 rounded border border-l-4 border-l-(--block-stripe) p-3">
```

In `src/app/coach/programs/[id]/planner/BlockEditor.tsx` delete the line `import { BLOCK_SWATCH } from "@/components/training/colors";` and replace the swatch `<button …/>` inside the color fieldset with:

```tsx
            <button key={c} type="button" aria-label={c} aria-pressed={draft.color === c} onClick={() => set({ color: c })}
              data-color={c} className={`h-7 w-7 rounded-full bg-(--block-stripe) ${draft.color === c ? "ring-2 ring-foreground ring-offset-2" : ""}`} />
```

(Both files are rewritten in Tasks 7 and 12; this only keeps the build green.)

- [ ] **Step 6: Rewrite `src/app/layout.tsx`**

```tsx
import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getLocale } from "next-intl/server";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: "Training Tailor",
  description: "Follow your coach's programming, log your results and compare them.",
};

export const viewport: Viewport = {
  // cover lets the athlete tab bar pad itself with env(safe-area-inset-bottom).
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f5f5f5" },
    { media: "(prefers-color-scheme: dark)", color: "#111111" },
  ],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  return (
    <html lang={locale} className={inter.variable}>
      <body className="min-h-screen bg-background font-sans text-foreground antialiased">
        <NextIntlClientProvider>{children}</NextIntlClientProvider>
      </body>
    </html>
  );
}
```

- [ ] **Step 7: Run the test, types and build**

Run: `pnpm vitest run tests/ui/tokens.test.ts` → PASS.
Run: `pnpm exec tsc --noEmit` → no errors.
Run: `pnpm build` → succeeds. `next/font/google` downloads Inter at build time; if the corporate network blocks `fonts.googleapis.com`, ask the user to turn the VPN off and rerun (CI has open internet).

- [ ] **Step 8: Commit**

```bash
git add src/app/globals.css src/app/layout.tsx src/components/training/colors.ts src/components/training/BlockCard.tsx "src/app/coach/programs/[id]/planner/BlockEditor.tsx" tests/ui/tokens.test.ts
git commit -m "feat(ui): light and dark theme tokens, block color tokens and Inter

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Display and form primitives

**Files:**
- Create: `src/components/ui/cx.ts`, `Button.tsx`, `IconButton.tsx`, `Card.tsx`, `EmptyState.tsx`, `Pill.tsx`, `Field.tsx`, `controls.tsx`, `Avatar.tsx`
- Modify: `src/lib/format.ts` (append `initials`)
- Test: `tests/ui/primitives.test.tsx`, `tests/lib/format.test.ts`

**Interfaces:**
- Consumes: tokens from Task 1.
- Produces:
  - `cx(...parts: (string | false | null | undefined)[]): string`
  - `buttonClasses(look?: { variant?: "primary" | "secondary" | "ghost" | "danger" | "tinted"; size?: "sm" | "md"; block?: boolean; className?: string }): string` (defaults: `secondary`, `md`)
  - `Button(props)`: button props plus the look, or Next `Link` props plus the look when `href` is set
  - `IconButton({ label, className?, children, href? , ...buttonProps })`: `label` becomes `aria-label` and `title`; with `href` it renders a `Link`; it forwards `ref` and any extra attributes (dnd-kit `attributes`/`listeners`)
  - `Card({ as?: "div" | "article" | "section" | "li"; stripe?: boolean; ...htmlAttributes })`: no padding, so callers add their own
  - `EmptyState({ children })`
  - `Pill({ tone?: "neutral" | "success" | "inverted"; className?; children })`, `navPillClasses(active: boolean): string`, `chipClasses(on: boolean): string`
  - `Field({ label: string; hint?: string | null; error?: string | null; className?: string; children })`
  - `controlClasses(compact?: boolean): string`; `Input`, `Textarea` and `Select`, each with an optional `compact` prop
  - `Avatar({ name: string; image?: string | null; size?: number })`
  - `initials(name: string): string` in `@/lib/format`

- [ ] **Step 1: Write the failing tests**

`tests/lib/format.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { initials } from "@/lib/format";

describe("initials", () => {
  it("takes the first letters of the first and last words", () => {
    expect(initials("Juan Ajiz")).toBe("JA");
    expect(initials("  maría  de la  Sierra ")).toBe("MS");
  });

  it("uses one letter for one word and ? for a blank name", () => {
    expect(initials("madonna")).toBe("M");
    expect(initials("   ")).toBe("?");
  });
});
```

`tests/ui/primitives.test.tsx`:

```tsx
// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";

vi.mock("next/link", () => ({
  default: ({ href, ...rest }: { href: string } & Record<string, unknown>) => <a href={href} {...rest} />,
}));

import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/controls";
import { Field } from "@/components/ui/Field";
import { IconButton } from "@/components/ui/IconButton";

describe("Button", () => {
  it("renders a link with the requested look when href is given", () => {
    render(<Button href="/x" variant="primary">Go</Button>);
    const link = screen.getByRole("link", { name: "Go" });
    expect(link).toHaveAttribute("href", "/x");
    expect(link.className).toContain("bg-primary");
  });

  it("renders a secondary button by default and stretches with block", () => {
    render(<Button type="button" block>Save</Button>);
    const button = screen.getByRole("button", { name: "Save" });
    expect(button.className).toContain("bg-surface-2");
    expect(button.className).toContain("w-full");
  });
});

describe("IconButton", () => {
  it("names the control with its label", () => {
    render(<IconButton label="Close"><svg /></IconButton>);
    expect(screen.getByRole("button", { name: "Close" })).toHaveAttribute("type", "button");
  });
});

describe("Field", () => {
  it("labels its control and announces errors", () => {
    render(<Field label="Name" error="Required"><Input /></Field>);
    expect(screen.getByLabelText("Name")).toBeInstanceOf(HTMLInputElement);
    expect(screen.getByRole("alert")).toHaveTextContent("Required");
  });
});

describe("Avatar", () => {
  it("shows the image when there is one, initials otherwise", () => {
    const { container, rerender } = render(<Avatar name="Juan Ajiz" image="https://example.com/a.png" />);
    expect(container.querySelector("img")).toHaveAttribute("src", "https://example.com/a.png");
    rerender(<Avatar name="Juan Ajiz" />);
    expect(container).toHaveTextContent("JA");
  });
});
```

- [ ] **Step 2: Run them and see them fail**

Run: `pnpm vitest run tests/lib/format.test.ts tests/ui/primitives.test.tsx`
Expected: FAIL (modules not found).

- [ ] **Step 3: Append `initials` to `src/lib/format.ts`**

```ts
/** Up to two initials, from the first and last words ("Juan Ajiz" → "JA"); "?" for a blank name. */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  const last = words.length > 1 ? words[words.length - 1][0] : "";
  return (words[0][0] + last).toUpperCase();
}
```

- [ ] **Step 4: Create the primitives**

`src/components/ui/cx.ts`:

```ts
/** Joins the truthy class names. */
export const cx = (...parts: (string | false | null | undefined)[]): string => parts.filter(Boolean).join(" ");
```

`src/components/ui/Button.tsx`:

```tsx
import Link from "next/link";
import { cx } from "./cx";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "tinted";
export type ButtonSize = "sm" | "md";
type Look = { variant?: ButtonVariant; size?: ButtonSize; block?: boolean; className?: string };

const BASE = "inline-flex select-none items-center justify-center gap-2 rounded-xl font-semibold transition disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground";
const VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-primary text-on-primary hover:opacity-90",
  secondary: "bg-surface-2 text-foreground hover:brightness-95 dark:hover:brightness-125",
  ghost: "text-foreground hover:bg-surface-2",
  danger: "text-danger ring-1 ring-inset ring-danger/40 hover:bg-danger/10",
  // Inside an element with data-color: the block's ink on its fill (Strivee's "Coaching Tips" / "Log Result").
  tinted: "bg-(--block-fill) text-(--block-ink) hover:brightness-95 dark:hover:brightness-125",
};
const SIZES: Record<ButtonSize, string> = { sm: "h-9 px-3 text-sm", md: "h-12 px-5 text-[15px]" };

export function buttonClasses({ variant = "secondary", size = "md", block = false, className }: Look = {}): string {
  return cx(BASE, VARIANTS[variant], SIZES[size], block && "w-full", className);
}

type AsButton = Look & Omit<React.ComponentProps<"button">, "className"> & { href?: undefined };
type AsLink = Look & Omit<React.ComponentProps<typeof Link>, "className">;

/** A button, or a link that looks like one when `href` is set. Native `type` semantics (submit by default inside forms). */
export function Button(props: AsButton | AsLink) {
  if (props.href !== undefined) {
    const { variant, size, block, className, ...link } = props;
    return <Link {...link} className={buttonClasses({ variant, size, block, className })} />;
  }
  const { variant, size, block, className, ...button } = props;
  return <button {...button} className={buttonClasses({ variant, size, block, className })} />;
}
```

`src/components/ui/IconButton.tsx`:

```tsx
import Link from "next/link";
import { cx } from "./cx";

const BASE = "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-muted transition hover:bg-surface-2 hover:text-foreground disabled:pointer-events-none disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-foreground";

type Common = { label: string; className?: string; children: React.ReactNode };
type AsButton = Common & Omit<React.ComponentProps<"button">, "aria-label" | "className" | "children"> & { href?: undefined };
type AsLink = Common & { href: string };

/** Square icon-only control; `label` is its accessible name and tooltip. */
export function IconButton(props: AsButton | AsLink) {
  if (props.href !== undefined) {
    return (
      <Link href={props.href} aria-label={props.label} title={props.label} className={cx(BASE, props.className)}>
        {props.children}
      </Link>
    );
  }
  const { label, className, children, ...button } = props;
  return (
    <button type="button" aria-label={label} title={label} {...button} className={cx(BASE, className)}>
      {children}
    </button>
  );
}
```

`src/components/ui/Card.tsx`:

```tsx
import { cx } from "./cx";

type Props = React.HTMLAttributes<HTMLElement> & { as?: "div" | "article" | "section" | "li"; stripe?: boolean };

/** Rounded surface. No padding: callers set it. `stripe` draws the block color on the left (set data-color). */
export function Card({ as: Tag = "div", stripe = false, className, ...rest }: Props) {
  return (
    <Tag {...rest} className={cx("rounded-2xl border bg-surface", stripe && "border-l-4 border-l-(--block-stripe)", className)} />
  );
}
```

`src/components/ui/EmptyState.tsx`:

```tsx
import { Card } from "./Card";

export function EmptyState({ children }: { children: React.ReactNode }) {
  return <Card className="px-6 py-10 text-center text-[15px] text-muted">{children}</Card>;
}
```

`src/components/ui/Pill.tsx`:

```tsx
import { cx } from "./cx";

export type PillTone = "neutral" | "success" | "inverted";
const TONES: Record<PillTone, string> = {
  neutral: "bg-surface-2 text-muted",
  success: "bg-success/15 text-success",
  inverted: "bg-primary text-on-primary",
};

export function Pill({ tone = "neutral", className, children }: { tone?: PillTone; className?: string; children: React.ReactNode }) {
  return (
    <span className={cx("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold", TONES[tone], className)}>
      {children}
    </span>
  );
}

/** Navigation pill: the active one inverted, like Strivee's top navigation. */
export const navPillClasses = (active: boolean): string =>
  cx("rounded-full px-4 py-1.5 text-sm font-semibold transition focus-visible:outline-2 focus-visible:outline-foreground",
    active ? "bg-primary text-on-primary" : "text-muted hover:bg-surface-2 hover:text-foreground");

/** Toggle chip for multi-select options. */
export const chipClasses = (on: boolean): string =>
  cx("rounded-full px-3 py-1.5 text-sm font-medium transition disabled:opacity-50",
    on ? "bg-primary text-on-primary" : "bg-surface-2 text-foreground hover:brightness-95 dark:hover:brightness-125");
```

`src/components/ui/controls.tsx`:

```tsx
import { cx } from "./cx";

/** Filled control (Strivee's Workout Log): no visible border until focus. No width: Field stretches it. */
export function controlClasses(compact = false): string {
  return cx(
    "rounded-xl bg-surface-2 text-foreground outline-none ring-1 ring-transparent transition placeholder:text-muted focus:ring-foreground disabled:opacity-50",
    compact ? "px-2.5 py-1.5 text-sm" : "px-4 py-3 text-[15px]",
  );
}

type Compact = { compact?: boolean };

export function Input({ compact, className, ...rest }: React.ComponentProps<"input"> & Compact) {
  return <input {...rest} className={cx(controlClasses(compact), className)} />;
}

export function Textarea({ compact, className, ...rest }: React.ComponentProps<"textarea"> & Compact) {
  return <textarea {...rest} className={cx(controlClasses(compact), "leading-relaxed", className)} />;
}

export function Select({ compact, className, ...rest }: React.ComponentProps<"select"> & Compact) {
  return <select {...rest} className={cx(controlClasses(compact), className)} />;
}
```

`src/components/ui/Field.tsx`:

```tsx
import { cx } from "./cx";

type Props = { label: string; hint?: string | null; error?: string | null; className?: string; children: React.ReactNode };

/** Label wrapping its control (implicit association, no ids needed), with optional hint and error below. */
export function Field({ label, hint, error, className, children }: Props) {
  return (
    <div className={cx("flex flex-col gap-1.5", className)}>
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">{label}</span>
        {children}
      </label>
      {hint && <p className="text-xs text-muted">{hint}</p>}
      {error && <p role="alert" className="text-xs text-danger">{error}</p>}
    </div>
  );
}
```

`src/components/ui/Avatar.tsx`:

```tsx
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
```

- [ ] **Step 5: Run the tests**

Run: `pnpm vitest run tests/lib/format.test.ts tests/ui/primitives.test.tsx` → PASS.
Run: `pnpm exec tsc --noEmit` → no errors.

- [ ] **Step 6: Commit**

```bash
git add src/components/ui src/lib/format.ts tests/ui/primitives.test.tsx tests/lib/format.test.ts
git commit -m "feat(ui): button, icon button, card, pill, field, controls and avatar primitives

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Radio groups (Segmented, ColorSwatches)

**Files:**
- Create: `src/components/ui/radio-keys.ts`, `src/components/ui/Segmented.tsx`, `src/components/ui/ColorSwatches.tsx`
- Test: `tests/ui/radio-keys.test.ts`, `tests/ui/radio-groups.test.tsx`

**Interfaces:**
- Produces:
  - `stepEnabled(disabled: readonly boolean[], from: number, delta: 1 | -1): number`
  - `arrowDelta(key: string): 1 | -1 | null`
  - `Segmented<T extends string>({ options: { value: T; label: string; disabled?: boolean }[]; value: T; onChange: (v: T) => void; label: string; size?: "sm" | "md"; className?: string })`
  - `ColorSwatches({ colors: readonly string[]; value: string; onChange: (c: string) => void; label: string; colorLabel: (c: string) => string })`

- [ ] **Step 1: Write the failing tests**

`tests/ui/radio-keys.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { arrowDelta, stepEnabled } from "@/components/ui/radio-keys";

describe("stepEnabled", () => {
  it("skips disabled entries and wraps around", () => {
    const disabled = [false, true, false, false];
    expect(stepEnabled(disabled, 0, 1)).toBe(2);
    expect(stepEnabled(disabled, 0, -1)).toBe(3);
    expect(stepEnabled(disabled, 3, 1)).toBe(0);
  });

  it("stays put when nothing else is enabled", () => {
    expect(stepEnabled([false, true], 0, 1)).toBe(0);
  });
});

describe("arrowDelta", () => {
  it("maps arrows to steps", () => {
    expect(arrowDelta("ArrowRight")).toBe(1);
    expect(arrowDelta("ArrowDown")).toBe(1);
    expect(arrowDelta("ArrowLeft")).toBe(-1);
    expect(arrowDelta("ArrowUp")).toBe(-1);
    expect(arrowDelta("Enter")).toBeNull();
  });
});
```

`tests/ui/radio-groups.test.tsx`:

```tsx
// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { ColorSwatches } from "@/components/ui/ColorSwatches";
import { Segmented } from "@/components/ui/Segmented";

const OPTIONS = [
  { value: "a", label: "A" },
  { value: "b", label: "B", disabled: true },
  { value: "c", label: "C" },
  { value: "d", label: "D" },
];

describe("Segmented", () => {
  it("marks the selected option and makes only it tabbable", () => {
    render(<Segmented label="Kind" options={OPTIONS} value="a" onChange={() => {}} />);
    expect(screen.getByRole("radiogroup", { name: "Kind" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "A" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("radio", { name: "A" })).toHaveAttribute("tabindex", "0");
    expect(screen.getByRole("radio", { name: "C" })).toHaveAttribute("tabindex", "-1");
  });

  it("selects on click", () => {
    const onChange = vi.fn();
    render(<Segmented label="Kind" options={OPTIONS} value="a" onChange={onChange} />);
    fireEvent.click(screen.getByRole("radio", { name: "C" }));
    expect(onChange).toHaveBeenCalledWith("c");
  });

  it("moves with arrow keys, skipping disabled options and wrapping", () => {
    const onChange = vi.fn();
    render(<Segmented label="Kind" options={OPTIONS} value="a" onChange={onChange} />);
    const a = screen.getByRole("radio", { name: "A" });
    fireEvent.keyDown(a, { key: "ArrowRight" });
    expect(onChange).toHaveBeenLastCalledWith("c");
    fireEvent.keyDown(a, { key: "ArrowLeft" });
    expect(onChange).toHaveBeenLastCalledWith("d");
  });
});

describe("ColorSwatches", () => {
  const props = { colors: ["neutral", "red", "blue"], label: "Color", colorLabel: (c: string) => c.toUpperCase() };

  it("selects a color by click and by arrow key", () => {
    const onChange = vi.fn();
    render(<ColorSwatches {...props} value="neutral" onChange={onChange} />);
    expect(screen.getByRole("radio", { name: "NEUTRAL" })).toHaveAttribute("aria-checked", "true");
    fireEvent.click(screen.getByRole("radio", { name: "BLUE" }));
    expect(onChange).toHaveBeenLastCalledWith("blue");
    fireEvent.keyDown(screen.getByRole("radio", { name: "NEUTRAL" }), { key: "ArrowRight" });
    expect(onChange).toHaveBeenLastCalledWith("red");
  });
});
```

- [ ] **Step 2: Run them and see them fail**

Run: `pnpm vitest run tests/ui/radio-keys.test.ts tests/ui/radio-groups.test.tsx` → FAIL (modules not found).

- [ ] **Step 3: Implement**

`src/components/ui/radio-keys.ts`:

```ts
/** Index reached by moving `delta` from `from`, wrapping and skipping disabled entries; `from` when none is enabled. */
export function stepEnabled(disabled: readonly boolean[], from: number, delta: 1 | -1): number {
  const n = disabled.length;
  for (let i = 1; i < n; i++) {
    const j = (((from + delta * i) % n) + n) % n;
    if (!disabled[j]) return j;
  }
  return from;
}

/** Arrow keys as steps (right/down forward, left/up back); null for any other key. */
export function arrowDelta(key: string): 1 | -1 | null {
  if (key === "ArrowRight" || key === "ArrowDown") return 1;
  if (key === "ArrowLeft" || key === "ArrowUp") return -1;
  return null;
}
```

`src/components/ui/Segmented.tsx`:

```tsx
"use client";

import { useRef } from "react";
import { cx } from "./cx";
import { arrowDelta, stepEnabled } from "./radio-keys";

export type SegmentedOption<T extends string> = { value: T; label: string; disabled?: boolean };
type Props<T extends string> = {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  label: string;
  size?: "sm" | "md";
  className?: string;
};

/** Segmented control (Strivee's Rx / Scaled) as an accessible radio group: one tab stop, arrows move and select. */
export function Segmented<T extends string>({ options, value, onChange, label, size = "md", className }: Props<T>) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const disabled = options.map((o) => Boolean(o.disabled));
  const selected = options.findIndex((o) => o.value === value);
  const tabStop = selected >= 0 ? selected : disabled.indexOf(false);

  function onKeyDown(e: React.KeyboardEvent, index: number) {
    const delta = arrowDelta(e.key);
    if (delta === null) return;
    e.preventDefault();
    const next = stepEnabled(disabled, index, delta);
    if (next === index) return;
    onChange(options[next].value);
    refs.current[next]?.focus();
  }

  return (
    <div role="radiogroup" aria-label={label} className={cx("flex rounded-xl bg-surface-2 p-1", className)}>
      {options.map((o, i) => {
        const checked = i === selected;
        return (
          <button key={o.value} ref={(el) => { refs.current[i] = el; }} type="button" role="radio" aria-checked={checked}
            tabIndex={i === tabStop ? 0 : -1} disabled={o.disabled} onClick={() => onChange(o.value)} onKeyDown={(e) => onKeyDown(e, i)}
            className={cx(
              "flex-1 rounded-lg font-semibold transition disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-foreground",
              size === "sm" ? "px-3 py-1 text-sm" : "px-4 py-2 text-[15px]",
              checked ? "bg-raised text-foreground shadow-sm" : "text-muted hover:text-foreground",
            )}>
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
```

`src/components/ui/ColorSwatches.tsx`:

```tsx
"use client";

import { useRef } from "react";
import { cx } from "./cx";
import { arrowDelta, stepEnabled } from "./radio-keys";

type Props = {
  colors: readonly string[];
  value: string;
  onChange: (color: string) => void;
  label: string;
  colorLabel: (color: string) => string;
};

/** Block colors as circles (fill with a stripe-colored rim); a radio group with arrow-key navigation. */
export function ColorSwatches({ colors, value, onChange, label, colorLabel }: Props) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const selected = Math.max(0, colors.indexOf(value));

  function onKeyDown(e: React.KeyboardEvent, index: number) {
    const delta = arrowDelta(e.key);
    if (delta === null) return;
    e.preventDefault();
    const next = stepEnabled(colors.map(() => false), index, delta);
    onChange(colors[next]);
    refs.current[next]?.focus();
  }

  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap items-center gap-2.5">
      {colors.map((c, i) => (
        <button key={c} ref={(el) => { refs.current[i] = el; }} type="button" role="radio" aria-checked={c === value}
          aria-label={colorLabel(c)} title={colorLabel(c)} tabIndex={i === selected ? 0 : -1} data-color={c}
          onClick={() => onChange(c)} onKeyDown={(e) => onKeyDown(e, i)}
          className={cx(
            "h-8 w-8 rounded-full border-2 border-(--block-stripe) bg-(--block-fill) transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground",
            c === value && "ring-2 ring-foreground ring-offset-2 ring-offset-surface",
          )} />
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Run the tests**

Run: `pnpm vitest run tests/ui/radio-keys.test.ts tests/ui/radio-groups.test.tsx` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/ui/radio-keys.ts src/components/ui/Segmented.tsx src/components/ui/ColorSwatches.tsx tests/ui/radio-keys.test.ts tests/ui/radio-groups.test.tsx
git commit -m "feat(ui): segmented control and color swatches as keyboard radio groups

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Modal on the native `<dialog>`

**Files:**
- Modify: `package.json`, `pnpm-lock.yaml` (add `lucide-react`)
- Create: `src/components/ui/Modal.tsx`
- Test: `tests/ui/modal.test.tsx`

**Interfaces:**
- Consumes: `IconButton`, `cx` (Task 2).
- Produces: `Modal({ title: string; closeLabel: string; onClose: () => void; children; footer?: React.ReactNode; size?: "sm" | "lg" })`. It is mounted open and the parent unmounts it to close it. Esc, a backdrop click and the ✕ button call `onClose`. Focus returns to the element that was focused when it opened. A form inside it is submitted from the footer with `<Button type="submit" form={formId}>`.

- [ ] **Step 1: Add the icon library**

Run: `pnpm add lucide-react`
Expected: the dependency lands in `package.json`; `pnpm install` stays clean (no new build-script approvals).

- [ ] **Step 2: Write the failing test** — `tests/ui/modal.test.tsx`

```tsx
// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeAll, describe, it, expect, vi } from "vitest";
import { Modal } from "@/components/ui/Modal";

beforeAll(() => {
  // jsdom does not implement the modal dialog API.
  if (typeof HTMLDialogElement.prototype.showModal !== "function") {
    HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) { this.setAttribute("open", ""); };
    HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) { this.removeAttribute("open"); };
  }
});

const open = (onClose = vi.fn()) =>
  render(<Modal title="Edit block" closeLabel="Close" onClose={onClose} footer={<button type="button">Save</button>}><p>Body</p></Modal>);

describe("Modal", () => {
  it("opens as a labelled dialog in document.body", () => {
    open();
    const dialog = screen.getByRole("dialog", { name: "Edit block" });
    expect(dialog).toHaveAttribute("open");
    expect(dialog.parentElement).toBe(document.body);
    expect(screen.getByText("Body")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
  });

  it("closes with the close button and with Esc (cancel event)", () => {
    const onClose = vi.fn();
    open(onClose);
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    fireEvent(screen.getByRole("dialog"), new Event("cancel", { cancelable: true }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("closes on a backdrop click but not on a click inside", () => {
    const onClose = vi.fn();
    open(onClose);
    fireEvent.click(screen.getByText("Body"));
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("dialog"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("gives focus back to the opener when it unmounts", () => {
    const opener = document.createElement("button");
    document.body.appendChild(opener);
    opener.focus();
    const { unmount } = open();
    screen.getByRole("button", { name: "Close" }).focus();
    unmount();
    expect(document.activeElement).toBe(opener);
    opener.remove();
  });
});
```

- [ ] **Step 3: Run it and see it fail**

Run: `pnpm vitest run tests/ui/modal.test.tsx` → FAIL (module not found).

- [ ] **Step 4: Implement `src/components/ui/Modal.tsx`**

```tsx
"use client";

import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cx } from "./cx";
import { IconButton } from "./IconButton";

type Props = {
  title: string;
  closeLabel: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: "sm" | "lg";
};

/**
 * Native <dialog> opened with showModal(): the browser traps focus, makes the page inert and handles Esc.
 * Mounted open; the parent unmounts it to close. Portaled to document.body so transformed ancestors
 * (dnd-kit sortables) cannot offset it.
 */
export function Modal({ title, closeLabel, onClose, children, footer, size = "lg" }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (!dialog.open) dialog.showModal();
    return () => {
      if (dialog.open) dialog.close();
      opener?.focus();
    };
  }, []);

  if (typeof document === "undefined") return null;
  return createPortal(
    <dialog ref={ref} aria-labelledby={titleId}
      onCancel={(e) => { e.preventDefault(); onClose(); }}
      // A close the browser forces (a repeated Esc without user activation skips "cancel") still reaches the parent.
      onClose={onClose}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      className={cx(
        "m-auto max-h-[90vh] w-[calc(100%-2rem)] flex-col overflow-hidden rounded-2xl border bg-surface p-0 text-foreground shadow-2xl backdrop:bg-chrome/50 open:flex",
        size === "lg" ? "max-w-2xl" : "max-w-sm",
      )}>
      <header className="flex items-center justify-between gap-4 px-6 pb-2 pt-5">
        <h2 id={titleId} className="text-lg font-bold">{title}</h2>
        <IconButton label={closeLabel} onClick={onClose}><X size={18} aria-hidden /></IconButton>
      </header>
      <div className="flex-1 overflow-y-auto px-6 pb-5 pt-2">{children}</div>
      {footer && <footer className="flex flex-wrap items-center justify-end gap-3 border-t px-6 py-4">{footer}</footer>}
    </dialog>,
    document.body,
  );
}
```

- [ ] **Step 5: Run the test**

Run: `pnpm vitest run tests/ui/modal.test.tsx` → PASS.
Run: `pnpm exec tsc --noEmit` → no errors.

- [ ] **Step 6: Commit**

```bash
git add package.json pnpm-lock.yaml src/components/ui/Modal.tsx tests/ui/modal.test.tsx
git commit -m "feat(ui): modal on the native dialog element, lucide icons

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: "⋯" Menu

**Files:**
- Create: `src/components/ui/Menu.tsx`
- Test: `tests/ui/menu.test.tsx`

**Interfaces:**
- Consumes: `IconButton`, `cx`, `stepEnabled`.
- Produces: `Menu({ label: string; items: { label: string; onSelect: () => void; danger?: boolean }[]; icon?: React.ReactNode; align?: "start" | "end"; className?: string })`. `icon` defaults to a horizontal "⋯". Choosing an item closes the menu, focuses the trigger, then calls `onSelect`, so a `Modal` opened from an item returns focus to the trigger.

- [ ] **Step 1: Write the failing test** — `tests/ui/menu.test.tsx`

```tsx
// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { Menu } from "@/components/ui/Menu";

const setup = () => {
  const duplicate = vi.fn();
  const remove = vi.fn();
  render(<Menu label="Block actions" items={[{ label: "Duplicate", onSelect: duplicate }, { label: "Delete", onSelect: remove, danger: true }]} />);
  return { duplicate, remove, trigger: screen.getByRole("button", { name: "Block actions" }) };
};

describe("Menu", () => {
  it("opens from its trigger and focuses the first item", () => {
    const { trigger } = setup();
    expect(trigger).toHaveAttribute("aria-haspopup", "menu");
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("menuitem", { name: "Duplicate" })).toHaveFocus();
  });

  it("moves between items with the arrow keys", () => {
    const { trigger } = setup();
    fireEvent.click(trigger);
    fireEvent.keyDown(screen.getByRole("menuitem", { name: "Duplicate" }), { key: "ArrowDown" });
    expect(screen.getByRole("menuitem", { name: "Delete" })).toHaveFocus();
  });

  it("closes with Esc and gives focus back to the trigger", () => {
    const { trigger } = setup();
    fireEvent.click(trigger);
    fireEvent.keyDown(screen.getByRole("menuitem", { name: "Duplicate" }), { key: "Escape" });
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("closes on a pointer down outside", () => {
    const { trigger } = setup();
    fireEvent.click(trigger);
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("runs the chosen item and closes", () => {
    const { trigger, remove } = setup();
    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole("menuitem", { name: "Delete" }));
    expect(remove).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `pnpm vitest run tests/ui/menu.test.tsx` → FAIL (module not found).

- [ ] **Step 3: Implement `src/components/ui/Menu.tsx`**

```tsx
"use client";

import { useEffect, useId, useRef, useState } from "react";
import { MoreHorizontal } from "lucide-react";
import { cx } from "./cx";
import { IconButton } from "./IconButton";
import { stepEnabled } from "./radio-keys";

export type MenuItem = { label: string; onSelect: () => void; danger?: boolean };
type Props = { label: string; items: MenuItem[]; icon?: React.ReactNode; align?: "start" | "end"; className?: string };

/** Icon trigger plus a popup list of actions; Esc, an outside pointer down or a choice closes it. */
export function Menu({ label, items, icon, align = "end", className }: Props) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    itemRefs.current[0]?.focus();
    const onPointerDown = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  function close() {
    setOpen(false);
    trigger.current?.focus();
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      close();
      return;
    }
    const delta = e.key === "ArrowDown" ? 1 : e.key === "ArrowUp" ? -1 : null;
    if (delta === null) return;
    e.preventDefault();
    const current = itemRefs.current.indexOf(document.activeElement as HTMLButtonElement);
    itemRefs.current[stepEnabled(items.map(() => false), Math.max(current, 0), delta)]?.focus();
  }

  return (
    <div ref={root} className={cx("relative", className)} onKeyDown={open ? onKeyDown : undefined}>
      <IconButton ref={trigger} label={label} aria-haspopup="menu" aria-expanded={open} aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((o) => !o)}>
        {icon ?? <MoreHorizontal size={18} aria-hidden />}
      </IconButton>
      {open && (
        <div id={menuId} role="menu" aria-label={label}
          className={cx("absolute top-full z-20 mt-1 min-w-44 rounded-xl border bg-surface p-1 shadow-lg", align === "end" ? "right-0" : "left-0")}>
          {items.map((item, i) => (
            <button key={item.label} ref={(el) => { itemRefs.current[i] = el; }} type="button" role="menuitem" tabIndex={-1}
              onClick={() => { close(); item.onSelect(); }}
              className={cx("flex w-full rounded-lg px-3 py-2 text-left text-sm font-medium outline-none hover:bg-surface-2 focus:bg-surface-2",
                item.danger ? "text-danger" : "text-foreground")}>
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run the test**

Run: `pnpm vitest run tests/ui/menu.test.tsx` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/ui/Menu.tsx tests/ui/menu.test.tsx
git commit -m "feat(ui): keyboard menu for secondary actions

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Athlete tab bar and layout

**Files:**
- Create: `src/app/(athlete)/AthleteTabBar.tsx`
- Delete: `src/app/(athlete)/AthleteNav.tsx`
- Modify: `src/app/(athlete)/layout.tsx` (full rewrite), `src/lib/routes.ts` (append `withProgram`), `src/i18n/messages/es.json`, `src/i18n/messages/en.json`
- Test: `tests/lib/routes.test.ts` (add a case)

**Interfaces:**
- Consumes: `cx`.
- Produces: `withProgram(path: string, program: string | null): string`; the message keys `nav.calendar`, `nav.main` and `nav.account`.

- [ ] **Step 1: Write the failing test.** In `tests/lib/routes.test.ts` change the import to `import { isPublicPath, safeNext, signinPathFor, withProgram } from "@/lib/routes";` and add this inside the `describe`:

```ts
  it("carries the selected program to another athlete page", () => {
    expect(withProgram("/calendar", "p1")).toBe("/calendar?program=p1");
    expect(withProgram("/calendar", null)).toBe("/calendar");
    expect(withProgram("/", "a b")).toBe("/?program=a%20b");
  });
```

- [ ] **Step 2: Run it and see it fail**

Run: `pnpm vitest run tests/lib/routes.test.ts` → FAIL (`withProgram` is not a function).

- [ ] **Step 3: Append to `src/lib/routes.ts`**

```ts
/** Carries the selected program over to another athlete page ("/calendar" → "/calendar?program=…"). */
export function withProgram(path: string, program: string | null): string {
  return program ? `${path}?program=${encodeURIComponent(program)}` : path;
}
```

- [ ] **Step 4: Add the navigation messages.** In `es.json` replace the `"nav"` object with:

```json
  "nav": {
    "today": "Hoy",
    "calendar": "Calendario",
    "me": "Perfil",
    "programs": "Mis programas",
    "main": "Navegación principal",
    "account": "Cuenta"
  },
```

In `en.json`:

```json
  "nav": {
    "today": "Today",
    "calendar": "Calendar",
    "me": "Me",
    "programs": "My programs",
    "main": "Main navigation",
    "account": "Account"
  },
```

- [ ] **Step 5: Create `src/app/(athlete)/AthleteTabBar.tsx`**

```tsx
"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { CalendarDays, House, UserRound } from "lucide-react";
import { cx } from "@/components/ui/cx";
import { withProgram } from "@/lib/routes";

const ITEMS = [
  { href: "/", key: "today", Icon: House, keepProgram: true },
  { href: "/calendar", key: "calendar", Icon: CalendarDays, keepProgram: true },
  { href: "/me", key: "me", Icon: UserRound, keepProgram: false },
] as const;

/** Bottom tab bar (Strivee's WOD / PRs / Profile row), limited to the pages that exist. */
export function AthleteTabBar() {
  const t = useTranslations("nav");
  const pathname = usePathname();
  const program = useSearchParams().get("program");
  return (
    <nav aria-label={t("main")} className="fixed inset-x-0 bottom-0 z-30 border-t bg-surface pb-[env(safe-area-inset-bottom)]">
      <ul className="mx-auto flex max-w-md">
        {ITEMS.map(({ href, key, Icon, keepProgram }) => {
          const active = pathname === href;
          return (
            <li key={href} className="flex-1">
              <Link href={keepProgram ? withProgram(href, program) : href} aria-current={active ? "page" : undefined}
                className={cx("flex flex-col items-center gap-1 pb-2 pt-2.5 text-xs font-medium transition focus-visible:outline-2 focus-visible:outline-foreground",
                  active ? "text-foreground" : "text-muted hover:text-foreground")}>
                <Icon size={24} strokeWidth={active ? 2.4 : 2} aria-hidden />
                {t(key)}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
```

- [ ] **Step 6: Rewrite `src/app/(athlete)/layout.tsx` and delete the old nav**

```tsx
import { Suspense } from "react";
import { cx } from "@/components/ui/cx";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { getAthleteByUserId } from "@/lib/training/services/accounts";
import { AthleteTabBar } from "./AthleteTabBar";

export default async function AthleteLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  const athlete = user ? await getAthleteByUserId(prisma, user.id) : null;
  return (
    <>
      <main className={cx("mx-auto max-w-md px-4 pt-4", athlete ? "pb-28" : "pb-8")}>{children}</main>
      {/* useSearchParams needs a Suspense boundary. */}
      {athlete && <Suspense><AthleteTabBar /></Suspense>}
    </>
  );
}
```

Run: `git rm "src/app/(athlete)/AthleteNav.tsx"`

- [ ] **Step 7: Verify**

Run: `pnpm vitest run tests/lib/routes.test.ts tests/i18n/messages.test.ts` → PASS.
Run: `pnpm exec tsc --noEmit` → no errors.
Browser: `preview_start {name: "dev"}`. Open `/`, emulate a 375 px width, and check the three tabs, the active state, and that `?program=` survives Today → Calendar. Do it in light and dark (`resize_window colorScheme`).

- [ ] **Step 8: Commit**

```bash
git add -A "src/app/(athlete)" src/lib/routes.ts src/i18n/messages tests/lib/routes.test.ts
git commit -m "feat(ui): athlete bottom tab bar with icons

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Athlete day view, block card and calendar

**Files:**
- Create: `src/app/(athlete)/AthleteHeader.tsx`, `src/app/(athlete)/ProgramTitle.tsx`
- Delete: `src/app/(athlete)/ProgramSelect.tsx`
- Modify (full rewrite): `src/app/(athlete)/WeekStrip.tsx`, `src/app/(athlete)/page.tsx`, `src/app/(athlete)/calendar/page.tsx`, `src/components/training/BlockCard.tsx`
- Modify: `es.json`, `en.json` (`today`, `calendar`)

**Interfaces:**
- Consumes: `Button`, `buttonClasses`, `Card`, `EmptyState`, `IconButton`, `cx`, `blockColor`.
- Produces:
  - `BlockCard({ block: CardBlock; oneRm?: number | null; compact?: boolean; children? })`. `compact` is the planner look: filled with `--block-fill`, no stripe, coaching tips and video shown as indicators, and the heading leaves room on the right (`pr-16`) for the tools.
  - `AthleteHeader({ programs: ProgramOption[]; selected: string; basePath: "/" | "/calendar"; children? })`
  - `ProgramOption = { id: string; name: string }`

- [ ] **Step 1: Messages.** In `es.json` replace the `"today"` and `"calendar"` objects with:

```json
  "today": {
    "noPrograms": "Todavía no sigues ningún programa. Pide a tu coach su enlace de invitación.",
    "program": "Programa",
    "today": "Hoy",
    "startsOn": "Este programa empieza el {date}.",
    "finished": "Programa terminado. Tu historial sigue disponible.",
    "nothing": "Nada publicado para este día.",
    "dayOfProgram": "Semana {week} · Día {day}",
    "prevWeek": "Semana anterior",
    "nextWeek": "Semana siguiente"
  },
  "calendar": {
    "title": "Calendario",
    "prevMonth": "Mes anterior",
    "nextMonth": "Mes siguiente"
  },
```

In `en.json`:

```json
  "today": {
    "noPrograms": "You do not follow any program yet. Ask your coach for their invitation link.",
    "program": "Program",
    "today": "Today",
    "startsOn": "This program starts on {date}.",
    "finished": "Program finished. Your history is still available.",
    "nothing": "Nothing published for this day.",
    "dayOfProgram": "Week {week} · Day {day}",
    "prevWeek": "Previous week",
    "nextWeek": "Next week"
  },
  "calendar": {
    "title": "Calendar",
    "prevMonth": "Previous month",
    "nextMonth": "Next month"
  },
```

(`today.calendar` goes away: the tab bar replaces that link. Check with `grep -rn '"calendar"' "src/app/(athlete)/page.tsx"` after Step 6 that nothing uses it.)

- [ ] **Step 2: Rewrite `src/components/training/BlockCard.tsx`**

```tsx
import { useTranslations } from "next-intl";
import { MessageSquareText, PlayCircle } from "lucide-react";
import { Button, buttonClasses } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { cx } from "@/components/ui/cx";
import { describeSets } from "@/lib/training/barbell";
import type { BarbellSet } from "@/lib/training/schemas";
import { blockColor } from "./colors";

export type CardBlock = {
  kind: string;
  title: string | null;
  color: string;
  description: string | null;
  scoring: string | null;
  timeCapSeconds: number | null;
  movement: string | null;
  sets: BarbellSet[] | null;
  instructions: string | null;
  coachingTips: string | null;
  videoUrl: string | null;
};

function BlockBody({ block, oneRm, compact }: { block: CardBlock; oneRm: number | null; compact: boolean }) {
  const t = useTranslations("block");
  const text = compact ? "text-[13px] leading-snug" : "text-[15px] leading-relaxed";
  return (
    <>
      {block.kind === "custom" && block.scoring && block.scoring !== "none" && (
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">
          {t(`scoring.${block.scoring as "for_time"}`)}
          {block.timeCapSeconds ? ` · ${t("timeCap", { minutes: block.timeCapSeconds / 60 })}` : ""}
        </p>
      )}
      {block.kind === "custom" && block.description && (
        <p className={cx("whitespace-pre-wrap text-foreground/80", text)}>{block.description}</p>
      )}
      {block.kind === "barbell" && (
        <div className={text}>
          {block.title && block.movement && <p className="font-semibold">{block.movement}</p>}
          <ul className="text-foreground/80">{describeSets(block.sets ?? [], oneRm).map((line, i) => <li key={i}>{line}</li>)}</ul>
          {block.instructions && <p className="mt-1 whitespace-pre-wrap text-foreground/80">{block.instructions}</p>}
        </div>
      )}
    </>
  );
}

/** One block: the athlete's card (stripe, tips and video as buttons) or, compact, the coach's planner tile. */
export function BlockCard({ block, oneRm = null, compact = false, children }: {
  block: CardBlock; oneRm?: number | null; compact?: boolean; children?: React.ReactNode;
}) {
  const t = useTranslations("block");
  const heading = block.title ?? (block.kind === "barbell" ? block.movement : null);

  if (compact) {
    return (
      <article data-color={blockColor(block.color)} className="flex flex-col gap-1.5 rounded-xl bg-(--block-fill) p-3">
        {heading && <h3 className="pr-16 text-sm font-bold leading-snug">{heading}</h3>}
        <BlockBody block={block} oneRm={oneRm} compact />
        {(block.coachingTips || block.videoUrl) && (
          <p className="flex flex-wrap items-center gap-3 text-xs font-semibold text-(--block-ink)">
            {block.coachingTips && <span className="inline-flex items-center gap-1"><MessageSquareText size={14} aria-hidden />{t("coachingTips")}</span>}
            {block.videoUrl && <span className="inline-flex items-center gap-1"><PlayCircle size={14} aria-hidden />{t("video")}</span>}
          </p>
        )}
        {children}
      </article>
    );
  }

  return (
    <Card as="article" stripe data-color={blockColor(block.color)} className="flex flex-col gap-3 p-5">
      {heading && <h3 className="text-lg font-bold leading-snug">{heading}</h3>}
      <BlockBody block={block} oneRm={oneRm} compact={false} />
      {block.coachingTips && (
        <details>
          <summary className={cx(buttonClasses({ variant: "tinted", block: true }), "cursor-pointer list-none [&::-webkit-details-marker]:hidden")}>
            <MessageSquareText size={18} aria-hidden />
            {t("coachingTips")}
          </summary>
          <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-foreground/80">{block.coachingTips}</p>
        </details>
      )}
      {block.videoUrl && (
        <Button href={block.videoUrl} target="_blank" rel="noopener noreferrer" block>
          <PlayCircle size={18} aria-hidden />
          {t("video")}
        </Button>
      )}
      {children}
    </Card>
  );
}
```

- [ ] **Step 3: Create `src/app/(athlete)/ProgramTitle.tsx`** and delete `ProgramSelect.tsx` (`git rm "src/app/(athlete)/ProgramSelect.tsx"`)

```tsx
"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ChevronDown } from "lucide-react";

export type ProgramOption = { id: string; name: string };

/** Program name in the black header; with several programs it is a select styled as the title. */
export function ProgramTitle({ programs, selected, basePath }: { programs: ProgramOption[]; selected: string; basePath: "/" | "/calendar" }) {
  const t = useTranslations("today");
  const router = useRouter();
  const name = programs.find((p) => p.id === selected)?.name ?? "";
  if (programs.length < 2) return <h1 className="truncate text-center text-xl font-bold">{name}</h1>;
  return (
    <div className="relative mx-auto flex w-fit max-w-full items-center">
      <h1 className="sr-only">{name}</h1>
      <select aria-label={t("program")} value={selected} onChange={(e) => router.push(`${basePath}?program=${e.target.value}`)}
        className="max-w-full cursor-pointer appearance-none truncate bg-transparent pr-7 text-center text-xl font-bold text-on-chrome outline-none focus-visible:underline [&>option]:bg-surface [&>option]:text-foreground">
        {programs.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>
      <ChevronDown size={20} aria-hidden className="pointer-events-none absolute right-0" />
    </div>
  );
}
```

- [ ] **Step 4: Create `src/app/(athlete)/AthleteHeader.tsx`**

```tsx
import { ProgramTitle, type ProgramOption } from "./ProgramTitle";

/** The black band on top of athlete pages (black in both themes, like Strivee): program, then e.g. the week strip. */
export function AthleteHeader({ programs, selected, basePath, children }: {
  programs: ProgramOption[]; selected: string; basePath: "/" | "/calendar"; children?: React.ReactNode;
}) {
  return (
    <header className="-mx-4 -mt-4 mb-4 bg-chrome px-4 pb-3 pt-[calc(env(safe-area-inset-top)+1.25rem)] text-on-chrome">
      <ProgramTitle programs={programs} selected={selected} basePath={basePath} />
      {children}
    </header>
  );
}
```

- [ ] **Step 5: Rewrite `src/app/(athlete)/WeekStrip.tsx`**

```tsx
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cx } from "@/components/ui/cx";
import { formatDay } from "@/lib/format";
import { addDays, mondayOf, type IsoDate } from "@/lib/training/dates";

type Props = {
  programId: string;
  selected: IsoDate;
  today: IsoDate;
  withBlocks: Set<IsoDate>;
  locale: string;
  labels: { prev: string; next: string };
};

const arrow = "flex h-12 w-7 shrink-0 items-center justify-center rounded-lg text-on-chrome/60 hover:text-on-chrome focus-visible:outline-2 focus-visible:outline-on-chrome";

/** Monday-to-Sunday strip on the black header; the selected day is framed, a dot marks days with blocks. */
export function WeekStrip({ programId, selected, today, withBlocks, locale, labels }: Props) {
  const monday = mondayOf(selected);
  const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  return (
    <div className="mt-3 flex items-center">
      <Link href={`/?program=${programId}&date=${addDays(monday, -7)}`} aria-label={labels.prev} className={arrow}><ChevronLeft size={18} aria-hidden /></Link>
      <ol className="grid flex-1 grid-cols-7 text-center">
        {days.map((d) => (
          <li key={d}>
            <Link href={`/?program=${programId}&date=${d}`} aria-current={d === selected ? "date" : undefined}
              className={cx("mx-auto flex w-11 flex-col items-center rounded-xl border-2 py-1 focus-visible:outline-2 focus-visible:outline-on-chrome",
                d === selected ? "border-on-chrome" : "border-transparent", d === today ? "font-extrabold" : "font-semibold")}>
              <span className="text-[11px] uppercase tracking-wide text-on-chrome/70">{formatDay(d, locale, { weekday: "short" }).replace(/\.$/, "")}</span>
              <span className="text-lg leading-tight">{Number(d.slice(8))}</span>
              <span className={cx("mt-0.5 h-1 w-1 rounded-full", withBlocks.has(d) ? "bg-on-chrome" : "bg-transparent")} />
            </Link>
          </li>
        ))}
      </ol>
      <Link href={`/?program=${programId}&date=${addDays(monday, 7)}`} aria-label={labels.next} className={arrow}><ChevronRight size={18} aria-hidden /></Link>
    </div>
  );
}
```

- [ ] **Step 6: Rewrite `src/app/(athlete)/page.tsx`**

```tsx
import { getLocale, getTranslations } from "next-intl/server";
import { BlockCard } from "@/components/training/BlockCard";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { requireAthletePage } from "@/lib/accounts";
import { orNotFound } from "@/lib/actions";
import { prisma } from "@/lib/db";
import { formatDay } from "@/lib/format";
import { addDays, isIsoDate, mondayOf, todayIn, weekIndexOf } from "@/lib/training/dates";
import type { BarbellSet } from "@/lib/training/schemas";
import { getAthleteDay, getVisibleDays } from "@/lib/training/services/athlete-view";
import { listAthletePrograms } from "@/lib/training/services/enrollments";
import { AthleteHeader } from "./AthleteHeader";
import { WeekStrip } from "./WeekStrip";

type Props = { searchParams: Promise<{ program?: string; date?: string }> };

export default async function TodayPage({ searchParams }: Props) {
  const athlete = await requireAthletePage();
  const { program: programParam, date: dateParam } = await searchParams;
  const t = await getTranslations("today");
  const locale = await getLocale();

  const enrollments = await listAthletePrograms(prisma, athlete.id);
  if (enrollments.length === 0) return <div className="pt-8"><EmptyState>{t("noPrograms")}</EmptyState></div>;

  const programId = enrollments.some((e) => e.programId === programParam) ? programParam as string : enrollments[0].programId;
  const today = todayIn(athlete.timezone);
  const date = dateParam && isIsoDate(dateParam) ? dateParam : today;
  const monday = mondayOf(date);
  const [day, withBlocks] = await Promise.all([
    orNotFound(getAthleteDay(prisma, athlete.id, programId, date, today)),
    getVisibleDays(prisma, athlete.id, programId, monday, addDays(monday, 6)),
  ]);

  return (
    <>
      <AthleteHeader programs={enrollments.map((e) => ({ id: e.programId, name: e.program.name }))} selected={programId} basePath="/">
        <WeekStrip programId={programId} selected={date} today={today} withBlocks={withBlocks} locale={locale}
          labels={{ prev: t("prevWeek"), next: t("nextWeek") }} />
      </AthleteHeader>
      <section className="flex flex-col gap-4">
        <div className="flex min-h-9 items-center justify-between gap-3">
          <p className="inline-block text-sm font-medium text-muted first-letter:uppercase">
            {formatDay(date, locale, { weekday: "long", day: "numeric", month: "long" })}
            {day.timeline.kind === "closed" && day.dayIndex !== null &&
              ` · ${t("dayOfProgram", { week: weekIndexOf(day.dayIndex) + 1, day: (day.dayIndex % 7) + 1 })}`}
          </p>
          {date !== today && <Button href={`/?program=${programId}`} variant="ghost" size="sm">{t("today")}</Button>}
        </div>
        {day.status === "before_start" && <EmptyState>{t("startsOn", { date: formatDay(day.timeline.startDate, locale) })}</EmptyState>}
        {day.status === "finished" && <EmptyState>{t("finished")}</EmptyState>}
        {(day.status === "unpublished" || (day.status === "ok" && day.blocks.length === 0)) && <EmptyState>{t("nothing")}</EmptyState>}
        {day.blocks.map((b) => (
          <BlockCard key={b.id} block={{ ...b, sets: b.sets as BarbellSet[] | null }} />
        ))}
      </section>
    </>
  );
}
```

- [ ] **Step 7: Rewrite `src/app/(athlete)/calendar/page.tsx`**

```tsx
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { cx } from "@/components/ui/cx";
import { IconButton } from "@/components/ui/IconButton";
import { requireAthletePage } from "@/lib/accounts";
import { orNotFound } from "@/lib/actions";
import { prisma } from "@/lib/db";
import { formatDay } from "@/lib/format";
import { monthGrid, todayIn } from "@/lib/training/dates";
import { getVisibleDays } from "@/lib/training/services/athlete-view";
import { listAthletePrograms } from "@/lib/training/services/enrollments";
import { AthleteHeader } from "../AthleteHeader";

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const shiftMonth = (month: string, by: number) => {
  const d = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1 + by, 1));
  return d.toISOString().slice(0, 7);
};

export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ program?: string; month?: string }> }) {
  const athlete = await requireAthletePage();
  const { program: programParam, month: monthParam } = await searchParams;
  const t = await getTranslations("calendar");
  const locale = await getLocale();
  const enrollments = await listAthletePrograms(prisma, athlete.id);
  const enrollment = enrollments.find((e) => e.programId === programParam) ?? enrollments[0];
  if (!enrollment) return null;

  const today = todayIn(athlete.timezone);
  const month = monthParam && MONTH.test(monthParam) ? monthParam : today.slice(0, 7);
  const weeks = monthGrid(month);
  const withBlocks = await orNotFound(getVisibleDays(prisma, athlete.id, enrollment.programId, weeks[0][0], weeks.at(-1)![6]));
  const href = (m: string) => `/calendar?program=${enrollment.programId}&month=${m}`;

  return (
    <>
      <AthleteHeader programs={enrollments.map((e) => ({ id: e.programId, name: e.program.name }))} selected={enrollment.programId} basePath="/calendar" />
      <section className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <IconButton href={href(shiftMonth(month, -1))} label={t("prevMonth")}><ChevronLeft size={20} aria-hidden /></IconButton>
          <h2 className="inline-block text-xl font-bold first-letter:uppercase">{formatDay(`${month}-01`, locale, { month: "long", year: "numeric" })}</h2>
          <IconButton href={href(shiftMonth(month, 1))} label={t("nextMonth")}><ChevronRight size={20} aria-hidden /></IconButton>
        </div>
        <Card className="grid grid-cols-7 gap-y-1 p-3 text-center">
          {weeks[0].map((d) => (
            <span key={d} className="pb-1 text-xs font-semibold uppercase text-muted">{formatDay(d, locale, { weekday: "narrow" })}</span>
          ))}
          {weeks.flat().map((d) => (
            <Link key={d} href={`/?program=${enrollment.programId}&date=${d}`}
              className={cx("mx-auto flex h-11 w-11 flex-col items-center justify-center rounded-xl border-2 text-sm font-semibold transition hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-foreground",
                d === today ? "border-foreground" : "border-transparent", d.slice(0, 7) !== month && "text-muted/50")}>
              {Number(d.slice(8))}
              <span className={cx("mt-0.5 h-1 w-1 rounded-full", withBlocks.has(d) ? "bg-foreground" : "bg-transparent")} />
            </Link>
          ))}
        </Card>
      </section>
    </>
  );
}
```

- [ ] **Step 8: Verify**

Run: `pnpm exec tsc --noEmit`, `pnpm vitest run tests/i18n` → green.
Browser at 375 px, light and dark:
- `/` with Daily RX shows the black header with the week strip and a framed day.
- Block cards have a colored stripe; coaching tips open as a tinted button.
- Switch to a day with nothing published → empty-state card.
- `/calendar`: arrows work, today is framed, dots show on days with blocks.
- Compare against `C:\Dev\strivee images\athlete_view01.jpg` and the light screenshot the user shared.

- [ ] **Step 9: Commit**

```bash
git add -A "src/app/(athlete)" src/components/training/BlockCard.tsx src/i18n/messages
git commit -m "feat(ui): athlete day view with black header, week strip, block cards and calendar

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Athlete sign-in, onboarding, join and profile settings

**Files:**
- Create: `src/components/Brand.tsx`
- Modify (full rewrite): `src/components/GoogleSignInButton.tsx`, `src/components/SignOutButton.tsx`, `src/app/(athlete)/signin/page.tsx`, `src/app/(athlete)/onboarding/OnboardingRunner.tsx`, `src/app/(athlete)/join/[code]/page.tsx`, `src/app/(athlete)/join/[code]/JoinButton.tsx`, `src/app/(athlete)/me/page.tsx`, `src/app/(athlete)/me/SettingsForm.tsx`

**Interfaces:**
- Consumes: `Button`, `Card`, `EmptyState`, `Field`, `Input`, `Select`, `Segmented`.
- Produces: `Brand({ className? })`; `useSignOut(to?: string): () => Promise<void>`; `SignOutButton({ to? })`. `UserMenu` uses `useSignOut` in Task 9.

- [ ] **Step 1: Shared pieces**

`src/components/Brand.tsx`:

```tsx
import { cx } from "@/components/ui/cx";

export function Brand({ className }: { className?: string }) {
  return (
    <span className={cx("inline-flex items-center gap-2 font-extrabold tracking-tight", className)}>
      <span aria-hidden className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-xs text-on-primary">TT</span>
      Training Tailor
    </span>
  );
}
```

`src/components/GoogleSignInButton.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/Button";
import { authClient } from "@/lib/auth-client";

function GoogleMark() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" width="18" height="18">
      <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5a5.6 5.6 0 0 1-2.4 3.6v3h3.9c2.3-2.1 3.5-5.2 3.5-8.8z" />
      <path fill="#34A853" d="M12 24c3.2 0 6-1.1 8-2.9l-3.9-3c-1.1.7-2.5 1.2-4.1 1.2-3.1 0-5.8-2.1-6.7-5H1.3v3.1A12 12 0 0 0 12 24z" />
      <path fill="#FBBC05" d="M5.3 14.3a7.2 7.2 0 0 1 0-4.6V6.6H1.3a12 12 0 0 0 0 10.8z" />
      <path fill="#EA4335" d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.3 6.6l4 3.1c.9-2.8 3.6-4.9 6.7-4.9z" />
    </svg>
  );
}

export function GoogleSignInButton({ callbackURL }: { callbackURL: string }) {
  const t = useTranslations("auth");
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);

  async function signIn() {
    setPending(true);
    setFailed(false);
    const { error } = await authClient.signIn.social({ provider: "google", callbackURL });
    if (error) {
      setFailed(true);
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <Button type="button" block onClick={signIn} disabled={pending}>
        <GoogleMark />
        {pending ? t("redirecting") : t("continueWithGoogle")}
      </Button>
      {failed && <p role="alert" className="text-sm text-danger">{t("failed")}</p>}
    </div>
  );
}
```

`src/components/SignOutButton.tsx`:

```tsx
"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { authClient } from "@/lib/auth-client";

export function useSignOut(to = "/signin") {
  const router = useRouter();
  return async () => {
    await authClient.signOut();
    router.push(to);
    router.refresh();
  };
}

export function SignOutButton({ to = "/signin" }: { to?: string }) {
  const t = useTranslations("auth");
  const signOut = useSignOut(to);
  return (
    <Button type="button" variant="ghost" block onClick={() => void signOut()}>
      <LogOut size={18} aria-hidden />
      {t("signOut")}
    </Button>
  );
}
```

- [ ] **Step 2: Sign-in and onboarding**

`src/app/(athlete)/signin/page.tsx`:

```tsx
import { getTranslations } from "next-intl/server";
import { Brand } from "@/components/Brand";
import { GoogleSignInButton } from "@/components/GoogleSignInButton";
import { Card } from "@/components/ui/Card";
import { safeNext } from "@/lib/routes";

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  const t = await getTranslations("auth");
  return (
    <section className="flex min-h-[80vh] flex-col justify-center gap-8">
      <Brand className="self-center text-xl" />
      <Card className="flex flex-col gap-5 p-6">
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-bold">{t("athleteTitle")}</h1>
          <p className="text-[15px] text-muted">{t("athleteIntro")}</p>
        </div>
        <GoogleSignInButton callbackURL={`/onboarding?next=${encodeURIComponent(safeNext(next))}`} />
      </Card>
    </section>
  );
}
```

`src/app/(athlete)/onboarding/OnboardingRunner.tsx`: keep the imports, the state and the `useEffect` exactly as they are, add `import { Button } from "@/components/ui/Button";`, and replace the two `return` statements at the end with:

```tsx
  if (!error) return <p role="status" className="py-16 text-center text-muted">{t("onboarding.preparing")}</p>;
  return (
    <div className="flex flex-col items-center gap-4 py-16 text-center">
      <p role="alert" className="text-danger">{t(`errors.${error}`)}</p>
      <Button type="button" onClick={() => { setError(null); setAttempt((a) => a + 1); }}>{t("onboarding.retry")}</Button>
    </div>
  );
```

- [ ] **Step 3: Join**

`src/app/(athlete)/join/[code]/page.tsx`:

```tsx
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { GoogleSignInButton } from "@/components/GoogleSignInButton";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { getAthleteByUserId } from "@/lib/training/services/accounts";
import { findProgramByCode, getEnrollmentStatus } from "@/lib/training/services/enrollments";
import { JoinButton } from "./JoinButton";

export default async function JoinPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const t = await getTranslations("join");
  const program = await findProgramByCode(prisma, code);
  if (!program) return <div className="pt-12"><EmptyState>{t("invalid")}</EmptyState></div>;

  const here = `/join/${code}`;
  const user = await getSessionUser();
  const athlete = user ? await getAthleteByUserId(prisma, user.id) : null;
  const status = athlete ? await getEnrollmentStatus(prisma, athlete.id, program.id) : null;
  if (status === "active") redirect(`/?program=${program.id}`);

  return (
    <section className="flex min-h-[70vh] flex-col justify-center">
      <Card className="flex flex-col gap-4 p-6">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold">{program.name}</h1>
          <p className="text-sm text-muted">{t("by", { coach: program.coach.displayName })}</p>
        </div>
        {program.description && <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-foreground/80">{program.description}</p>}
        {!user && (
          <>
            <p className="text-sm text-muted">{t("signInToJoin")}</p>
            <GoogleSignInButton callbackURL={`/onboarding?next=${encodeURIComponent(here)}`} />
          </>
        )}
        {user && !athlete && (
          <>
            <p className="text-sm text-muted">{t("needsProfile")}</p>
            <Button href={`/onboarding?next=${encodeURIComponent(here)}`} variant="primary" block>{t("continue")}</Button>
          </>
        )}
        {athlete && status === "removed" && <p role="alert" className="text-sm text-danger">{t("removed")}</p>}
        {athlete && status === null && <JoinButton code={code} />}
      </Card>
    </section>
  );
}
```

`src/app/(athlete)/join/[code]/JoinButton.tsx`: add `import { Button } from "@/components/ui/Button";` and replace the returned JSX with:

```tsx
    <div className="flex flex-col gap-2">
      <Button type="button" variant="primary" block onClick={join} disabled={pending}>{t("join.join")}</Button>
      {error && <p role="alert" className="text-sm text-danger">{t(`errors.${error}`)}</p>}
    </div>
```

- [ ] **Step 4: Profile settings**

`src/app/(athlete)/me/page.tsx`:

```tsx
import { getTranslations } from "next-intl/server";
import { SignOutButton } from "@/components/SignOutButton";
import { Card } from "@/components/ui/Card";
import { isLocale } from "@/i18n/locale";
import { requireAthletePage } from "@/lib/accounts";
import { SettingsForm } from "./SettingsForm";

export default async function MePage() {
  const athlete = await requireAthletePage("/me");
  const t = await getTranslations("me");
  const timeZones = Intl.supportedValuesOf("timeZone");
  return (
    <section className="flex flex-col gap-6 pt-4">
      <h1 className="text-3xl font-bold">{t("title")}</h1>
      <Card className="p-5">
        <SettingsForm
          initial={{ displayName: athlete.displayName, timezone: athlete.timezone, locale: isLocale(athlete.locale) ? athlete.locale : "es" }}
          timeZones={timeZones.includes(athlete.timezone) ? timeZones : [athlete.timezone, ...timeZones]}
        />
      </Card>
      <SignOutButton />
    </section>
  );
}
```

`src/app/(athlete)/me/SettingsForm.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/controls";
import { Field } from "@/components/ui/Field";
import { Segmented } from "@/components/ui/Segmented";
import type { ErrorCode } from "@/lib/training/errors";
import { updateSettingsAction } from "../actions";

type Settings = { displayName: string; timezone: string; locale: "es" | "en" };

export function SettingsForm({ initial, timeZones }: { initial: Settings; timeZones: string[] }) {
  const t = useTranslations();
  const router = useRouter();
  const [form, setForm] = useState(initial);
  const [state, setState] = useState<"idle" | "saving" | "saved" | ErrorCode>("idle");

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setState("saving");
    const r = await updateSettingsAction(form);
    setState(r.ok ? "saved" : r.code);
    if (r.ok) router.refresh();
  }

  return (
    <form onSubmit={save} className="flex flex-col gap-5">
      <Field label={t("me.displayName")}>
        <Input value={form.displayName} maxLength={60} onChange={(e) => setForm({ ...form, displayName: e.target.value })} />
      </Field>
      <Field label={t("me.timezone")}>
        <Select value={form.timezone} onChange={(e) => setForm({ ...form, timezone: e.target.value })}>
          {timeZones.map((tz) => <option key={tz} value={tz}>{tz}</option>)}
        </Select>
      </Field>
      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">{t("me.language")}</span>
        <Segmented label={t("me.language")} value={form.locale} onChange={(locale) => setForm({ ...form, locale })}
          options={[{ value: "es", label: t("me.languages.es") }, { value: "en", label: t("me.languages.en") }]} />
      </div>
      <Button type="submit" variant="primary" block disabled={state === "saving"}>
        {state === "saving" ? t("common.saving") : t("common.save")}
      </Button>
      {state === "saved" && <p role="status" className="text-center text-sm text-success">{t("me.saved")}</p>}
      {state !== "idle" && state !== "saving" && state !== "saved" && <p role="alert" className="text-sm text-danger">{t(`errors.${state}`)}</p>}
    </form>
  );
}
```

- [ ] **Step 5: Verify**

Run: `pnpm exec tsc --noEmit`, `pnpm lint` → clean.
Browser, light and dark, 375 px:
- `/me`: change the language with the segmented control and save. The UI switches language; switch it back to Spanish.
- Open `/join/<code of Strivee-like program>` while enrolled → redirects. Signed out (private tab not needed: just read the page markup through `get_page_text` while signed in) and check that the card renders.
- `/signin` shows the brand, the card and the Google button with the logo. Read it with `read_page`: never click through Google sign-in.

- [ ] **Step 6: Commit**

```bash
git add src/components "src/app/(athlete)"
git commit -m "feat(ui): athlete sign-in, onboarding, join and profile settings on the new primitives

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Coach navigation and program header

**Files:**
- Create: `src/app/coach/CoachNav.tsx`, `src/app/coach/CoachNavLinks.tsx`, `src/app/coach/UserMenu.tsx`, `src/app/coach/programs/[id]/ProgramHeader.tsx`
- Modify: `src/app/coach/layout.tsx` (full rewrite); `src/app/coach/programs/[id]/page.tsx`, `athletes/page.tsx` and `settings/page.tsx` (replace their header markup)

**Interfaces:**
- Consumes: `Brand`, `Avatar`, `Menu`, `navPillClasses`, `useSignOut`.
- Produces: `ProgramHeader({ programId: string; name: string })`.

- [ ] **Step 1: Create the navigation**

`src/app/coach/CoachNavLinks.tsx`:

```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { navPillClasses } from "@/components/ui/Pill";

export function CoachNavLinks() {
  const t = useTranslations("nav");
  const pathname = usePathname();
  const active = pathname === "/coach" || pathname.startsWith("/coach/programs");
  return (
    <nav aria-label={t("main")}>
      <ul className="flex gap-1">
        <li><Link href="/coach" aria-current={active ? "page" : undefined} className={navPillClasses(active)}>{t("programs")}</Link></li>
      </ul>
    </nav>
  );
}
```

`src/app/coach/UserMenu.tsx`:

```tsx
"use client";

import { useTranslations } from "next-intl";
import { useSignOut } from "@/components/SignOutButton";
import { Avatar } from "@/components/ui/Avatar";
import { Menu } from "@/components/ui/Menu";

export function UserMenu({ name, image }: { name: string; image: string | null }) {
  const t = useTranslations();
  const signOut = useSignOut("/coach/signin");
  return (
    <Menu label={`${t("nav.account")}: ${name}`} icon={<Avatar name={name} image={image} />}
      items={[{ label: t("auth.signOut"), onSelect: () => void signOut() }]} />
  );
}
```

`src/app/coach/CoachNav.tsx`:

```tsx
import Link from "next/link";
import { Brand } from "@/components/Brand";
import { CoachNavLinks } from "./CoachNavLinks";
import { UserMenu } from "./UserMenu";

type Props = { user: { name: string; image: string | null } | null; approved: boolean };

export function CoachNav({ user, approved }: Props) {
  return (
    <header className="sticky top-0 z-30 border-b bg-surface">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-8 px-6">
        <Link href="/coach" className="rounded-lg focus-visible:outline-2 focus-visible:outline-foreground"><Brand /></Link>
        {approved && <CoachNavLinks />}
        {user && <div className="ml-auto"><UserMenu name={user.name} image={user.image} /></div>}
      </div>
    </header>
  );
}
```

`src/app/coach/layout.tsx`:

```tsx
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { getCoachByUserId } from "@/lib/training/services/accounts";
import { CoachNav } from "./CoachNav";

export default async function CoachLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  const coach = user ? await getCoachByUserId(prisma, user.id) : null;
  return (
    <>
      <CoachNav user={user && { name: user.name, image: user.image }} approved={coach?.status === "approved"} />
      <main className="mx-auto max-w-7xl px-6 py-8">{children}</main>
    </>
  );
}
```

- [ ] **Step 2: Create `src/app/coach/programs/[id]/ProgramHeader.tsx`**

```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { navPillClasses } from "@/components/ui/Pill";

/** Program name and the Planner / Athletes / Settings pills shared by the three program pages. */
export function ProgramHeader({ programId, name }: { programId: string; name: string }) {
  const t = useTranslations("programs");
  const pathname = usePathname();
  const base = `/coach/programs/${programId}`;
  const tabs = [
    { href: base, label: t("planner") },
    { href: `${base}/athletes`, label: t("roster") },
    { href: `${base}/settings`, label: t("settings") },
  ];
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-3xl font-bold">{name}</h1>
      <nav aria-label={name}>
        <ul className="flex flex-wrap gap-1">
          {tabs.map((tab) => (
            <li key={tab.href}>
              <Link href={tab.href} aria-current={pathname === tab.href ? "page" : undefined} className={navPillClasses(pathname === tab.href)}>
                {tab.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
```

- [ ] **Step 3: Use it on the three program pages**

In `src/app/coach/programs/[id]/page.tsx` replace:

```tsx
      <div className="flex flex-wrap items-baseline gap-4">
        <h1 className="text-2xl font-semibold">{program.name}</h1>
        <Link href={`/coach/programs/${program.id}/athletes`} className="text-sm underline">{t("programs.roster")}</Link>
        <Link href={`/coach/programs/${program.id}/settings`} className="text-sm underline">{t("programs.settings")}</Link>
      </div>
```

with `<ProgramHeader programId={program.id} name={program.name} />` and add `import { ProgramHeader } from "./ProgramHeader";`. (`Link` is still used by the week arrows; Task 11 rewrites this page.)

In `athletes/page.tsx` replace these two lines with `<ProgramHeader programId={program.id} name={program.name} />`:

```tsx
      <Link href={`/coach/programs/${program.id}`} className="text-sm underline">{t("programs.planner")}</Link>
      <h1 className="text-2xl font-semibold">{program.name} · {t("roster.title")}</h1>
```

Then add `import { ProgramHeader } from "../ProgramHeader";` and remove the now unused `import Link from "next/link";`.

In `settings/page.tsx` replace these two lines with `<ProgramHeader programId={program.id} name={program.name} />`:

```tsx
      <Link href={`/coach/programs/${program.id}`} className="text-sm underline">{t("planner")}</Link>
      <h1 className="text-2xl font-semibold">{program.name} · {t("settings")}</h1>
```

Then add `import { ProgramHeader } from "../ProgramHeader";`, remove `import Link from "next/link";`, and remove the `getTranslations` import and the `const t = …` line if nothing else uses them.

- [ ] **Step 4: Verify**

Run: `pnpm exec tsc --noEmit`, `pnpm lint` → clean.
Browser on desktop, light and dark:
- `/coach` shows the sticky nav with the brand, the active "Mis programas" pill and the avatar.
- The avatar menu opens and offers "Cerrar sesión". Do not click it: signing back in is the user's job.
- The three program pages show the pills with the right one active.

- [ ] **Step 5: Commit**

```bash
git add src/app/coach
git commit -m "feat(ui): coach top navigation with avatar menu and program tabs

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Coach programs list, new program, settings and account pages

**Files:**
- Modify (full rewrite): `src/app/coach/page.tsx`, `src/app/coach/programs/new/page.tsx`, `src/app/coach/programs/new/NewProgramForm.tsx`, `src/app/coach/programs/[id]/settings/page.tsx`, `src/app/coach/programs/[id]/settings/ProgramSettingsForm.tsx`, `src/app/coach/pending/page.tsx`, `src/app/coach/signin/page.tsx`
- Modify: `src/app/coach/onboarding/CoachOnboardingRunner.tsx` (return statement)

**Interfaces:**
- Consumes: `Button`, `Card`, `EmptyState`, `Pill`, `Field`, `Input`, `Textarea`, `Segmented`, `ProgramHeader`, `cx`.

- [ ] **Step 1: Programs list** — `src/app/coach/page.tsx`

```tsx
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Plus, Users } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { cx } from "@/components/ui/cx";
import { EmptyState } from "@/components/ui/EmptyState";
import { Pill } from "@/components/ui/Pill";
import { requireCoachPage } from "@/lib/accounts";
import { prisma } from "@/lib/db";
import { listCoachPrograms } from "@/lib/training/services/programs";

export default async function CoachHome() {
  const coach = await requireCoachPage();
  const t = await getTranslations("programs");
  const programs = await listCoachPrograms(prisma, coach.id);
  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-3xl font-bold">{t("title")}</h1>
        <Button href="/coach/programs/new" variant="primary"><Plus size={18} aria-hidden />{t("new")}</Button>
      </div>
      {programs.length === 0 && <EmptyState>{t("empty")}</EmptyState>}
      <ul className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {programs.map((p) => (
          <li key={p.id}>
            <Link href={`/coach/programs/${p.id}`}
              className={cx("flex h-full flex-col gap-3 rounded-2xl border bg-surface p-5 transition hover:border-foreground/30 focus-visible:outline-2 focus-visible:outline-foreground",
                p.archivedAt && "opacity-60")}>
              <span className="text-lg font-bold">{p.name}</span>
              <span className="flex flex-wrap items-center gap-2">
                <Pill>{t(`kinds.${p.kind as "continuous" | "closed"}`)}</Pill>
                {p.archivedAt && <Pill>{t("archived")}</Pill>}
              </span>
              <span className="mt-auto flex items-center gap-1.5 text-sm text-muted">
                <Users size={16} aria-hidden />
                {t("athletes", { count: p._count.enrollments })}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
```

- [ ] **Step 2: New program**

`src/app/coach/programs/new/page.tsx`:

```tsx
import { getTranslations } from "next-intl/server";
import { Card } from "@/components/ui/Card";
import { requireCoachPage } from "@/lib/accounts";
import { addDays, mondayOf, todayIn } from "@/lib/training/dates";
import { NewProgramForm } from "./NewProgramForm";

export default async function NewProgramPage() {
  await requireCoachPage();
  const t = await getTranslations("programs");
  const today = todayIn("UTC");
  const nextMonday = mondayOf(today) === today ? today : addDays(mondayOf(today), 7);
  return (
    <section className="mx-auto flex max-w-xl flex-col gap-6">
      <h1 className="text-3xl font-bold">{t("new")}</h1>
      <Card className="p-6"><NewProgramForm nextMonday={nextMonday} /></Card>
    </section>
  );
}
```

`src/app/coach/programs/new/NewProgramForm.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/Button";
import { Input, Textarea } from "@/components/ui/controls";
import { Field } from "@/components/ui/Field";
import { Segmented } from "@/components/ui/Segmented";
import type { ErrorCode } from "@/lib/training/errors";
import { createProgramAction } from "../../program-actions";

export function NewProgramForm({ nextMonday }: { nextMonday: string }) {
  const t = useTranslations();
  const router = useRouter();
  const [kind, setKind] = useState<"continuous" | "closed">("continuous");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [startDate, setStartDate] = useState(nextMonday);
  const [weeks, setWeeks] = useState("4");
  const [error, setError] = useState<ErrorCode | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    const input = kind === "continuous"
      ? { kind, name, description, startDate }
      : { kind, name, description, weeks: Number(weeks) };
    const r = await createProgramAction(input);
    setPending(false);
    if (r.ok) router.push(`/coach/programs/${r.value.id}`);
    else setError(r.code);
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-5">
      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">{t("programs.kind")}</span>
        <Segmented label={t("programs.kind")} value={kind} onChange={setKind}
          options={(["continuous", "closed"] as const).map((k) => ({ value: k, label: t(`programs.kinds.${k}`) }))} />
        <p className="text-xs text-muted">{t(`programs.kindHelp.${kind}`)}</p>
      </div>
      <Field label={t("programs.name")}>
        <Input required maxLength={80} value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field label={t("programs.description")}>
        <Textarea rows={3} maxLength={500} value={description} onChange={(e) => setDescription(e.target.value)} />
      </Field>
      {kind === "continuous" ? (
        <Field label={t("programs.startDate")}>
          <Input type="date" step={7} min={nextMonday} value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </Field>
      ) : (
        <Field label={t("programs.weeks")}>
          <Input type="number" min={1} max={52} value={weeks} onChange={(e) => setWeeks(e.target.value)} />
        </Field>
      )}
      {error && <p role="alert" className="text-sm text-danger">{t(`errors.${error}`)}</p>}
      <Button type="submit" variant="primary" disabled={pending}>{t("programs.create")}</Button>
    </form>
  );
}
```

- [ ] **Step 3: Program settings**

`src/app/coach/programs/[id]/settings/page.tsx`:

```tsx
import { Card } from "@/components/ui/Card";
import { requireCoachPage } from "@/lib/accounts";
import { orNotFound } from "@/lib/actions";
import { prisma } from "@/lib/db";
import { fromDbDate } from "@/lib/training/dates";
import { getOwnedProgram, publishedWeeks } from "@/lib/training/services/programs";
import { ProgramHeader } from "../ProgramHeader";
import { ProgramSettingsForm } from "./ProgramSettingsForm";

export default async function ProgramSettingsPage({ params }: { params: Promise<{ id: string }> }) {
  const coach = await requireCoachPage();
  const { id } = await params;
  const program = await orNotFound(getOwnedProgram(prisma, coach.id, id));
  const locked = program.kind === "continuous" && (await publishedWeeks(prisma, program.id)).size > 0;
  return (
    <section className="flex flex-col gap-6">
      <ProgramHeader programId={program.id} name={program.name} />
      <Card className="max-w-xl p-6">
        <ProgramSettingsForm
          programId={program.id}
          kind={program.kind as "continuous" | "closed"}
          initial={{
            name: program.name,
            description: program.description ?? "",
            startDate: program.startDate ? fromDbDate(program.startDate) : null,
            weeks: program.weeks,
          }}
          startDateLocked={locked}
          archived={program.archivedAt !== null}
        />
      </Card>
    </section>
  );
}
```

`src/app/coach/programs/[id]/settings/ProgramSettingsForm.tsx`: keep the imports, `Props`, the state, `save` and `archive` exactly as they are, add these imports:

```tsx
import { Button } from "@/components/ui/Button";
import { Input, Textarea } from "@/components/ui/controls";
import { Field } from "@/components/ui/Field";
```

and replace the returned JSX with:

```tsx
    <div className="flex flex-col gap-6">
      <form onSubmit={save} className="flex flex-col gap-5">
        <fieldset disabled={archived} className="flex flex-col gap-5">
          <Field label={t("programs.name")}>
            <Input required maxLength={80} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </Field>
          <Field label={t("programs.description")}>
            <Textarea rows={3} maxLength={500} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </Field>
          {kind === "continuous" ? (
            <Field label={t("programs.startDate")} hint={startDateLocked ? t("programs.startDateLockedHint") : null}>
              <Input type="date" step={7} disabled={startDateLocked} value={form.startDate ?? ""}
                onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
            </Field>
          ) : (
            <Field label={t("programs.weeks")}>
              <Input type="number" min={1} max={52} value={form.weeks} onChange={(e) => setForm({ ...form, weeks: e.target.value })} />
            </Field>
          )}
          <Button type="submit" variant="primary" className="self-start" disabled={state === "saving"}>{t("common.save")}</Button>
        </fieldset>
        {state === "saved" && <p role="status" className="text-sm text-success">{t("me.saved")}</p>}
        {state !== "idle" && state !== "saving" && state !== "saved" && <p role="alert" className="text-sm text-danger">{t(`errors.${state}`)}</p>}
      </form>
      {!archived && (
        <div className="border-t pt-6">
          <Button type="button" variant="danger" onClick={archive}>{t("programs.archive")}</Button>
        </div>
      )}
    </div>
```

- [ ] **Step 4: Pending, onboarding and sign-in**

`src/app/coach/pending/page.tsx`: add `import { Card } from "@/components/ui/Card";` and replace the returned JSX with:

```tsx
    <section className="mx-auto max-w-lg pt-12">
      <Card className="flex flex-col gap-3 p-6">
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <p className="text-[15px] text-muted">{coach.status === "suspended" ? t("suspended") : t("pending")}</p>
      </Card>
    </section>
```

`src/app/coach/onboarding/CoachOnboardingRunner.tsx`: replace the final `return` with:

```tsx
  return error
    ? <p role="alert" className="py-16 text-center text-danger">{t(`errors.${error}`)}</p>
    : <p role="status" className="py-16 text-center text-muted">{t("onboarding.preparing")}</p>;
```

`src/app/coach/signin/page.tsx`:

```tsx
import { getTranslations } from "next-intl/server";
import { GoogleSignInButton } from "@/components/GoogleSignInButton";
import { Card } from "@/components/ui/Card";

export default async function CoachSignInPage() {
  const t = await getTranslations("auth");
  return (
    <section className="mx-auto max-w-sm pt-16">
      <Card className="flex flex-col gap-5 p-6">
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-bold">{t("coachTitle")}</h1>
          <p className="text-[15px] text-muted">{t("coachIntro")}</p>
        </div>
        <GoogleSignInButton callbackURL="/coach/onboarding" />
      </Card>
    </section>
  );
}
```

- [ ] **Step 5: Verify**

Run: `pnpm exec tsc --noEmit`, `pnpm lint` → clean.
Browser on desktop, light and dark:
- `/coach`: program cards show their pills and athlete counts.
- `/coach/programs/new`: switch the kind with the segmented control and check that the help text and the date/weeks field change. Do not submit.
- Settings of "Strength Cycle": edit the description, save, and check that "Guardado" appears; then restore the original text.
- Check that the archive button looks destructive, but do not press it.

- [ ] **Step 6: Commit**

```bash
git add src/app/coach
git commit -m "feat(ui): coach program list, new program, settings and account pages

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Planner board, toolbar and copy dialog

**Files:**
- Create: `src/app/coach/programs/[id]/planner/CopyDialog.tsx`
- Delete: `src/app/coach/programs/[id]/planner/CopyForm.tsx`
- Modify (full rewrite): `src/app/coach/programs/[id]/page.tsx`, `planner/WeekBoard.tsx`, `planner/WeekTools.tsx`, `planner/PlannerBlock.tsx`, `planner/DayTools.tsx`
- Modify: `es.json`, `en.json` (`planner`)

**Interfaces:**
- Consumes: `BlockCard` (`compact`), `Menu`, `Modal`, `IconButton`, `Button`, `Pill`, `Field`, `Input`, `cx`, `ProgramHeader`, `BlockEditor` (unchanged props: `mode`, `block` | `programId` + `dayIndex`, `lifts`, `onClose`).
- Produces: `CopyDialog({ title: string; withDay: boolean; defaultWeek: number; maxWeek: number | null; onCopy: (week: number, day: number | null) => Promise<ActionResult>; onClose: () => void; onDone: () => void })`; `DayMenu({ dayIndex, ctx })`; `AddBlock({ dayIndex, ctx })`.

- [ ] **Step 1: Messages.** In the `"planner"` object of `es.json` change and add these keys (leave the rest as they are):

```json
    "prevWeek": "Semana anterior",
    "nextWeek": "Semana siguiente",
    "addBlock": "Añadir bloque",
    "blockActions": "Acciones del bloque",
    "dayActions": "Acciones del día",
    "weekActions": "Acciones de la semana",
    "blockCount": "{count, plural, one {# bloque} other {# bloques}}",
```

and in `en.json`:

```json
    "prevWeek": "Previous week",
    "nextWeek": "Next week",
    "addBlock": "Add block",
    "blockActions": "Block actions",
    "dayActions": "Day actions",
    "weekActions": "Week actions",
    "blockCount": "{count, plural, one {# block} other {# blocks}}",
```

- [ ] **Step 2: Create `planner/CopyDialog.tsx`** and delete `CopyForm.tsx` (`git rm "src/app/coach/programs/[id]/planner/CopyForm.tsx"`)

```tsx
"use client";

import { useId, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/controls";
import { Field } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";
import type { ActionResult, ErrorCode } from "@/lib/training/errors";

type Props = {
  title: string;
  withDay: boolean;
  defaultWeek: number;
  maxWeek: number | null;
  onCopy: (week: number, day: number | null) => Promise<ActionResult>;
  onClose: () => void;
  onDone: () => void;
};

/** Asks for a target week (and day), 1-based on screen, 0-based to the action. */
export function CopyDialog({ title, withDay, defaultWeek, maxWeek, onCopy, onClose, onDone }: Props) {
  const t = useTranslations();
  const formId = useId();
  const [week, setWeek] = useState(String(defaultWeek + 1));
  const [day, setDay] = useState("1");
  const [error, setError] = useState<ErrorCode | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    const r = await onCopy(Number(week) - 1, withDay ? Number(day) - 1 : null);
    setPending(false);
    if (r.ok) {
      onClose();
      onDone();
    } else {
      setError(r.code);
    }
  }

  return (
    <Modal title={title} closeLabel={t("common.close")} onClose={onClose} size="sm"
      footer={<>
        <Button type="button" onClick={onClose}>{t("common.cancel")}</Button>
        <Button type="submit" form={formId} variant="primary" disabled={pending}>{t("planner.copy")}</Button>
      </>}>
      <form id={formId} onSubmit={submit} className="flex gap-3">
        <Field label={t("planner.targetWeek")} className="flex-1">
          <Input type="number" required min={1} max={maxWeek === null ? undefined : maxWeek + 1} value={week} onChange={(e) => setWeek(e.target.value)} />
        </Field>
        {withDay && (
          <Field label={t("planner.targetDay")} className="flex-1">
            <Input type="number" required min={1} max={7} value={day} onChange={(e) => setDay(e.target.value)} />
          </Field>
        )}
      </form>
      {error && <p role="alert" className="mt-3 text-sm text-danger">{t(`errors.${error}`)}</p>}
    </Modal>
  );
}
```

- [ ] **Step 3: Rewrite `planner/DayTools.tsx`**

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Plus } from "lucide-react";
import { Menu } from "@/components/ui/Menu";
import { duplicateDayAction } from "../../../block-actions";
import { BlockEditor } from "./BlockEditor";
import { CopyDialog } from "./CopyDialog";
import type { PlannerContext } from "./types";

type Props = { dayIndex: number; ctx: PlannerContext };

/** "⋯" on a day column's header: duplicate the whole day. */
export function DayMenu({ dayIndex, ctx }: Props) {
  const t = useTranslations("planner");
  const router = useRouter();
  const [copying, setCopying] = useState(false);
  if (ctx.readOnly) return null;
  return (
    <>
      <Menu className="ml-auto" label={t("dayActions")} items={[{ label: t("duplicateDay"), onSelect: () => setCopying(true) }]} />
      {copying && (
        <CopyDialog title={t("duplicateDay")} withDay defaultWeek={ctx.weekIndex} maxWeek={ctx.maxWeek}
          onCopy={(week, day) => duplicateDayAction({ programId: ctx.programId, fromDay: dayIndex, toDay: week * 7 + (day ?? 0) })}
          onClose={() => setCopying(false)} onDone={() => router.refresh()} />
      )}
    </>
  );
}

/** Dashed "Add block" button at the bottom of a day column. */
export function AddBlock({ dayIndex, ctx }: Props) {
  const t = useTranslations("planner");
  const [adding, setAdding] = useState(false);
  if (ctx.readOnly) return null;
  return (
    <>
      <button type="button" onClick={() => setAdding(true)}
        className="flex items-center justify-center gap-1.5 rounded-xl border-2 border-dashed py-2.5 text-sm font-semibold text-muted transition hover:border-foreground/30 hover:text-foreground focus-visible:outline-2 focus-visible:outline-foreground">
        <Plus size={16} aria-hidden />
        {t("addBlock")}
      </button>
      {adding && <BlockEditor mode="create" programId={ctx.programId} dayIndex={dayIndex} lifts={ctx.lifts} onClose={() => setAdding(false)} />}
    </>
  );
}
```

- [ ] **Step 4: Rewrite `planner/PlannerBlock.tsx`**

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import { BlockCard } from "@/components/training/BlockCard";
import { cx } from "@/components/ui/cx";
import { IconButton } from "@/components/ui/IconButton";
import { Menu } from "@/components/ui/Menu";
import type { ActionResult, ErrorCode } from "@/lib/training/errors";
import { deleteBlockAction, duplicateBlockAction } from "../../../block-actions";
import { BlockEditor } from "./BlockEditor";
import { CopyDialog } from "./CopyDialog";
import type { PlannerBlockData, PlannerContext } from "./types";

/**
 * A planner tile: a click opens the editor (a stretched button under the tools); the drag handle and the
 * "⋯" menu show on hover and focus, always on touch screens.
 */
export function PlannerBlock({ block, ctx }: { block: PlannerBlockData; ctx: PlannerContext }) {
  const t = useTranslations();
  const router = useRouter();
  const [dialog, setDialog] = useState<"edit" | "duplicate" | null>(null);
  const [error, setError] = useState<ErrorCode | null>(null);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: block.id, disabled: ctx.readOnly });
  const heading = block.title ?? block.movement ?? t(`editor.kinds.${block.kind}`);

  async function run(action: Promise<ActionResult>) {
    const r = await action;
    if (r.ok) router.refresh();
    else setError(r.code);
  }

  function remove() {
    const message = block.resultCount > 0
      ? t("planner.deleteConfirmResults", { count: block.resultCount })
      : t("planner.deleteConfirm");
    if (window.confirm(message)) run(deleteBlockAction(block.id));
  }

  return (
    <>
      <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }}
        className={cx("group relative", isDragging && "z-10 opacity-60")}>
        <BlockCard block={block} compact>
          {block.resultCount > 0 && <p className="text-xs text-muted">{t("planner.results", { count: block.resultCount })}</p>}
          {error && <p role="alert" className="text-xs text-danger">{t(`errors.${error}`)}</p>}
        </BlockCard>
        {!ctx.readOnly && (
          <>
            <button type="button" onClick={() => setDialog("edit")} aria-label={`${t("common.edit")}: ${heading}`}
              className="absolute inset-0 rounded-xl focus-visible:outline-2 focus-visible:outline-foreground" />
            <div className="absolute right-1 top-1 flex items-center opacity-0 transition group-focus-within:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100">
              <IconButton label={t("planner.dragHandle")} className="cursor-grab touch-none" {...attributes} {...listeners}>
                <GripVertical size={16} aria-hidden />
              </IconButton>
              <Menu label={t("planner.blockActions")} items={[
                { label: t("planner.duplicate"), onSelect: () => setDialog("duplicate") },
                { label: t("common.delete"), onSelect: remove, danger: true },
              ]} />
            </div>
          </>
        )}
      </div>
      {/* Outside the sortable node: Modal portals anyway, but the editor state belongs to this block. */}
      {dialog === "edit" && <BlockEditor mode="edit" block={block} lifts={ctx.lifts} onClose={() => setDialog(null)} />}
      {dialog === "duplicate" && (
        <CopyDialog title={t("planner.duplicate")} withDay defaultWeek={ctx.weekIndex} maxWeek={ctx.maxWeek}
          onCopy={(week, day) => duplicateBlockAction({ blockId: block.id, targetDayIndex: week * 7 + (day ?? 0) })}
          onClose={() => setDialog(null)} onDone={() => router.refresh()} />
      )}
    </>
  );
}
```

Note: `attributes` from dnd-kit include `role="button"` and `aria-roledescription`. They override nothing that `IconButton` needs, and `IconButton` sets `aria-label` before the spread, so `label` stays the accessible name.

- [ ] **Step 5: Rewrite `planner/WeekBoard.tsx`** (the drag and drop logic is unchanged)

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  DndContext, KeyboardSensor, PointerSensor, closestCorners, pointerWithin, useDroppable, useSensor, useSensors,
  type CollisionDetection, type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { cx } from "@/components/ui/cx";
import { applyMove, dayDropId, isDayDropId, locate, resolveDrop, type Board } from "@/lib/training/board";
import type { ErrorCode } from "@/lib/training/errors";
import { moveBlockAction } from "../../../block-actions";
import { AddBlock, DayMenu } from "./DayTools";
import { PlannerBlock } from "./PlannerBlock";
import type { PlannerBlockData, PlannerContext } from "./types";

type Day = { dayIndex: number; label: string };

/**
 * What is under the pointer wins (a block before its day column); the keyboard has no pointer and falls back
 * to the closest corners. Plain closestCorners misses empty days: their columns stretch to the grid's height.
 */
const collision: CollisionDetection = (args) => {
  const hits = pointerWithin(args);
  if (hits.length === 0) return closestCorners(args);
  const blocks = hits.filter((c) => !isDayDropId(String(c.id)));
  return blocks.length > 0 ? blocks : hits;
};

function boardOf(days: Day[], blocks: PlannerBlockData[]): Board {
  return Object.fromEntries(days.map((d) => [
    d.dayIndex,
    blocks.filter((b) => b.dayIndex === d.dayIndex).sort((a, b) => a.position - b.position).map((b) => b.id),
  ]));
}

function DayColumn({ day, ids, byId, ctx }: { day: Day; ids: string[]; byId: Map<string, PlannerBlockData>; ctx: PlannerContext }) {
  const t = useTranslations("planner");
  const { setNodeRef, isOver } = useDroppable({ id: dayDropId(day.dayIndex), disabled: ctx.readOnly });
  return (
    <div ref={setNodeRef} className={cx("flex min-h-40 min-w-0 flex-col gap-2 rounded-2xl p-1.5 transition-colors", isOver && "bg-surface-2")}>
      <div className="flex min-h-9 items-center gap-2 pl-1.5">
        <h2 className="inline-block truncate text-sm font-bold first-letter:uppercase">{day.label}</h2>
        <span className="rounded-full bg-surface-2 px-2 text-xs font-semibold text-muted">
          <span aria-hidden>{ids.length}</span>
          <span className="sr-only">{t("blockCount", { count: ids.length })}</span>
        </span>
        <DayMenu dayIndex={day.dayIndex} ctx={ctx} />
      </div>
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        {ids.map((id) => <PlannerBlock key={id} block={byId.get(id) as PlannerBlockData} ctx={ctx} />)}
      </SortableContext>
      <AddBlock dayIndex={day.dayIndex} ctx={ctx} />
    </div>
  );
}

export function WeekBoard({ days, blocks, ctx }: { days: Day[]; blocks: PlannerBlockData[]; ctx: PlannerContext }) {
  const te = useTranslations("errors");
  const router = useRouter();
  const [source, setSource] = useState(blocks);
  const [board, setBoard] = useState(() => boardOf(days, blocks));
  const [error, setError] = useState<ErrorCode | null>(null);
  // New server data (after router.refresh) replaces the optimistic board.
  if (source !== blocks) {
    setSource(blocks);
    setBoard(boardOf(days, blocks));
  }
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const byId = new Map(blocks.map((b) => [b.id, b]));

  async function onDragEnd({ active, over }: DragEndEvent) {
    if (!over) return;
    const activeId = String(active.id);
    const from = locate(board, activeId);
    const to = resolveDrop(board, activeId, String(over.id));
    if (!from || !to || (from.day === to.day && from.index === to.index)) return;
    const previous = board;
    setBoard(applyMove(board, activeId, to));
    const r = await moveBlockAction({ blockId: activeId, toDayIndex: to.day, toPosition: to.index });
    if (r.ok) {
      setError(null);
      router.refresh();
    } else {
      setBoard(previous);
      setError(r.code);
    }
  }

  return (
    // A fixed id keeps dnd-kit's generated aria ids identical on the server and the client.
    <DndContext id={`planner-${ctx.programId}`} sensors={sensors} collisionDetection={collision} onDragEnd={onDragEnd}>
      {error && <p role="alert" className="text-sm text-danger">{te(error)}</p>}
      <div className="-mx-6 overflow-x-auto px-6 pb-2">
        <div className="grid min-w-[1050px] grid-cols-7 gap-2">
          {days.map((d) => <DayColumn key={d.dayIndex} day={d} ids={board[d.dayIndex] ?? []} byId={byId} ctx={ctx} />)}
        </div>
      </div>
    </DndContext>
  );
}
```

- [ ] **Step 6: Rewrite `planner/WeekTools.tsx`**

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/Button";
import { Menu } from "@/components/ui/Menu";
import { Pill } from "@/components/ui/Pill";
import type { ActionResult, ErrorCode } from "@/lib/training/errors";
import { duplicateWeekAction } from "../../../block-actions";
import { setProgramPublishedAction, setWeekPublishedAction } from "../../../program-actions";
import { CopyDialog } from "./CopyDialog";
import type { PlannerContext } from "./types";

type Props = { ctx: PlannerContext; kind: "continuous" | "closed"; published: boolean };

export function WeekTools({ ctx, kind, published }: Props) {
  const t = useTranslations("planner");
  const te = useTranslations("errors");
  const router = useRouter();
  const [error, setError] = useState<ErrorCode | null>(null);
  const [copying, setCopying] = useState(false);

  async function run(action: Promise<ActionResult>) {
    const r = await action;
    if (r.ok) router.refresh();
    else setError(r.code);
  }

  const toggle = () => run(kind === "continuous"
    ? setWeekPublishedAction({ programId: ctx.programId, weekIndex: ctx.weekIndex, published: !published })
    : setProgramPublishedAction({ programId: ctx.programId, published: !published }));

  const status = kind === "continuous"
    ? (published ? t("weekPublished") : t("weekDraft"))
    : (published ? t("programPublished") : t("programDraft"));
  const action = kind === "continuous"
    ? (published ? t("unpublishWeek") : t("publishWeek"))
    : (published ? t("unpublishProgram") : t("publishProgram"));

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Pill tone={published ? "success" : "neutral"}>{status}</Pill>
      {!ctx.readOnly && (
        <>
          <Button type="button" size="sm" variant={published ? "secondary" : "primary"} onClick={toggle}>{action}</Button>
          <Menu label={t("weekActions")} items={[{ label: t("duplicateWeek"), onSelect: () => setCopying(true) }]} />
        </>
      )}
      {error && <span role="alert" className="text-sm text-danger">{te(error)}</span>}
      {copying && (
        <CopyDialog title={t("duplicateWeek")} withDay={false} defaultWeek={ctx.weekIndex + 1} maxWeek={ctx.maxWeek}
          onCopy={(week) => duplicateWeekAction({ programId: ctx.programId, fromWeek: ctx.weekIndex, toWeek: week })}
          onClose={() => setCopying(false)} onDone={() => router.refresh()} />
      )}
    </div>
  );
}
```

- [ ] **Step 7: Rewrite `src/app/coach/programs/[id]/page.tsx`**

```tsx
import { getLocale, getTranslations } from "next-intl/server";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { IconButton } from "@/components/ui/IconButton";
import { requireCoachPage } from "@/lib/accounts";
import { orNotFound } from "@/lib/actions";
import { prisma } from "@/lib/db";
import { getDomainData } from "@/lib/domain/repository";
import { formatDay } from "@/lib/format";
import { liftCatalog } from "@/lib/training/barbell";
import { addDays, daysBetween, fromDbDate, todayIn, weekIndexOf } from "@/lib/training/dates";
import type { BarbellSet } from "@/lib/training/schemas";
import { listWeekBlocks } from "@/lib/training/services/blocks";
import { getOwnedProgram, publishedWeeks } from "@/lib/training/services/programs";
import { ProgramHeader } from "./ProgramHeader";
import type { PlannerBlockData, PlannerContext } from "./planner/types";
import { WeekBoard } from "./planner/WeekBoard";
import { WeekTools } from "./planner/WeekTools";

type Params = { params: Promise<{ id: string }>; searchParams: Promise<{ week?: string }> };

/** A week arrow: a link, or a disabled button at the ends of the program. */
function WeekArrow({ to, label, children }: { to: number | null; label: string; children: React.ReactNode }) {
  return to === null
    ? <IconButton label={label} disabled>{children}</IconButton>
    : <IconButton label={label} href={`?week=${to}`}>{children}</IconButton>;
}

export default async function PlannerPage({ params, searchParams }: Params) {
  const coach = await requireCoachPage();
  const { id } = await params;
  const { week } = await searchParams;
  const program = await orNotFound(getOwnedProgram(prisma, coach.id, id));
  const t = await getTranslations();
  const locale = await getLocale();

  const continuous = program.kind === "continuous";
  const startDate = continuous ? fromDbDate(program.startDate as Date) : null;
  const maxWeek = continuous ? null : (program.weeks as number) - 1;
  const clamp = (w: number) => Math.max(0, maxWeek === null ? w : Math.min(w, maxWeek));
  const requested = Number.parseInt(week ?? "", 10);
  const weekIndex = clamp(Number.isInteger(requested)
    ? requested
    : startDate ? weekIndexOf(daysBetween(startDate, todayIn("UTC"))) : 0);

  const [blocks, weeks, domain] = await Promise.all([
    listWeekBlocks(prisma, program.id, weekIndex),
    publishedWeeks(prisma, program.id),
    getDomainData(),
  ]);
  const ctx: PlannerContext = {
    programId: program.id, lifts: liftCatalog(domain.movements), readOnly: program.archivedAt !== null, maxWeek, weekIndex,
  };
  const toData = (b: (typeof blocks)[number]): PlannerBlockData => ({
    id: b.id, dayIndex: b.dayIndex, position: b.position, kind: b.kind as PlannerBlockData["kind"], title: b.title,
    color: b.color, coachingTips: b.coachingTips, videoUrl: b.videoUrl, description: b.description, scoring: b.scoring,
    timeCapSeconds: b.timeCapSeconds, movement: b.movement, sets: b.sets as BarbellSet[] | null,
    instructions: b.instructions, resultCount: b._count.results,
  });
  const dayLabel = (dayIndex: number) => startDate
    ? formatDay(addDays(startDate, dayIndex), locale)
    : t("planner.dayLabel", { week: weekIndexOf(dayIndex) + 1, day: (dayIndex % 7) + 1 });
  const published = continuous ? weeks.has(weekIndex) : program.publishedAt !== null;

  return (
    <section className="flex flex-col gap-6">
      <ProgramHeader programId={program.id} name={program.name} />
      {ctx.readOnly && <p className="rounded-xl bg-surface-2 px-4 py-3 text-sm text-muted">{t("planner.archivedNotice")}</p>}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-1">
          <WeekArrow to={weekIndex > 0 ? weekIndex - 1 : null} label={t("planner.prevWeek")}><ChevronLeft size={20} aria-hidden /></WeekArrow>
          <h2 className="min-w-28 text-center text-lg font-bold">{t("planner.week", { week: weekIndex + 1 })}</h2>
          <WeekArrow to={maxWeek === null || weekIndex < maxWeek ? weekIndex + 1 : null} label={t("planner.nextWeek")}><ChevronRight size={20} aria-hidden /></WeekArrow>
        </div>
        <WeekTools ctx={ctx} kind={program.kind as "continuous" | "closed"} published={published} />
      </div>
      <WeekBoard
        days={Array.from({ length: 7 }, (_, d) => weekIndex * 7 + d).map((dayIndex) => ({ dayIndex, label: dayLabel(dayIndex) }))}
        blocks={blocks.map(toData)}
        ctx={ctx}
      />
    </section>
  );
}
```

- [ ] **Step 8: Verify**

Run: `pnpm exec tsc --noEmit`, `pnpm lint`, `pnpm vitest run tests/training/board.test.ts tests/i18n` → green.
Browser on desktop, light and dark, on "Daily RX":
- Blocks are filled with their pastel or tinted colors.
- On hover the grip and "⋯" appear; clicking the block opens the editor (Task 12 restyles it).
- Drag a block to another day with the mouse, then move it back with the keyboard: focus the grip via Tab, then Space, arrows, Space. Check that both moves persist after a reload.
- "⋯" → Duplicar… opens the copy modal; cancel it.
- Duplicate day and duplicate week open their modals.
- Publish/unpublish shows the right pill.
- An empty day still accepts drops.

- [ ] **Step 9: Commit**

```bash
git add -A "src/app/coach/programs/[id]" src/i18n/messages
git commit -m "feat(ui): planner with filled blocks, hover tools, menus and copy dialog

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: Block editor modal

**Files:**
- Modify (full rewrite): `src/app/coach/programs/[id]/planner/BlockEditor.tsx`
- Modify: `es.json`, `en.json` (`editor` keys, new `colors` object)

**Interfaces:**
- Consumes: `Modal`, `Segmented`, `ColorSwatches`, `Field`, `Input`, `Select`, `Textarea`, `IconButton`, `Button`; the `block-draft` helpers (unchanged).
- Produces: the same `BlockEditor` props as before (`mode`, …, `onClose`).

- [ ] **Step 1: Messages.** In `es.json`'s `"editor"` object change and add:

```json
    "kind": "Tipo de bloque",
    "addSet": "Añadir serie",
    "removeSet": "Quitar la última serie",
    "setNumber": "Serie",
    "value": "Valor",
    "unit": "Unidad",
    "setCount": "{count, plural, one {# serie} other {# series}}",
```

and add a top-level object after `"editor"`:

```json
  "colors": {
    "neutral": "Gris",
    "red": "Rojo",
    "orange": "Naranja",
    "yellow": "Amarillo",
    "green": "Verde",
    "blue": "Azul",
    "purple": "Morado"
  },
```

In `en.json`:

```json
    "kind": "Block type",
    "addSet": "Add set",
    "removeSet": "Remove the last set",
    "setNumber": "Set",
    "value": "Value",
    "unit": "Unit",
    "setCount": "{count, plural, one {# set} other {# sets}}",
```

```json
  "colors": {
    "neutral": "Gray",
    "red": "Red",
    "orange": "Orange",
    "yellow": "Yellow",
    "green": "Green",
    "blue": "Blue",
    "purple": "Purple"
  },
```

- [ ] **Step 2: Rewrite `BlockEditor.tsx`**

```tsx
"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { ColorSwatches } from "@/components/ui/ColorSwatches";
import { Input, Select, Textarea } from "@/components/ui/controls";
import { Field } from "@/components/ui/Field";
import { IconButton } from "@/components/ui/IconButton";
import { Modal } from "@/components/ui/Modal";
import { Segmented } from "@/components/ui/Segmented";
import { draftFromBlock, draftToInput, emptyDraft, type BlockDraft, type DraftSet } from "@/lib/training/block-draft";
import type { ErrorCode } from "@/lib/training/errors";
import { BLOCK_COLORS, Scoring, type BlockColor } from "@/lib/training/schemas";
import type { LiftGroup } from "@/lib/training/barbell";
import { createBlockAction, updateBlockAction } from "../../../block-actions";
import type { PlannerBlockData } from "./types";

type Props =
  | { mode: "create"; programId: string; dayIndex: number; lifts: LiftGroup[]; onClose: () => void }
  | { mode: "edit"; block: PlannerBlockData; lifts: LiftGroup[]; onClose: () => void };

const th = "px-3 py-2 font-semibold";

export function BlockEditor(props: Props) {
  const t = useTranslations();
  const router = useRouter();
  const formId = useId();
  const locked = props.mode === "edit" && props.block.resultCount > 0;
  const [draft, setDraft] = useState<BlockDraft>(props.mode === "edit" ? draftFromBlock(props.block) : emptyDraft("custom"));
  const [error, setError] = useState<ErrorCode | null>(null);
  const [pending, setPending] = useState(false);
  const set = (patch: Partial<BlockDraft>) => setDraft((d) => ({ ...d, ...patch }));
  const setRow = (i: number, patch: Partial<DraftSet>) =>
    set({ sets: draft.sets.map((s, j) => (j === i ? { ...s, ...patch } : s)) });

  function switchKind(kind: BlockDraft["kind"]) {
    if (kind === draft.kind) return;
    setDraft({ ...emptyDraft(kind), title: draft.title, color: draft.color, coachingTips: draft.coachingTips, videoUrl: draft.videoUrl });
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    const block = draftToInput(draft);
    const r = props.mode === "edit"
      ? await updateBlockAction({ blockId: props.block.id, block })
      : await createBlockAction({ programId: props.programId, dayIndex: props.dayIndex, block });
    setPending(false);
    if (r.ok) {
      props.onClose();
      router.refresh();
    } else {
      setError(r.code);
    }
  }

  return (
    <Modal title={props.mode === "edit" ? t("editor.editBlock") : t("editor.newBlock")} closeLabel={t("common.close")} onClose={props.onClose}
      footer={<>
        {error && <p role="alert" className="mr-auto text-sm text-danger">{t(`errors.${error}`)}</p>}
        <Button type="button" onClick={props.onClose}>{t("common.cancel")}</Button>
        <Button type="submit" form={formId} variant="primary" disabled={pending}>{pending ? t("common.saving") : t("common.save")}</Button>
      </>}>
      <form id={formId} onSubmit={save} className="flex flex-col gap-5">
        <Segmented label={t("editor.kind")} value={draft.kind} onChange={switchKind}
          options={(["custom", "barbell"] as const).map((k) => ({ value: k, label: t(`editor.kinds.${k}`), disabled: locked && draft.kind !== k }))} />
        <Field label={t("editor.title")}>
          <Input maxLength={120} value={draft.title} onChange={(e) => set({ title: e.target.value })} />
        </Field>

        {draft.kind === "custom" ? (
          <>
            <Field label={t("editor.description")}>
              <Textarea required rows={8} maxLength={5000} value={draft.description} onChange={(e) => set({ description: e.target.value })} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t("editor.scoring")} hint={locked ? t("editor.scoringLockedHint") : null}>
                <Select disabled={locked} value={draft.scoring} onChange={(e) => set({ scoring: e.target.value as BlockDraft["scoring"] })}>
                  {Scoring.options.map((s) => <option key={s} value={s}>{t(`block.scoring.${s}`)}</option>)}
                </Select>
              </Field>
              {draft.scoring === "for_time" && (
                <Field label={t("editor.timeCap")}>
                  <Input type="number" min={1} max={120} step="0.5" value={draft.timeCapMinutes} onChange={(e) => set({ timeCapMinutes: e.target.value })} />
                </Field>
              )}
            </div>
          </>
        ) : (
          <>
            <Field label={t("editor.movement")}>
              <Select required value={draft.movement} onChange={(e) => set({ movement: e.target.value })}>
                <option value="" disabled>—</option>
                {props.lifts.map((g) => (
                  <optgroup key={g.pattern} label={t(`patterns.${g.pattern}`)}>
                    {g.movements.map((m) => <option key={m} value={m}>{m}</option>)}
                  </optgroup>
                ))}
              </Select>
            </Field>
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1.5 text-sm font-medium">{t("editor.sets")}</legend>
              <div className="overflow-hidden rounded-xl border">
                <table className="w-full text-sm">
                  <thead className="bg-surface-2 text-left text-xs text-muted">
                    <tr>
                      <th scope="col" className={th}>{t("editor.setNumber")}</th>
                      <th scope="col" className={th}>{t("editor.reps")}</th>
                      <th scope="col" className={th}>{t("editor.value")}</th>
                      <th scope="col" className={th}>{t("editor.unit")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {draft.sets.map((s, i) => (
                      <tr key={i} className="border-t">
                        <td className="px-3 py-1.5 font-semibold text-muted">#{i + 1}</td>
                        <td className="py-1.5 pr-2">
                          <Input compact className="w-full" type="number" min={1} max={100} aria-label={`${t("editor.reps")} #${i + 1}`}
                            value={s.reps} onChange={(e) => setRow(i, { reps: e.target.value })} />
                        </td>
                        <td className="py-1.5 pr-2">
                          <Input compact className="w-full" type="number" min={0} step="0.5" aria-label={`${t("editor.value")} #${i + 1}`}
                            value={s.value} onChange={(e) => setRow(i, { value: e.target.value })} />
                        </td>
                        <td className="py-1.5 pr-3">
                          <Select compact className="w-full" aria-label={`${t("editor.unit")} #${i + 1}`} value={s.mode}
                            onChange={(e) => setRow(i, { mode: e.target.value as DraftSet["mode"] })}>
                            <option value="percent">{t("editor.percent")}</option>
                            <option value="kg">{t("editor.kg")}</option>
                          </Select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex items-center gap-2">
                <IconButton label={t("editor.removeSet")} disabled={draft.sets.length <= 1} onClick={() => set({ sets: draft.sets.slice(0, -1) })}>
                  <Minus size={16} aria-hidden />
                </IconButton>
                <span className="min-w-20 text-center text-sm font-semibold">{t("editor.setCount", { count: draft.sets.length })}</span>
                <IconButton label={t("editor.addSet")} disabled={draft.sets.length >= 20}
                  onClick={() => set({ sets: [...draft.sets, { ...draft.sets[draft.sets.length - 1] }] })}>
                  <Plus size={16} aria-hidden />
                </IconButton>
              </div>
            </fieldset>
            <Field label={t("editor.instructions")}>
              <Textarea rows={3} maxLength={2000} value={draft.instructions} onChange={(e) => set({ instructions: e.target.value })} />
            </Field>
          </>
        )}

        <Field label={t("editor.coachingTips")}>
          <Textarea rows={3} maxLength={2000} value={draft.coachingTips} onChange={(e) => set({ coachingTips: e.target.value })} />
        </Field>
        <Field label={t("editor.videoUrl")}>
          <Input type="url" placeholder="https://" value={draft.videoUrl} onChange={(e) => set({ videoUrl: e.target.value })} />
        </Field>
        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium">{t("editor.color")}</span>
          <ColorSwatches label={t("editor.color")} colors={BLOCK_COLORS} value={draft.color}
            onChange={(c) => set({ color: c as BlockColor })} colorLabel={(c) => t(`colors.${c as BlockColor}`)} />
        </div>
      </form>
    </Modal>
  );
}
```

- [ ] **Step 3: Verify**

Run: `pnpm exec tsc --noEmit`, `pnpm lint`, `pnpm vitest run tests/training/block-draft.test.ts tests/i18n` → green.
Browser on desktop, light and dark:
- Open "+ Añadir bloque" and switch the kind with the segmented control.
- Barbell: pick a movement, use −/+ on the sets and edit a row; Custom: write a description.
- Pick a color and save; the new block appears in that color. Then delete it through its menu.
- Edit an existing block using only the keyboard (Tab to the tile, Enter, Tab through the fields, Esc closes it, and focus returns to the tile).
- A block with results keeps the other kind disabled.

- [ ] **Step 4: Commit**

```bash
git add "src/app/coach/programs/[id]/planner/BlockEditor.tsx" src/i18n/messages
git commit -m "feat(ui): block editor in a dialog with segmented kind, sets table and color swatches

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 13: Athletes (roster) page

**Files:**
- Modify (full rewrite): `src/app/coach/programs/[id]/athletes/page.tsx`, `InviteLink.tsx`, `RosterRow.tsx`
- Modify: `es.json`, `en.json` (`roster`)

**Interfaces:**
- Consumes: `ProgramHeader`, `Card`, `EmptyState`, `Pill`, `Avatar`, `Button`, `Input`, `cx`.
- Produces: `RosterRow` now renders a `<tr>`. Its `joined` prop is the bare formatted date.

- [ ] **Step 1: Messages.** In `es.json`'s `"roster"` remove `"joined"` and add:

```json
    "athlete": "Atleta",
    "since": "Desde",
    "status": "Estado",
    "actions": "Acciones",
    "activeBadge": "Activo",
```

In `en.json`'s `"roster"` remove `"joined"` and add:

```json
    "athlete": "Athlete",
    "since": "Since",
    "status": "Status",
    "actions": "Actions",
    "activeBadge": "Active",
```

Run `grep -rn 'roster.joined\|t("joined"' src` after Step 3: no matches.

- [ ] **Step 2: Rewrite `InviteLink.tsx`**

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Check, Copy, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/controls";
import type { ErrorCode } from "@/lib/training/errors";
import { regenerateInviteAction } from "../../../program-actions";

export function InviteLink({ programId, url, readOnly }: { programId: string; url: string; readOnly: boolean }) {
  const t = useTranslations();
  const router = useRouter();
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<ErrorCode | null>(null);

  async function copy() {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function regenerate() {
    if (!window.confirm(t("roster.regenerateConfirm"))) return;
    const r = await regenerateInviteAction(programId);
    if (r.ok) router.refresh();
    else setError(r.code);
  }

  return (
    <Card className="flex flex-col gap-3 p-5">
      <span className="text-sm font-semibold">{t("roster.inviteLink")}</span>
      <div className="flex flex-wrap items-center gap-2">
        <Input readOnly value={url} aria-label={t("roster.inviteLink")} onFocus={(e) => e.currentTarget.select()} className="min-w-0 flex-1 font-mono" />
        <Button type="button" variant="primary" onClick={copy}>
          {copied ? <Check size={18} aria-hidden /> : <Copy size={18} aria-hidden />}
          {copied ? t("roster.copied") : t("roster.copy")}
        </Button>
        {!readOnly && (
          <Button type="button" variant="ghost" onClick={regenerate}><RefreshCw size={16} aria-hidden />{t("roster.regenerate")}</Button>
        )}
      </div>
      {error && <p role="alert" className="text-sm text-danger">{t(`errors.${error}`)}</p>}
    </Card>
  );
}
```

- [ ] **Step 3: Rewrite `RosterRow.tsx`**

```tsx
"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { cx } from "@/components/ui/cx";
import { Pill } from "@/components/ui/Pill";
import { removeAthleteAction, restoreAthleteAction } from "../../../roster-actions";

type Props = { enrollmentId: string; name: string; joined: string; removed: boolean; resultsHref: string };

export function RosterRow({ enrollmentId, name, joined, removed, resultsHref }: Props) {
  const t = useTranslations("roster");
  const router = useRouter();

  async function toggle() {
    if (!removed && !window.confirm(t("removeConfirm"))) return;
    const r = removed ? await restoreAthleteAction(enrollmentId) : await removeAthleteAction(enrollmentId);
    if (r.ok) router.refresh();
  }

  return (
    <tr className={cx("border-t", removed && "opacity-60")}>
      <td className="px-4 py-3">
        <span className="flex items-center gap-3"><Avatar name={name} /><span className="font-semibold">{name}</span></span>
      </td>
      <td className="px-4 py-3 text-muted">{joined}</td>
      <td className="px-4 py-3"><Pill tone={removed ? "neutral" : "success"}>{removed ? t("removedBadge") : t("activeBadge")}</Pill></td>
      <td className="px-4 py-3">
        <span className="flex justify-end gap-2">
          <Button href={resultsHref} variant="ghost" size="sm">{t("results")}</Button>
          <Button type="button" size="sm" variant={removed ? "secondary" : "danger"} onClick={toggle}>{removed ? t("restore") : t("remove")}</Button>
        </span>
      </td>
    </tr>
  );
}
```

- [ ] **Step 4: Rewrite `athletes/page.tsx`**

```tsx
import { getLocale, getTranslations } from "next-intl/server";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { requireCoachPage } from "@/lib/accounts";
import { orNotFound } from "@/lib/actions";
import { prisma } from "@/lib/db";
import { formatDay } from "@/lib/format";
import { fromDbDate } from "@/lib/training/dates";
import { listRoster } from "@/lib/training/services/enrollments";
import { getOwnedProgram } from "@/lib/training/services/programs";
import { ProgramHeader } from "../ProgramHeader";
import { InviteLink } from "./InviteLink";
import { RosterRow } from "./RosterRow";

const th = "px-4 py-3";

export default async function RosterPage({ params }: { params: Promise<{ id: string }> }) {
  const coach = await requireCoachPage();
  const { id } = await params;
  const program = await orNotFound(getOwnedProgram(prisma, coach.id, id));
  const roster = await listRoster(prisma, coach.id, program.id);
  const t = await getTranslations();
  const locale = await getLocale();
  const base = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
  return (
    <section className="flex flex-col gap-6">
      <ProgramHeader programId={program.id} name={program.name} />
      <InviteLink programId={program.id} url={`${base}/join/${program.inviteCode}`} readOnly={program.archivedAt !== null} />
      {program.kind === "closed" && !program.publishedAt && (
        <p data-color="yellow" className="rounded-xl bg-(--block-fill) px-4 py-3 text-sm text-(--block-ink)">{t("roster.notPublishedHint")}</p>
      )}
      {roster.length === 0 ? <EmptyState>{t("roster.empty")}</EmptyState> : (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead className="bg-surface-2 text-left text-xs font-semibold uppercase tracking-wide text-muted">
              <tr>
                <th scope="col" className={th}>{t("roster.athlete")}</th>
                <th scope="col" className={th}>{t("roster.since")}</th>
                <th scope="col" className={th}>{t("roster.status")}</th>
                <th scope="col" className={th}><span className="sr-only">{t("roster.actions")}</span></th>
              </tr>
            </thead>
            <tbody>
              {roster.map((e) => (
                <RosterRow key={e.id} enrollmentId={e.id} name={e.athlete.displayName}
                  joined={formatDay(fromDbDate(e.joinedAt), locale, { day: "numeric", month: "short", year: "numeric" })}
                  removed={e.removedAt !== null} resultsHref={`/coach/programs/${program.id}/athletes/${e.athleteId}`} />
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </section>
  );
}
```

- [ ] **Step 5: Verify**

Run: `pnpm exec tsc --noEmit`, `pnpm vitest run tests/i18n` → green.
Browser on desktop, light and dark, on "Daily RX" → Atletas:
- The invite card shows the link; Copiar switches to Copiado.
- The table shows the athlete with an avatar, the date and an "Activo" pill.
- Quitar → confirm → the row shows "Quitado". Restaurar brings it back. This is the same flow as the phase 1 verification, so it is safe on the dev data.
- On "Strength Cycle" (closed): check the yellow hint while it is unpublished, but do not unpublish it just to see it unless it is republished right after.

- [ ] **Step 6: Commit**

```bash
git add "src/app/coach/programs/[id]/athletes" src/i18n/messages
git commit -m "feat(ui): roster as a table with avatars and status pills, invite link card

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 14: Engine screens adopt the tokens

**Files:**
- Modify: `src/app/(athlete)/tailor/page.tsx`, `TailorClient.tsx`, `ClarifyStep.tsx`, `ResultView.tsx`; `src/app/(athlete)/profile/page.tsx`, `ProfileForm.tsx`; `src/components/WorkoutView.tsx`

**Interfaces:**
- Consumes: `controlClasses`, `chipClasses`, `buttonClasses`, `cx`.

The engine screens keep their layout (spec §4); only their class strings change. Apply these replacements exactly:

| Find | Replace with |
|------|--------------|
| `const field = "rounded border px-2 py-1 text-sm";` | `const field = controlClasses(true);` plus `import { controlClasses } from "@/components/ui/controls";` |
| `` const chip = (on: boolean) => `rounded border px-3 py-1 text-sm ${on ? "bg-black text-white" : ""}`; `` | `const chip = chipClasses;` plus `import { chipClasses } from "@/components/ui/Pill";` |
| `className="rounded bg-black px-4 py-2 text-white"` and `className="w-fit rounded bg-black px-4 py-2 text-white disabled:opacity-50"` | `className={buttonClasses({ variant: "primary", className: "w-fit" })}` plus `import { buttonClasses } from "@/components/ui/Button";` |
| `className="rounded bg-black px-4 py-1 text-sm text-white disabled:opacity-50"` | `className={buttonClasses({ variant: "primary", size: "sm" })}` |
| `className="text-sm underline"` on a `<button>` | `className={buttonClasses({ variant: "ghost", size: "sm", className: "w-fit" })}` |
| `className="text-sm underline"` on an `<a>`/`Link` | `className="text-sm font-semibold underline underline-offset-2"` |
| `rounded border px-3 py-1 text-sm` (any remaining control) | `${controlClasses(true)}` |
| `text-neutral-500`, `text-neutral-600`, `text-neutral-700` | `text-muted` |
| `text-red-700` | `text-danger` |
| `text-amber-800` | `text-(--block-ink)` |
| `rounded border border-amber-300 bg-amber-50 p-3` (on the element: also add `data-color="yellow"`) | `rounded-xl bg-(--block-fill) p-3` |
| `rounded border bg-white p-2` | `rounded-xl border bg-surface p-2 shadow-lg` |
| `rounded border p-2` | `rounded-xl bg-surface-2 p-2` |
| `rounded border p-3` (WorkoutView block) | `rounded-2xl border bg-surface p-4` |
| `rounded bg-neutral-100 px-2 text-xs` | `rounded-full bg-surface-2 px-2 text-xs font-semibold text-muted` |
| `text-xl font-semibold` (page `<h1>`) | `text-3xl font-bold` |

- [ ] **Step 1: Apply the table file by file.** After each file, check `pnpm exec tsc --noEmit`.

- [ ] **Step 2: Gate on leftover palette classes**

Run: `grep -rnE "neutral-[0-9]|bg-white|bg-black|text-white|text-red-[0-9]|text-green-[0-9]|text-amber-[0-9]|bg-amber-[0-9]|border-black|border-amber" src`
Expected: no output. Fix every hit with the token that matches its role, even outside the engine screens.

- [ ] **Step 3: Verify**

Run: `pnpm exec tsc --noEmit`, `pnpm lint`, `pnpm test` → green.
Browser, light and dark:
- `/tailor` and `/profile` render readable controls and chips.
- Do not run a tailoring request: it calls Gemini and spends quota. Check rendering only.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(athlete)/tailor" "src/app/(athlete)/profile" src/components/WorkoutView.tsx
git commit -m "feat(ui): engine screens on theme tokens

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 15: Full verification and pull request

**Files:** none new, apart from fixes found during verification.

- [ ] **Step 1: Full local checks**

Run: `pnpm exec tsc --noEmit && pnpm lint && pnpm test && pnpm build`
Expected: all green; the test count is the previous 390 plus the new `tests/ui/*`, format and routes cases.

- [ ] **Step 2: Browser walkthrough.** Run each flow in light and dark (`resize_window colorScheme`), athlete flows at 375 px and coach flows at desktop width. Check `read_console_messages` (onlyErrors) and `preview_logs` level error after each.
1. Coach: `/coach` list → program → planner (blocks, hover tools, menus).
2. Planner: create a block in the editor (custom and barbell), change its color, drag it with the mouse and with the keyboard, duplicate the day into the next week through the dialog, publish and unpublish the week, then delete the test blocks so the dev data matches its starting state.
3. Closed program: check the unpublished hint on Atletas if it applies; leave it published.
4. Athlete: day view (header, strip, cards, coaching tips, video button), another day, the empty state, the calendar, and the tab bar keeping `?program`.
5. Athlete: `/me`; save without changes.
6. Coach: roster remove → athlete sees the "removed" state on `/join/<code>` → restore.
7. Sign-in pages (`/signin`, `/coach/signin`) read with `read_page` only.

- [ ] **Step 3: Screenshots for the user.** Capture the athlete day view, calendar, `/me`, the coach program list, the planner, the editor and the roster, each in light and dark. Send them with `SendUserFile` next to the matching file from `C:\Dev\strivee images`.

- [ ] **Step 4: Push and open the PR**

```bash
git push -u origin feat/ui-restyle
gh pr create --base main --title "UI restyle: Strivee look in light and dark" --body "$(cat <<'EOF'
## Summary
- Light and dark themes that follow the OS, on semantic CSS tokens; block colors as tokens resolved from `data-color`.
- Own primitives in `src/components/ui` (Button, Card, Field/controls, Segmented, ColorSwatches, Modal on `<dialog>`, Menu, Pill, Avatar), `lucide-react` icons and Inter.
- Athlete: black header with the week strip, striped block cards with tinted coaching tips, a bottom tab bar, a calendar grid.
- Coach: top nav with pills and avatar menu, program tabs, a planner with filled blocks and hover tools, the block editor and copy dialogs in modals, the roster as a table.
- No changes to services, actions or queries.

Spec: `docs/specs/training-tailor-ui-restyle-design.md` · Plan: `docs/plans/training-tailor-ui-restyle-plan.md`

## Test plan
- [x] New unit tests for tokens, primitives, radio groups, modal and menu; full suite, tsc, lint and build green
- [x] Phase 1 flows in the browser in light and dark, mobile (athlete) and desktop (coach)
- [x] Planner drag and drop with mouse and keyboard; block editor keyboard-only

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Then bind the PR in the app (`get_status`, then `bind_pr` if needed). Report the CI status the app shows, without polling.
