# Training Tailor — Visual Identity Redesign

> Implemented on 2026-11-04. This replaces the look described in
> `training-tailor-ui-restyle-design.md`. That spec's tokens-and-components architecture and its
> scope rules still apply unless this document says otherwise.

## Why

The current UI was built to feel like the reference apps athletes and coaches already use: neutral
grays, black chrome, Inter and white rounded cards. It works, but it still resembles those apps and
has no identity of its own. The logo's colors and slant appear nowhere in the interface.

This redesign gives the product one recognizable identity, derived from the logo and spread across
the interface, so a screenshot of any main screen reads as Training Tailor.

## Goals

- The athlete and coach screens no longer read as a variation of the original design. The change
  has to be visible in structure and shape, not only in color.
- The logo and the interface look like one system: same font, same palette, same slant.
- Every existing screen adopts the identity consistently, including admin and the engine screens.

## Non-goals

- New screens, features or copy, apart from labels a change makes strictly necessary.
- Changes to logic, server actions, data fetching, drag and drop, or i18n. The one exception is moving
  the coach program tabs into the navy bar (section 5), a navigation change with no new data.
- An in-app theme selector. The theme keeps following the operating system.
- New animations.

## Anti-goals

The redesign has failed, even if it matches this document, if:

- slanted elements make text harder to read, or text itself looks distorted by a skew;
- the planner gets harder to scan or to use for a long work session;
- body text is tiring to read on a phone in a gym;
- light mode reads as an afterthought to dark mode.

## Decisions

Decided by the product owner:

| # | Decision |
|---|----------|
| 1 | Direction "logo in motion": the logo's 12° slant is a motif in the interface, and the main navigation and block card structure are redesigned. |
| 2 | Font: **Saira**. |
| 3 | The logo's letters change from the rounded bars to the **Saira T**: two overlapping italic extra-bold Ts, white and cyan. |
| 4 | The logo has **no background square inside the app**. |

Proposed by the designer and confirmed by the product owner:

| # | Decision |
|---|----------|
| 5 | Saira is used for body text too, not only titles. |
| 6 | Palette of navy and cyan across the app, in light and dark, following the operating system. |
| 7 | The seven block colors stay and are tuned to the new palette. |
| 8 | In the light theme the logo uses a navy T and a darker cyan T. |
| 9 | The installed app icon keeps its navy background, with the new logo. |
| 10 | The notification badge becomes a monochrome silhouette with no background. |
| 11 | The planner uses the same direction with a more restrained slant than the athlete app. |
| 12 | Scope is every existing screen. |

## 1. Logo

**Master artwork.** `assets/icon.svg` is redrawn from the Saira italic extra-bold (weight 800,
width 100%) capital T, converted to vector paths. It must not depend on a font being loaded.
Keep the current composition: the white T in front at the upper left, the cyan T behind at the lower
right, offset as in the current file. Kerning and overlap are adjusted by eye.

**The gap is real.** Today a stroke in the background color separates the two letters, which only
works on that exact background. The new artwork subtracts the gap from the back T, so the logo works
on any surface. Use real geometry rather than a mask, because `scripts/icons.ts` renders the SVG
through `ImageResponse`.

**Colors.**

| Context | Front T | Back T |
|---------|---------|--------|
| Navy chrome, dark theme, installed icon | `#ffffff` | `#22d3ee` |
| Light theme, on light surfaces | `#0f172a` | `#0891b2` |

**In-app use.** `src/components/Brand.tsx` stops using `/icons/icon-192.png` and renders the logo as
an inline SVG with no background and no rounded square. Its fills come from tokens, so it follows the
theme, and the chrome context forces the white and cyan version. Wherever a raster logo is used
inside the app, replace it the same way. The wordmark uses the display style from section 3.

**Generated icons.** `scripts/icons.ts` regenerates all of these from the new artwork:

- `public/icons/icon-192.png`, `icon-512.png`, `maskable-512.png`, `src/app/apple-icon.png` and
  `src/app/favicon.ico` keep the `#0f172a` background. The safe-zone scale factors may be retuned,
  since the new glyph has different proportions.
- New: a monochrome notification badge with a transparent background, under `public/icons/`. Android
  uses only the alpha channel, so the gap between the Ts must survive at small sizes.
  `public/sw.js` points `badge` at it, and `icon` keeps using `icon-192.png`.

## 2. Tokens and themes

Keep the architecture: semantic variables in `src/app/globals.css`, dark values in the final
`prefers-color-scheme` block, exposed through `@theme inline`. Existing token names keep their roles,
so most components change without edits. The values below come from the approved mockups. They may be
tuned to reach WCAG AA for text, with roles fixed.

| Token | Light | Dark | Use |
|-------|-------|------|-----|
| `background` | `#eef2f7` | `#0b1220` | Page |
| `surface` | `#ffffff` | `#131c2e` | Cards, modal, menus |
| `surface-2` | `#e6ecf3` | `#1c2840` | Inputs, tracks, secondary buttons |
| `raised` | `#ffffff` | `#2a3a58` | Selected segment |
| `border` | `#dbe3ec` | `#24324b` | Hairlines |
| `foreground` | `#0f172a` | `#f1f5f9` | Body text |
| `muted` | `#526077` | `#94a3b8` | Secondary text |
| `primary` / `on-primary` | `#0f172a` / `#ffffff` | `#22d3ee` / `#0f172a` | Primary button |
| `chrome` / `on-chrome` | `#0f172a` / `#ffffff` | `#0f172a` / `#ffffff` | Headers, navy in both themes |
| `danger`, `success` | Keep current values unless they fail contrast on the new surfaces | Same | Errors, published state |

New tokens:

| Token | Light | Dark | Use |
|-------|-------|------|-----|
| `accent` / `on-accent` | `#22d3ee` / `#0f172a` | `#22d3ee` / `#0f172a` | Active day and active nav item on chrome, tab indicator |
| `accent-ink` | `#0e7490` | `#22d3ee` | Cyan text and icons on `surface`, metadata lines |
| `accent-tint` | `rgba(34,211,238,.18)` | `rgba(34,211,238,.14)` | Tinted buttons and state pills |

**Contrast rule.** `#22d3ee` is never used for text on a light surface, since it does not reach AA on
white. Text on a cyan fill is always navy.

**Block colors.** Keep the seven colors, the `stripe` / `fill` / `ink` structure and the
`data-color` mapping. Retune the values so they sit on the navy palette: `neutral` moves from pure
gray to slate, and dark fills are tints over navy rather than over gray. Values from the mockups:

| Color | Light stripe / fill / ink | Dark stripe / fill / ink |
|-------|---------------------------|--------------------------|
| blue | `#60a5fa` / `#dbeafe` / `#1d4ed8` | `#3b82f6` / `#16294a` / `#93c5fd` |
| orange | `#fb923c` / `#ffedd5` / `#c2410c` | `#f97316` / `#37240f` / `#fdba74` |
| purple | `#c084fc` / `#f3e8ff` / `#7e22ce` | `#a855f7` / `#2b1c47` / `#d8b4fe` |

The other four follow the same rule. The builder picks their values.

**Browser chrome colors.** Update the hard-coded colors so they match:

- `src/app/manifest.ts`: `background_color` and `theme_color` become `#0f172a`.
- `src/app/layout.tsx`: `themeColor` becomes `#eef2f7` (light) and `#0b1220` (dark).
- Athlete pages that set `themeColor: "#000000"` (`page.tsx`, `calendar`, `notifications`,
  `programs/[id]/board`) become `#0f172a`.

## 3. Typography

Saira replaces Inter through `next/font/google`, with the italic style and the `wdth` axis enabled.
Remove Inter.

| Style | Spec | Use |
|-------|------|-----|
| Display | Saira italic, weight 700, width 75%, uppercase through CSS | Page and section titles, block titles, week and date headings, day labels, wordmark |
| Body | Saira normal, weight 400, width 100% | Body text, descriptions, forms, tables |
| Label | Saira normal, weight 600, small, uppercase through CSS, slight tracking | Metadata lines such as scoring |

Uppercase is CSS only, so stored and translated text keep their casing and screen readers read them
normally. User-written block descriptions are never uppercase.

**Legibility check.** Saira's wide squared forms are untested for long text in this product. If block
descriptions or admin tables read poorly at the current sizes, adjust size, line height or width
first. A separate body font is the fallback and needs the product owner's approval, because it
reverses decision 5.

## 4. Shape language

**The slant.** One shared CSS utility applies `skewX(-12deg)` to a container and counter-skews its
content, so **text and icons are never distorted**. Skew applies only to an inner visual element,
never to a node with its own positioning transform. This matters for sortable nodes in drag and drop.

| Slanted | Never slanted |
|---------|---------------|
| Active and inactive week-day cells | Text and icons themselves |
| Active indicators in tab bars and nav items | Inputs, textareas, selects |
| Athlete block-card stripe | Cards, modals, menus, popovers |
| Barbell set chips | Tables |
| Primary and tinted buttons on athlete screens, primary button in the coach toolbar | Secondary and ghost buttons |
| | Planner blocks and calendar grid cells |

The hit area and focus ring must follow the visible shape closely, and focus must remain visible
against chrome and against the cyan fill.

**Radii.** Sharper, to go with Saira: cards and modals 6 px, inputs and non-slanted buttons 4 px,
slanted elements about 3 px. The fully rounded look goes away. Pills become small slanted or squared
labels, avatars stay round, and the checkbox and switch controls just need to look consistent.

**Icons.** Keep `lucide-react`.

## 5. Screens

**Athlete header.** Navy `chrome`. The logo and program name sit at the left in display style, instead
of a centered title. With several programs, the name is still the program selector. Controls that are
in the header today stay. Below it, the week strip is a row of adjacent slanted cells: active day
filled with `accent`, the others on a slightly lighter navy, today and days with blocks still marked
distinctly.

**Athlete tab bar.** Same items and behavior. The active item shows a slanted `accent` bar on the top
edge, instead of relying on color alone.

**Block card.** 6 px radius. The left edge is a tapering slanted stripe in `--block-stripe`, replacing
the straight stripe. Display-style title, metadata line in `accent-ink`, body-style description,
slanted set chips, slanted tinted coaching-tips button. Existing collapse and expand behavior stays.

**Coach nav and program tabs.** Decided by the product owner: the program tabs move into the navy bar.

- `CoachNav` becomes a sticky `chrome` bar: logo at the left, then "Programs", then the program tabs
  (Planner, Athletes, Board, Settings) when the route is a program page, and the bell and account menu
  at the right. The bell's and menu's classes change to read on chrome.
- Tabs show on `/coach/programs/[id]` and its subroutes, not on `/coach/programs/new` or
  `/coach/blocks/[id]/results`. They derive from the route, as `ProgramHeader` already does with
  `usePathname`, so the layout needs no new query. Unapproved coaches still see no nav links.
- The active tab is an `accent` slanted label with navy text. "Programs" is not active inside a
  program, so only one item is highlighted.
- The program name stays in the page as its `h1`, in display style, directly under the bar.
  `ProgramHeader` keeps the name and loses the tabs. Read-only programs keep their current tabs and
  access rules.
- At narrow widths the tabs must stay reachable: a second row inside the same chrome bar, scrolling
  horizontally if needed, is acceptable. The bar must not overflow the page at 375 px.
- The tabs' `nav` needs an accessible name now that it is away from the `h1`. Use the program name if
  it is cheaply available, otherwise a new translated label.
- `navPillClasses` is also used by admin nav and filters. Outside chrome, its active state uses
  `primary` rather than `accent`, since `accent` is defined for chrome.

**Planner (restrained).** The density and structure stay close to the current board.

- Display style for the week title and day labels, and slanted primary button in the toolbar.
- Blocks are rectangular with a 4 px radius, filled with `--block-fill`, with a display-style title.
  No clip-path or skew on the blocks, so drag handles, menus and focus rings behave as they do now.
- The dashed "add block" button stays straight.
- If uppercase condensed titles truncate too often in narrow columns, the builder may drop uppercase
  on planner block titles only.

**Everything else.** All other screens change through tokens, typography and base components, without
layout redesign, and use the display style for their titles and the shared components above. That
covers sign-in, onboarding, profile, calendar, boards, leaderboards, PRs, notifications, the block
editor and import dialogs, athletes and settings, the engine screens (`/tailor`, `/profile`) and all
of `/admin`. Sign-in pages show the new logo prominently with no background square.

Hard-coded colors in `GoogleSignInButton` are Google's brand mark and stay.

## 6. Testing and verification

- `tests/ui/tokens.test.ts`: add the new tokens to the base list. The existing suite, `tsc`, lint and
  build stay green. Tests that pin classes change only where a variant's classes changed on purpose.
- Add a small test that the slant utility counter-skews its content, if the utility is a component.
- Automated contrast is not required, but every text and background pair in sections 2 and 5 is
  checked by hand against WCAG AA, in both themes.
- **Browser verification:** every athlete and coach screen in light and dark, at 375 px and desktop
  width; a sample of each admin and engine screen; planner drag and drop with mouse and keyboard;
  keyboard focus visible on slanted elements; long block titles wrapping; several-program selector;
  coach bar tabs on each program page, read-only and unapproved states, and at 375 px.
- **Icons:** check the installed icon, favicon and badge at real size, including the Android maskable
  safe zone.
- Screenshots of the main screens go to the product owner for review before merging.

## 7. Delivery

One branch and one PR, with commits by layer: logo and generated icons; tokens and font; base
components and slant utility; navigation and layouts; athlete screens; planner and coach screens;
admin and engine screens. Add a note at the top of `training-tailor-ui-restyle-design.md` pointing to
this document.

## Left to the builder

- The exact placement and kerning of the Saira Ts, and the tool used to convert them to paths.
- The values for the four block colors not listed, and contrast tuning of any token value.
- The name and form of the slant utility, and how the logo's theme colors are wired.
- The badge's file name and size.
- Small spacing decisions, as long as the shape rules in section 4 hold.

## Reference

Approved mockups live outside version control in
`.superpowers/brainstorm/910-1793785590/content/`: `direcciones-visuales.html` (option A),
`tipografia-y-logo.html` and `logo-recto.html` (option 3). They are illustrative. This document takes
precedence where they differ: for example, the option A mockup clips planner blocks, and section 5
does not.
