# Visual Identity Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every Training Tailor screen one identity derived from the logo: Saira, navy and cyan, and a 12° slant.

**Architecture:** Most of the change lands through `globals.css` (tokens, radii, heading style, slant utility) and the base components, so screens need few edits. Only the navigation, athlete header, week strip, tab bar and block card change structure. Slanted fills are painted on a `::before` pseudo-element, so an element's text and icons are never transformed.

**Tech Stack:** Next.js 16, React 19, Tailwind 4, `next/font/google`, next-intl, dnd-kit, Vitest with Testing Library, pnpm.

**Spec:** `docs/specs/training-tailor-visual-identity-design.md`. Read it first: it holds the token tables and the shape rules this plan refers to.

## Global Constraints

- No logic, server action, data fetching, drag-and-drop or i18n changes, except moving the coach program tabs and one new nav label.
- No new screens, copy, animations or in-app theme selector.
- Text and icons are never distorted. Never put a transform on a sortable node or on a node with its own positioning transform.
- `#22d3ee` is never text on a light surface. Text on a cyan fill is always navy.
- Uppercase is CSS only. User-written descriptions, notes and coaching tips are never uppercase.
- Colors go through tokens. `GoogleSignInButton` keeps its brand colors.
- Keep the dark block last in `globals.css` (`tests/ui/tokens.test.ts` depends on it).
- One branch, one PR, commits by layer. Every commit message ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`; the PR description ends with `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.
- A separate body font reverses an owner decision: stop and ask rather than adding one.

**Deviation from the spec's wording, allowed by "Left to the builder":** the slant utility paints a skewed `::before` instead of skewing a container and counter-skewing its content. It meets the same rule, needs no extra DOM, and works on `Link`, `button` and `summary`.

## Review Focus

Failure modes the spec implies; each has its check in the owning task.

1. A long program name with the week button and bell at 375 px: the title truncates and the header does not overflow (Task 5).
2. Names with characters outside basic Latin (`Łukasz`, `Őry`): they render in Saira, so the font loads `latin-ext` (Task 2).
3. Slanted overhang: a full-width slanted button or the first and last scrolling tab is not clipped and adds no page scroll at 375 px (Tasks 4 and 6).
4. Windows high-contrast mode drops pseudo-element backgrounds: the active day and active tab must still show (Task 2).
5. The program `<select>`: its options stay readable and in their stored casing, not uppercase white on white (Task 5).

---

### Task 1: Logo artwork, generated icons and badge

**Files:**
- Modify: `assets/icon.svg`, `scripts/icons.ts`, `public/sw.js`
- Create: `src/components/logo-paths.ts`, `public/icons/badge-96.png`, `tests/ui/logo.test.tsx`
- Regenerate: `public/icons/icon-192.png`, `icon-512.png`, `maskable-512.png`, `src/app/apple-icon.png`, `src/app/favicon.ico`

**Interfaces:**
- Produces: `LOGO_VIEWBOX: string`, `LOGO_FRONT_PATH: string`, `LOGO_BACK_PATH: string` from `src/components/logo-paths.ts`; `/icons/badge-96.png`.

- [ ] **Step 1: Create the branch and commit the spec and this plan**

```bash
git switch -c visual-identity
git add docs/specs/training-tailor-visual-identity-design.md docs/plans/training-tailor-visual-identity-plan.md
git commit -m "Add the visual identity design and plan"
```

Add the attribution line to this and every later commit.

- [ ] **Step 2: Write the failing test in `tests/ui/logo.test.tsx`**

Read `assets/icon.svg` and `public/sw.js` as text and assert:
- `icon.svg` has exactly two `<path`, with fills `#ffffff` and `#22d3ee`.
- It has no `stroke`, `mask`, `clip`, `<text` or `<rect`.
- The two `d` attributes equal `LOGO_FRONT_PATH` and `LOGO_BACK_PATH`.
- `sw.js` contains `badge: "/icons/badge-96.png"` and `icon: "/icons/icon-192.png"`, and `public/icons/badge-96.png` exists.

- [ ] **Step 3: Run it to verify it fails**

Run: `pnpm exec vitest run tests/ui/logo.test.tsx`
Expected: FAIL, `logo-paths` cannot be resolved.

- [ ] **Step 4: Convert the artwork in the scratchpad, not in the repo**

Fetch the Saira italic 800 TTF (`https://fonts.googleapis.com/css2?family=Saira:ital,wght@1,800` lists it) into its own new directory. In a separate scratch directory, use `opentype.js` and `clipper-lib`:
- Take the capital T outline at font size 372.
- Place the back T 116 units right and 40 down from the front T, the offset of the current artwork, centered in the 512 × 512 box.
- Offset the front T outward by 9 units with miter joins and subtract it from the back T. That reproduces today's 18-unit stroke as real geometry.

Write both as paths with one decimal. Add neither tool to the project's dependencies.

- [ ] **Step 5: Save the results**

`assets/icon.svg`: viewBox `0 0 512 512`, back path `#22d3ee`, then front path `#ffffff`, and a comment naming the source (Saira italic 800, gap subtracted). `src/components/logo-paths.ts`: the same two `d` values and `LOGO_VIEWBOX = "0 0 512 512"`.

- [ ] **Step 6: Change `scripts/icons.ts`**

Add a transparent, monochrome badge: `public/icons/badge-96.png` at 96 px, from the same SVG with both fills replaced by `#ffffff`, and no background. Refactor to `render(size: number, options?: { glyphScale?: number; background?: string; svg?: string })`. Point `badge` in `public/sw.js` at the new file.

- [ ] **Step 7: Generate and inspect the icons**

Run: `pnpm exec tsx scripts/icons.ts`
Expected: `Icons written.`

Open each PNG with the Read tool. Retune `glyphScale` until:
- the glyph sits inside the central 80% of `maskable-512.png`;
- it is not cropped in the favicon sizes;
- the gap between the Ts is visible at 16 and 48 px and in the badge;
- the badge is transparent.

- [ ] **Step 8: Run the test to verify it passes**

Run: `pnpm exec vitest run tests/ui/logo.test.tsx`
Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add assets scripts public src/components/logo-paths.ts src/app/apple-icon.png src/app/favicon.ico tests/ui/logo.test.tsx
git commit -m "Redraw the logo from the Saira T and regenerate the icons"
```

---

### Task 2: Tokens, font, radii and slant utility

**Files:**
- Modify: `src/app/globals.css`, `src/app/layout.tsx`, `src/app/manifest.ts`, the four athlete pages with `themeColor: "#000000"` (`(athlete)/page.tsx`, `calendar/page.tsx`, `notifications/page.tsx`, `programs/[id]/board/page.tsx`), `tests/ui/tokens.test.ts`
- Create: `tests/ui/contrast.test.ts`

**Interfaces:**
- Produces, for all later tasks:
  - Colors: `bg-accent`, `text-on-accent`, `text-accent-ink`, `bg-accent-tint`, `fill-logo-front`, `fill-logo-back`.
  - Utilities: `slant` (fill set with `before:bg-*`, focus ring color with `[--slant-focus:…]`), `type-display`, `type-label`.
  - Every `h1`, `h2` and `h3` is display style by default; `normal-case` is the exception.
  - `rounded-2xl` = 6 px, `rounded-xl` and `rounded-lg` = 4 px, `rounded-md` and `rounded-sm` = 3 px.

- [ ] **Step 1: Write the failing tests**

In `tokens.test.ts`, add `accent`, `on-accent`, `accent-ink`, `accent-tint`, `logo-front`, `logo-back` to `BASE`, and add these cases:
- `css` contains `@utility slant`, `@utility type-display`, `@utility type-label`.
- The `slant` block contains `skewX(-12deg)` and `forced-colors`, and its only `transform` sits inside `&::before`.
- `layout.tsx` contains `Saira`, `latin-ext`, `axes: ["wdth"]` and `"italic"`, and does not contain `Inter`.
- `manifest().theme_color` and `background_color` equal `#0f172a`.

Create `contrast.test.ts`, which parses hex tokens per theme with the existing `darkAt` split and asserts WCAG ratio ≥ 4.5 for:
- `foreground`, `muted`, `danger`, `success`, `accent-ink` on `background`, `surface`, `surface-2`;
- `on-primary` on `primary`; `on-accent` on `accent`; `on-chrome` on `chrome`; `foreground` on `raised`;
- each block color's `ink`, plus `foreground` and `muted`, on its `fill`.

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm exec vitest run tests/ui/tokens.test.ts tests/ui/contrast.test.ts`
Expected: FAIL on the missing tokens and utilities, and on the old Inter import.

- [ ] **Step 3: Replace the values in `globals.css`**

Base and new tokens exactly as in spec section 2, with these additions:

| Token | Light | Dark |
|-------|-------|------|
| `danger` | `#b91c1c` (the current `#dc2626` is 4.30:1 on the new background) | keep `#f87171` |
| `success` | `#166534` (the current `#15803d` is 4.46:1) | keep `#4ade80` |
| `logo-front` | `#0f172a` | `#ffffff` |
| `logo-back` | `#0891b2` | `#22d3ee` |

`chrome` and `on-chrome` stay defined only in `:root`. Blue, orange and purple come from spec section 2. The other four, as stripe / fill / ink:

| Color | Light | Dark |
|-------|-------|------|
| neutral | `#94a3b8` / `#e6ecf3` / `#334155` | `#475569` / `#1c2840` / `#cbd5e1` |
| red | `#f87171` / `#fee2e2` / `#b91c1c` | `#ef4444` / `#3a1c28` / `#fca5a5` |
| yellow | `#facc15` / `#fef9c3` / `#a16207` | `#eab308` / `#332b14` / `#fde047` |
| green | `#4ade80` / `#dcfce7` / `#15803d` | `#22c55e` / `#12302a` / `#86efac` |

Remove "tinted buttons" from the block-color comment, since the tinted button now uses `accent-tint`. Expose the new tokens in `@theme inline`, plus `--font-sans: var(--font-saira), ui-sans-serif, system-ui, sans-serif`.

- [ ] **Step 4: Add radii, type styles and the slant utility, before the dark block**

In `@theme inline`, remap the radius scale with a comment explaining the remap, so about 70 existing `rounded-*` classes take the new shape: `--radius-2xl: 6px; --radius-xl: 4px; --radius-lg: 4px; --radius-md: 3px; --radius-sm: 3px`.

```css
@utility type-display { font-style: italic; font-weight: 700; font-stretch: 75%; text-transform: uppercase; letter-spacing: .01em; }
@utility type-label { font-weight: 600; font-size: .75rem; text-transform: uppercase; letter-spacing: .04em; }
@layer base { h1, h2, h3 { @apply type-display; } }

/* A 12° fill behind the element. Text and icons stay upright, because only the pseudo-element is skewed.
   Set the fill with before:bg-*. */
@utility slant {
  position: relative;
  isolation: isolate;
  &::before { content: ""; position: absolute; inset: 0; z-index: -1; transform: skewX(-12deg); border-radius: 3px; }
  &:focus-visible { outline: none; }
  &:focus-visible::before { outline: 2px solid var(--slant-focus, var(--foreground)); outline-offset: 2px; }
  @media (forced-colors: active) { &::before { border: 1px solid ButtonText; } }
}
```

- [ ] **Step 5: Swap the font and browser colors**

In `layout.tsx`: `Saira({ subsets: ["latin", "latin-ext"], variable: "--font-saira", style: ["normal", "italic"], axes: ["wdth"] })`, and `themeColor` from spec section 2. In `manifest.ts`, both colors become `#0f172a`. The four athlete pages' `themeColor` becomes `#0f172a`.

- [ ] **Step 6: Run the tests and static checks**

Run: `pnpm test`, then `pnpm exec tsc --noEmit`, then `pnpm lint`
Expected: all pass. `primitives.test.tsx` still passes since no variant changed yet. If a contrast pair fails, tune the token and keep its role.

- [ ] **Step 7: Check the font in the browser**

Start `pnpm dev` and open `/signin`. Confirm with `getComputedStyle` that `h1` reports Saira, `italic`, `75%` stretch and `uppercase`, and that `Łukasz Őry`, set temporarily through devtools, keeps the same face (Review Focus 2). Emulate forced colors if the browser allows it; otherwise rely on the CSS test.

- [ ] **Step 8: Commit**

```bash
git add src tests
git commit -m "Add the navy and cyan tokens, Saira and the slant utility"
```

---

### Task 3: Base components and logo component

**Files:**
- Modify: `src/components/Brand.tsx`, `src/components/ui/Button.tsx`, `Pill.tsx`, `Card.tsx`, `IconButton.tsx`, `Menu.tsx`, `src/app/coach/UserMenu.tsx`, `src/components/notifications/NotificationBell.tsx`
- Test: `tests/ui/primitives.test.tsx`, `tests/ui/logo.test.tsx`

**Interfaces:**
- Consumes: Task 1 paths; Task 2 utilities.
- Produces:
  - `Logo({ onChrome?: boolean; className?: string })` and `Brand({ className?; onChrome?: boolean; size?: "md" | "lg"; compactWordmark?: boolean })` from `Brand.tsx`.
  - `Button` and `buttonClasses` accept `slanted?: boolean`, honored only for `primary` and `tinted`.
  - `chromeNavClasses(active: boolean): string` from `Pill.tsx`.
  - `IconButton` and `Menu` accept `tone?: "default" | "chrome"`; `UserMenu` accepts `onChrome?: boolean`.

- [ ] **Step 1: Write the failing tests**

- `<Logo />` renders an inline `svg` with no `img`; its two paths use `LOGO_FRONT_PATH` and `LOGO_BACK_PATH`; the fills are `fill-logo-front` and `fill-logo-back`, or `fill-on-chrome` and `fill-accent` with `onChrome`.
- `<Brand />` renders the text "Training Tailor" in `type-display`, has no `img`, and the svg has no rounded or background class. With `compactWordmark`, the text has `max-sm:sr-only`.
- `<Button variant="primary" slanted>` has `slant` and `before:bg-primary`, and does not contain `focus-visible:outline-2`.
- `<Button variant="secondary" slanted>` has no `slant` and keeps `focus-visible:outline-2`.
- `<Button variant="tinted">` has `bg-accent-tint` and `text-accent-ink`.
- `navPillClasses(true)` contains `bg-primary`. `chromeNavClasses(true)` contains `slant`, `before:bg-accent`, `text-on-accent`, `[--slant-focus:var(--on-chrome)]`. `chromeNavClasses(false)` contains `text-on-chrome/80`.

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm exec vitest run tests/ui/primitives.test.tsx tests/ui/logo.test.tsx`
Expected: FAIL

- [ ] **Step 3: Implement**

- **Brand:** remove `next/image`. `Logo` is `aria-hidden`, `size-8` by default, `size-14` for `lg`.
- **Button:** move the focus classes out of `BASE` into a `FOCUS` constant, applied only when not slanted, because a Tailwind focus variant would beat the utility's outline reset. Slanted `primary` is `slant text-on-primary before:bg-primary hover:opacity-90`; slanted `tinted` is `slant text-accent-ink before:bg-accent-tint hover:brightness-95 dark:hover:brightness-125`. Straight `tinted` uses `bg-accent-tint text-accent-ink`, and its comment no longer mentions `data-color`.
- **Pill:** `rounded-full` becomes `rounded-md` in `Pill`, `navPillClasses` and `chipClasses`. Add `chromeNavClasses`: `slant whitespace-nowrap px-3 py-1.5 text-sm font-semibold [--slant-focus:var(--on-chrome)]`, active `text-on-accent before:bg-accent`, inactive `text-on-chrome/80 hover:text-on-chrome hover:before:bg-white/10`.
- **Card:** `stripe` becomes `relative pl-3 before:absolute before:inset-y-0 before:left-0 before:w-3 before:rounded-l-2xl before:bg-(--block-stripe) before:[clip-path:polygon(0_0,100%_0,45%_100%,0_100%)]`. Drop `border-l-4`. Update the doc comment.
- **IconButton:** split color classes out of `BASE`; `TONES.default` is today's `text-muted hover:bg-surface-2 hover:text-foreground focus-visible:outline-foreground`, `TONES.chrome` is `text-on-chrome hover:bg-white/10 focus-visible:outline-on-chrome`.
- **Menu and UserMenu:** `Menu` passes `tone` to its trigger only; the popup keeps surface colors. `UserMenu` maps `onChrome` to `tone="chrome"`.
- **NotificationBell:** `rounded-full` becomes `rounded-lg`. The unread dot stays round.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test`, then `pnpm exec tsc --noEmit`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src tests
git commit -m "Restyle the base components and render the logo inline"
```

---

### Task 4: Coach bar with program tabs

**Files:**
- Modify: `src/lib/routes.ts`, `src/app/coach/CoachNav.tsx`, `CoachNavLinks.tsx`, `src/app/coach/layout.tsx`, `src/app/coach/programs/[id]/ProgramHeader.tsx` and its four callers (`page.tsx`, `athletes/page.tsx`, `board/page.tsx`, `settings/page.tsx`), `src/i18n/messages/en.json`, `es.json`
- Test: `tests/lib/routes.test.ts`, `tests/ui/coach-nav.test.tsx`

**Interfaces:**
- Consumes: `chromeNavClasses`, `Brand`, `UserMenu onChrome` from Task 3.
- Produces: `coachProgramIdOf(pathname: string): string | null`. `ProgramHeader({ name })`.

- [ ] **Step 1: Write the failing tests**

`coachProgramIdOf`:

| Path | Result |
|------|--------|
| `/coach/programs/abc` | `abc` |
| `/coach/programs/abc/athletes/x` | `abc` |
| `/coach/programs/new` | `null` |
| `/coach/programs` | `null` |
| `/coach/blocks/x/results` | `null` |
| `/coach` | `null` |

`coach-nav.test.tsx`, mocking `usePathname` and rendering `CoachNavLinks` with `en` messages:
- `/coach`: "Programs" has `aria-current="page"`; no tabs.
- `/coach/programs/new`: "Programs" is current; no tabs.
- `/coach/programs/abc`: Planner is current, "Programs" is not; a `nav` named "Program sections" holds four links with hrefs `/coach/programs/abc`, `/athletes`, `/board`, `/settings`.
- `/coach/programs/abc/athletes/x`: the roster tab is current, Planner is not.
- `/coach/programs/abc/board`: the Board tab is current, and only one item in the bar has `aria-current`.

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm exec vitest run tests/ui/coach-nav.test.tsx`
Expected: FAIL

- [ ] **Step 3: Implement**

- **`routes.ts`:** add `coachProgramIdOf`, excluding `new`.
- **i18n:** add `programs.sectionsNav` ("Program sections" / "Secciones del programa"). `tests/i18n/messages.test.ts` guards parity.
- **`CoachNavLinks`:** renders the main `nav` with "Programs", then, when an id exists, a second `nav` with the tabs moved from `ProgramHeader`. Both use `chromeNavClasses`. Planner is active on an exact match; the other tabs on the exact path or below it. "Programs" is active on `/coach` or `/coach/programs/new`.
- **Tabs `nav` classes:** `max-md:order-last max-md:w-full overflow-x-auto`, with `px-2 py-2` on its `ul` so the overhang and focus ring are not clipped.
- **`CoachNav`:** sticky `bg-chrome text-on-chrome`, no `border-b`; inner row `flex min-h-16 flex-wrap items-center gap-x-6 px-4 lg:px-8`. `Brand onChrome compactWordmark`, logo link focus `outline-on-chrome`. The right group keeps `ml-auto`; `UserMenu onChrome`.
- **`layout.tsx`:** the bell's classes become `text-on-chrome hover:bg-white/10 focus-visible:outline-on-chrome`.
- **`ProgramHeader`:** a server component rendering only `<h1 className="text-3xl">{name}</h1>`. Update the four callers.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test`, then `pnpm exec tsc --noEmit`
Expected: PASS

- [ ] **Step 5: Verify in the browser at 375 px and desktop**

Check in `pnpm dev`:
- Tabs on each program page and on an athlete's detail page; none on `/coach/programs/new` or a results page.
- An archived program keeps its tabs. An unapproved coach sees no links.
- At 375 px: `document.documentElement.scrollWidth === 375`, the tabs row scrolls, and the first and last tabs are not clipped (Review Focus 3).
- Tab order and focus rings are visible on the navy bar.

- [ ] **Step 6: Commit**

```bash
git add src tests
git commit -m "Move the coach program tabs into a navy bar"
```

---

### Task 5: Athlete header, week strip and tab bar

**Files:**
- Modify: `src/app/(athlete)/AthleteHeader.tsx`, `ProgramTitle.tsx`, `WeekStrip.tsx`, `AthleteTabBar.tsx`, `WeekNoteButton.tsx`
- Test: `tests/ui/week-strip.test.tsx`, `tests/ui/program-title.test.tsx`

**Interfaces:**
- Consumes: `Logo`, `slant`, `type-display`.
- Props of these components do not change.

- [ ] **Step 1: Write the failing tests**

`week-strip.test.tsx`, with fixed dates:
- The selected day link has `aria-current="date"` and `before:bg-accent`, and its labels are `text-on-accent`.
- Another day has `before:bg-white/10`.
- An unselected today has `text-accent` on its number, which no other unselected day has.
- A day in `withBlocks` shows a visible dot (`bg-on-chrome`, or `bg-on-accent` when selected).

`program-title.test.tsx`:
- One program: an `h1` with the name and `truncate`.
- Two programs: the `select` lists both names, and its class list contains `[&>option]:normal-case` and `[&>option]:text-foreground` (Review Focus 5).

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm exec vitest run tests/ui/week-strip.test.tsx tests/ui/program-title.test.tsx`
Expected: FAIL

- [ ] **Step 3: Implement**

- **`AthleteHeader`:** replace the absolute layout with a row `flex items-center gap-2`: `Logo onChrome` (`size-7 shrink-0`), a `min-w-0 flex-1` title, `start`, then the bell. Keep the safe-area top padding. Update the comments that say "black" and "centred".
- **`ProgramTitle`:** left-aligned, `truncate text-xl`; the select gets `type-display`, `w-full`, and the option classes above. Its wrapper is `relative flex min-w-0 max-w-full w-fit`.
- **`WeekStrip`:** `ol` is `grid-cols-7 gap-1`. Each `Link` is `slant flex flex-col items-center py-1 [--slant-focus:var(--on-chrome)]` with the fills above. Weekday label in `type-display`, `text-[11px]`, `text-on-chrome/70` (`text-on-accent` when selected). Keep the `font-extrabold` for today.
- **`AthleteTabBar`:** each `Link` is `relative`. When active, add `<span aria-hidden className="absolute -top-px inset-x-[28%] h-[3px] -skew-x-30 bg-accent" />`. Same items and behavior.
- **`WeekNoteButton`:** `rounded-full` becomes `rounded-lg`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test`, then `pnpm exec tsc --noEmit`
Expected: PASS

- [ ] **Step 5: Verify in the browser at 375 px, light and dark**

With a program name of 60 characters and the week button present, the title truncates and `scrollWidth === 375` (Review Focus 1). With two programs, the select opens with readable, stored-casing options. Today and days with blocks are distinct, including when selected.

- [ ] **Step 6: Commit**

```bash
git add src tests
git commit -m "Redesign the athlete header, week strip and tab bar"
```

---

### Task 6: Block card and remaining athlete screens

**Files:**
- Modify: `src/components/training/BlockCard.tsx`, `NotInProgram.tsx`, `src/components/WorkoutView.tsx`, and in `src/app/(athlete)/`: `page.tsx`, `me/SettingsForm.tsx`, `join/[code]/page.tsx`, `join/[code]/JoinButton.tsx`, `blocks/[id]/log/LogForm.tsx`, `blocks/[id]/leaderboard/FistBumpButton.tsx`, `prs/[movement]/PrHistory.tsx`, `tailor/TailorClient.tsx`, `tailor/ClarifyStep.tsx`, `tailor/ResultView.tsx`, `profile/ProfileForm.tsx`, `signin/page.tsx`
- Test: `tests/ui/block-card.test.tsx`

**Interfaces:**
- Consumes: `Button slanted`, `slant`, `type-label`, `Brand size`.

- [ ] **Step 1: Write the failing tests**

Add to `block-card.test.tsx`:
- A scored custom block's metadata line has `type-label` and `text-accent-ink`.
- An athlete card's barbell set lines are each an `li` with `slant`.
- The coaching-tips `summary` has `slant` and `before:bg-accent-tint`.
- The `compact` card has no `slant` anywhere (`container.querySelector(".slant")` is null).
- A block description's element does not have `uppercase` or `type-display`.

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm exec vitest run tests/ui/block-card.test.tsx`
Expected: FAIL

- [ ] **Step 3: Implement `BlockCard`**

- `BlockBody`: the scoring line uses `type-label`, with `text-accent-ink` when not compact and `text-muted` when compact, since `accent-ink` is not checked on block fills.
- Non-compact barbell sets render as `ul.flex.flex-wrap.gap-2` of `li.slant.px-2.py-0.5.before:bg-surface-2`. Compact sets stay as a plain list.
- The tips `summary` uses `buttonClasses({ variant: "tinted", slanted: true, block: true })`.
- Remove `font-bold` from the `h3` elements; the base rule sets it.

- [ ] **Step 4: Pass `slanted` on athlete screens**

Add it to every `primary` and `tinted` `Button` or `buttonClasses` in the files above. Find them with:

```bash
rg -n 'variant[=:] ?"(primary|tinted)"|variant=\{' src/app/\(athlete\) src/components/training
```

Shared components (`ConfirmDialog`, `EnablePushCard`, `InstallGate`, `Modal`) stay straight because coaches use them too.

- [ ] **Step 5: Finish the remaining athlete screens**

- Replace `rounded-full` with `rounded-md` in `WorkoutView`, `ResultView` and `FistBumpButton`. Avatars, status dots, `ColorSwatches` and switches stay as they are.
- Calendar day labels and non-heading date or week titles get `type-display`. Calendar cells stay straight.
- `signin/page.tsx`: `<Brand size="lg" className="self-center text-2xl" />`.
- Check the form screens for fully rounded controls left behind.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `pnpm test`, then `pnpm exec tsc --noEmit`
Expected: PASS

- [ ] **Step 7: Check every athlete screen in the browser**

Check sign-in, onboarding, join, today, calendar, board, notifications, leaderboard, log, PRs, `/me`, `/tailor`, `/profile`, in light and dark at 375 px and desktop width:
- `scrollWidth` equals the viewport at 375 px, and full-width slanted buttons are not clipped (Review Focus 3).
- Long block titles wrap.
- Descriptions, notes and coaching tips keep their casing.
- Read a long description at phone size. If it reads poorly, adjust size, line height or width first (spec section 3), and stop to ask if that is not enough.

- [ ] **Step 8: Commit**

```bash
git add src tests
git commit -m "Apply the identity to the block card and athlete screens"
```

---

### Task 7: Planner and coach screens

**Files:**
- Modify: `src/app/coach/programs/[id]/planner/WeekTools.tsx`, `WeekBoard.tsx`, `WeekPicker.tsx`, `src/app/coach/programs/[id]/page.tsx`, `athletes/page.tsx`, `src/app/coach/signin/page.tsx`
- Test: `tests/ui/block-card.test.tsx` already pins the unslanted compact card; no new unit test here, as the risk is drag behavior.

**Interfaces:**
- Consumes: `Button slanted`, `Brand size`, `type-display`.

- [ ] **Step 1: Apply the planner changes**

- `WeekTools`: pass `slanted={!published}` on the publish button, since only its `primary` state is slanted.
- `page.tsx`: the week title span drops `font-bold` and gets `type-display`.
- `WeekBoard`: `rounded-full` on the day count becomes `rounded-md`. Keep the column, drag overlay and drop-target markup.
- `PlannerBlock` and the compact card get their 4 px radius from the Task 2 remap: no edit. `AddBlock` stays straight.
- `coach/signin/page.tsx`: add `<Brand size="lg" className="mb-6 justify-center text-2xl" />` above the card.

- [ ] **Step 2: Sweep the other coach screens**

Replace any remaining `rounded-full` with `rounded-md` except avatars and dots. Non-heading titles get `type-display`. Dialogs need no structural change.

- [ ] **Step 3: Run the checks**

Run: `pnpm test`, then `pnpm exec tsc --noEmit`, then `pnpm lint`
Expected: PASS

- [ ] **Step 4: Exercise the planner in the browser**

- Drag a block within a day and across days with the mouse, and move one with the keyboard (focus handle, Space, arrows, Space). The position persists after reload. **Use a demo or local program only.**
- Open and use a block's menu, and open the editor with a click.
- Focus rings stay visible on tiles.
- Read-only program: no drag, no tools.
- Long block titles in a narrow column. If uppercase truncates too often, add `normal-case` to the compact `h3` only (spec section 5).
- Check the import, copy, clear and note dialogs, athletes, board and settings, in both themes.

- [ ] **Step 5: Commit**

```bash
git add src tests
git commit -m "Apply the identity to the planner and coach screens"
```

---

### Task 8: Admin, final verification and PR

**Files:**
- Modify: `src/app/admin/signin/page.tsx`, `src/app/admin/ui.tsx`, `src/app/admin/layout.tsx`, `docs/specs/training-tailor-ui-restyle-design.md`
- Sweep: the rest of `src/app/admin/**`

**Interfaces:**
- Consumes: `Brand`, `Pill`, `navPillClasses`.

- [ ] **Step 1: Apply the admin changes**

- The admin header stays on `surface`: `navPillClasses` keeps `primary` there, per spec section 5, and `Brand` follows the theme.
- `admin/signin/page.tsx`: add the same large `Brand` as the coach sign-in.
- `admin/ui.tsx`: `rounded-full` becomes `rounded-md`.
- Sweep admin for `rounded-full` and non-heading titles. Admin tables keep body style. If they read poorly, adjust size first (spec section 3).

- [ ] **Step 2: Add the note to the old spec**

At the top of `training-tailor-ui-restyle-design.md`: the look it describes is replaced by `training-tailor-visual-identity-design.md`; its architecture and scope rules still apply unless that document says otherwise. Update the `globals.css` comment if it still points only at the old spec.

- [ ] **Step 3: Check for leftovers**

Run: `rg -n "rounded-full|font-extrabold|bg-black|#000000|Inter\b" src`
Expected: only avatars, dots, swatches, switches, `font-extrabold` on today in the week strip and on the admin stat numbers, and the `ImpersonationBanner` hover. Explain or fix anything else.

- [ ] **Step 4: Run the full suite and build**

Run: `pnpm test`, then `pnpm exec tsc --noEmit`, then `pnpm lint`, then `pnpm build`
Expected: all pass; report any failure with its output.

- [ ] **Step 5: Complete the spec's browser verification (section 6)**

Work through the list that earlier tasks did not cover:
- a sample of each admin screen in both themes;
- installed icon and favicon at real size, and the maskable safe zone;
- the notification badge;
- by-hand contrast for pairs outside `contrast.test.ts`: `accent-ink` on `accent-tint` over `surface`, `text-on-chrome/70` and `/80` on navy, `text-accent` on navy, `foreground/80` on `surface`, `success` and `danger` on their `/15` tints.

- [ ] **Step 6: Save screenshots of the main screens**

Save to the scratchpad, in light and dark: today, block card open, calendar, tab bar, planner, coach bar on a program, sign-in, an admin page. Send them to the owner with SendUserFile.

- [ ] **Step 7: Commit, push and open the PR**

```bash
git add src docs
git commit -m "Apply the identity to the admin screens and finish the redesign"
git push -u origin visual-identity
gh pr create --title "Give Training Tailor its own visual identity" --body-file <scratchpad file>
```

The PR is not merged until the owner has reviewed the screenshots.
