# Training Tailor — UI Restyle Design (Strivee look, light and dark)

> Revision 1 (2026-10-08). Restyles the screens shipped in coaching phase 1 so the app looks and
> feels like Strivee (references: `C:\Dev\strivee images`, not in the repo). Coaching phase 2
> (results, leaderboard, PRs) starts after this and is built directly in the new style.

## Problem

Phase 1 shipped working screens with placeholder styling: plain borders, underlined links,
light-only. Athletes and coaches compare the product with Strivee, whose UI is clean, card-based
and follows the system theme. The restyle closes that gap before phase 2 adds more screens, so
those are not built twice.

## Decisions (locked)

| # | Decision |
|---|----------|
| 1 | Both apps (athlete and coach) support **light and dark**. |
| 2 | The theme follows the **operating system only** (`prefers-color-scheme`). No in-app selector, no cookie, no DB field. |
| 3 | Scope is **style plus presentation patterns on existing screens**. No new screens, no placeholder tabs for future features. |
| 4 | Base components are **our own**: Tailwind 4 plus CSS variables; the modal is the native `<dialog>`. No shadcn/Radix/Headless UI. |
| 5 | Icons: `lucide-react`. Font: Inter through `next/font/google` (self-hosted at build time). |
| 6 | Logic, server actions, data fetching and drag and drop do not change. |

## Out of scope

Manual theme selector; new screens (PRs, leaderboard, Box, Note, reports, finances); planner
on mobile; i18n changes beyond the labels the new UI needs (tab bar, menus, aria labels).

## 1. Tokens and themes

`src/app/globals.css` defines semantic CSS variables on `:root` and redefines them under
`@media (prefers-color-scheme: dark)`. `color-scheme: light dark` replaces the current
`color-scheme: light`, so native controls (select popups, date pickers) follow the theme.
`@theme inline` exposes them to Tailwind (`bg-surface`, `text-muted`, `border-border`, …).

| Token | Light | Dark | Use |
|-------|-------|------|-----|
| `background` | `#f5f5f5` | `#111111` | Page |
| `surface` | `#ffffff` | `#1e1e1e` | Cards, modal, menus |
| `surface-2` | `#f0f0f0` | `#2c2c2c` | Inputs, segmented track, secondary buttons |
| `border` | `#e5e5e5` | `#2e2e2e` | Hairlines, card borders |
| `foreground` | `#111111` | `#f5f5f5` | Body text |
| `muted` | `#666666` | `#a3a3a3` | Secondary text, inactive tabs |
| `primary` / `on-primary` | `#111111` / `#ffffff` | `#f5f5f5` / `#111111` | Primary button, active pill |
| `chrome` / `on-chrome` | `#000000` / `#ffffff` | `#000000` / `#ffffff` | Athlete header (black in both themes) |
| `danger`, `success` | red-600, green-700 | red-400, green-400 | Errors, destructive actions, published state |

The exact hex values may be tuned during implementation for contrast (WCAG AA for body and
muted text against `background` and `surface`); the token names and roles are fixed.

**Block colors.** Each of the seven `BLOCK_COLORS` (neutral, red, orange, yellow, green, blue,
purple) gets three variables per theme:

- `--color-block-<c>-stripe`: the athlete card's left stripe. Pastel in light, saturated in dark.
- `--color-block-<c>-fill`: the planner block's background. Pastel in light, a dark tint in dark.
- `--color-block-<c>-ink`: text and accents on a tinted surface (the coaching tips button).

Components do not pick per-color classes. A block element carries `data-color="<c>"`, and CSS
maps `[data-color="<c>"]` to the generic `--block-stripe`, `--block-fill` and `--block-ink`,
which utilities read (`bg-(--block-fill)`). Unknown colors fall back to `neutral`.
`src/components/training/colors.ts` shrinks to that fallback helper (`blockColor(color)`);
`BLOCK_BORDER` and `BLOCK_SWATCH` go away.

**Type.** Inter via `next/font/google` in the root layout, exposed as `--font-sans`. Page titles
`text-3xl font-bold` (athlete) / `text-2xl font-semibold` (coach); body 15–16 px; block
descriptions `leading-relaxed`.

**Radii.** Cards and modal 16 px (`rounded-2xl`), inputs and buttons 12 px (`rounded-xl`),
pills and the active week day fully rounded or 12 px as in the references.

## 2. Base components

`src/components/ui/`, one file each. They hold no domain state and do not call next-intl: text
comes in through props, so they are testable without providers.

- **`Button`**: variants `primary`, `secondary` (`surface-2`), `ghost` (text only), `danger`,
  `tinted` (`--block-ink` on a translucent `--block-fill`, for actions inside a block card);
  sizes `sm` and `md`; `block` (full width). With `href` it renders a Next `Link` with the same
  classes. Forwards the rest of the native props.
- **`Card`**: `surface`, 16 px radius, `border`. Prop `stripe` adds the left block stripe (reads
  `--block-stripe`, so the caller sets `data-color`).
- **`Field`**: label, control, optional hint and error, wired with `htmlFor`/`aria-describedby`.
- **`Input`, `Textarea`, `Select`**: filled `surface-2`, no visible border until focus (focus ring
  in `foreground`), 12 px radius. Plain wrappers over the native elements.
- **`Segmented`**: `role="radiogroup"` of `role="radio"` buttons; arrow keys move and select,
  disabled options are skipped; the selected option is a raised `surface` (light) / lighter gray
  (dark) chip on a `surface-2` track.
- **`Modal`**: wraps `<dialog>` and calls `showModal()` on mount. Header with title and a close
  button (✕, `aria-label` from props), scrollable body, sticky footer slot. Esc and a click on
  the backdrop call `onClose`. Focus returns to the element that was focused before opening.
  Rendered through a portal to `document.body` (the planner opens it from transformed sortable
  nodes).
- **`Menu`**: a "⋯" trigger (`IconButton`) and a popup list of actions. Opens on click, closes
  on Esc, on outside click and after choosing an item; `aria-haspopup`/`aria-expanded` on the
  trigger; arrow keys move between items.
- **`IconButton`**: square ghost button around a lucide icon; `aria-label` is required.
- **`Pill`**: rounded chip for states (Published / Draft, Continuous / Closed). Tones `neutral`,
  `success`, `inverted` (active nav item).
- **`ColorSwatches`**: the seven block colors as circles with a ring on the selected one;
  `role="radiogroup"`, labels from props.

## 3. Navigation and layouts

- **`AthleteHeader`** (`src/app/(athlete)/AthleteHeader.tsx`): full-bleed `chrome` bar on the
  day view. Program name centered and bold; with several programs it is a native `<select>`
  styled as the title (replaces `ProgramSelect`). Below it the `WeekStrip`: weekday abbreviation
  over the day number, the selected day framed with a rounded `on-chrome` border, today in bold,
  days with published blocks marked with a dot.
- **`AthleteTabBar`** (replaces `AthleteNav`): fixed bottom bar on `surface` with a top hairline,
  three items with icon and label: Today (`/`), Calendar (`/calendar`), Profile (`/me`). The
  active item in `foreground`, the rest `muted`. Links keep the current `program` query parameter
  when present. Padding includes `env(safe-area-inset-bottom)`.
- **Athlete layout**: `background` page, `max-w-md` column, bottom padding clears the tab bar.
  The day view puts `AthleteHeader` outside the padded column so it spans the full width.
- **`CoachNav`** (replaces the header in `coach/layout.tsx`): `surface` bar with a hairline; brand
  at the left, section links as pills (active one `inverted`, like Strivee's black "Planning"),
  avatar (`session.user.image`, initials fallback) with a `Menu` holding sign out at the right.
- **Coach layout**: `background` page, `max-w-7xl` content.

## 4. Screens

### Athlete (mobile first)

- **Today (`/`)**: `AthleteHeader`; the long date in `muted` and a "Today" ghost button when
  another day is selected; one `Card stripe` per block: bold title, scoring line in small caps
  `muted`, description `leading-relaxed whitespace-pre-wrap`; barbell sets as a list. Coaching
  tips become a full-width `Button tinted` that expands the text below it; the video link is a
  `secondary` button. Empty states ("nothing published", "starts on …", "finished", no
  programs) are a centered `Card` with `muted` text.
- **Calendar**: month title with previous/next `IconButton`s; 7-column grid of rounded day cells,
  today framed, days with blocks marked with a dot; each cell links to that day as today.
- **Me (`/me`) and onboarding**: forms built from `Field` and the filled inputs; `Segmented` for
  choices with three options or fewer; full-width `primary` button at the bottom of the form.
- **Join (`/join/[code]`)**: centered `Card` with program and coach name and a `primary` button;
  the removed and closed states use the same card with `muted` text.
- **Sign-in**: centered brand and the Google button styled as `secondary` with the Google mark.
- **Engine (`/tailor`, `/profile`)**: adopt tokens and base components only; no layout changes.

### Coach (desktop)

- **My programs (`/coach`)**: page title plus a `primary` "New program" button; grid of program
  `Card`s with name, kind `Pill`, publication state and athlete count; archived programs in a
  separate muted section as today.
- **Program header** (shared by planner, athletes and settings): program name; pill tabs
  Planner / Athletes / Settings (replace the underlined links).
- **Planner**:
  - Toolbar: ‹ Week N › with `IconButton`s, the state `Pill` (published / draft), the
    publish/unpublish button (`primary` to publish, `secondary` to unpublish) and "Duplicate
    week" in a `Menu`.
  - Board: 7 columns; column header with the day label, a small block count and a `Menu`
    holding "Duplicate day"; a dashed "+ Add block" button at the bottom of each column.
  - Block: compact, filled with `--block-fill`, no stripe; a click (or Enter) opens the editor;
    the drag handle (`GripVertical`) and a `Menu` (Duplicate, Delete) appear on hover and on
    focus-within, and are always visible on touch devices (`@media (hover: none)`). The result
    count shows as a small `muted` line. Read-only (archived) programs show blocks without tools.
  - `CopyForm` keeps its behavior and opens inside a small `Modal` from the menu item.
- **Block editor (`Modal`)**: title; `Segmented` for the block kind (disabled options when
  results lock the kind); fields with the filled style; barbell sets as a table (Set, Reps, Value,
  Unit) with a "− N sets +" stepper under it; `ColorSwatches`; footer with `secondary` Cancel and
  `primary` Save. Errors render in the footer above the buttons.
- **Athletes**: invite `Card` with the link in a read-only `Input` and a Copy button; roster as a
  table on `surface` (avatar, name, joined date, status `Pill`, Remove / Restore action).
- **Settings, new program, pending approval, coach onboarding**: a centered `Card` (`max-w-xl`)
  with the form; destructive actions (archive) as `danger` buttons.

## 5. Testing and verification

**Unit tests** (Vitest; files that render use `// @vitest-environment jsdom` and Testing Library,
both already installed):

- `Segmented`: click and arrow keys change the value; disabled options are skipped;
  `aria-checked` follows the value.
- `Modal`: renders open; Esc and the close button call `onClose`; focus returns to the opener.
  jsdom lacks `HTMLDialogElement.showModal`, so the test setup stubs it.
- `Menu`: opens on click; Esc and an outside click close it; choosing an item calls it and closes.
- `Button`: `href` renders a link; variants map to their classes.
- Block color tokens: for every value of `BLOCK_COLORS`, `globals.css` defines `stripe`, `fill`
  and `ink` in both the light and the dark block (same pattern as the movement-pattern label
  test).

The existing suite (390 tests), `tsc`, lint and build must stay green; CI enforces it on the PR.

**Browser verification**: the seven phase 1 flows, each in light and dark (`colorScheme`
emulation) and at 375 px and desktop width; planner drag and drop with mouse and keyboard; the
block editor operated with the keyboard only (open, switch kind, save, Esc). Screenshots of every
screen in both themes go to the user next to the matching Strivee reference.

## 6. Delivery

Branch `feat/ui-restyle` from `main`, one PR. Commits by layer: tokens and font; base
components and tests; navigation and layouts; athlete screens; planner and editor; remaining
coach screens; engine screens. Implementation plan in
`docs/plans/training-tailor-ui-restyle-plan.md`.
