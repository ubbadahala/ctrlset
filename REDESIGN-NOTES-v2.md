# CtrlSet Redesign Notes v2 — Full Visual Overhaul

Approach: full redesign (Section 11.E), matching the CtrlSet marketing
landing page's identity: graphite background, warm off-white text, a
single desaturated amber accent, Outfit + JetBrains Mono typography, and
the keycap motif. IA and every feature are unchanged — this is a visual
layer rewrite, not a rebuild. No file was renamed, no ID or class was
removed, no event handler changed except the one reduced-motion line
noted below.

Diff sizes against the original (line-ending-normalized so they reflect
actual content changes, not CRLF/LF noise):

| File | Changed lines |
|---|---|
| `css/style.css` | 642 |
| `index.html` | 82 |
| `js/history.js` | 90 |
| `js/charts.js` | 62 |
| `js/data.js` | 12 |
| `js/workout.js` | 10 |
| `js/ui.js` | 4 |

## Palette

Old (dark mode) → New (dark mode):
- Background `#050505` → `#131211`
- Accent (acid-green) `#e8ff47` → `#e08a3e` (amber)
- Accent2 (vermilion) `#ff6b35` → `#c9694f`
- Text `#f0f0f0` → `#f2f0ec`
- Green/fresh `#44ff88` → `#7fae6e`
- Red `#ff4444` → `#c1544a`
- Warning `#ffb347` → `#d9a256`
- New token: `--info: #7a94b5` (rest-day marker, previously an
  unnamed literal `#64b4ff`)
- New tokens: `--accent-strong` and `--accent-text` for hover states and
  text-on-accent-background contexts (previously hardcoded `#000` in 8
  places — now correctly following the theme).

Light mode got the equivalent treatment (own set of darker, contrast-
correct values for readability on white, e.g. accent `#9eb300` →
`#c96f2a`). Both light and dark mode existed before and still exist now
— this redesign recolored them, it didn't add or remove the feature.

Every hardcoded hex and `rgba()` literal that duplicated a root token —
across `css/style.css`, `index.html`'s inline styles, and every `.js`
file that renders styled markup via template strings (`history.js`,
`charts.js`, `data.js`, `workout.js`, `ui.js`) — was found and remapped.
This was necessary: a lot of the History tab, the Share Progress export
card, and the Chart.js configs build their own inline styles in
JavaScript rather than pulling from the stylesheet, so a CSS-only pass
would have left large parts of the app still showing the old palette.

## Typography

`Bebas Neue` (display) + `DM Mono` (data/labels) + `DM Sans` (body) →
`Outfit` (display + body, 700 weight added explicitly since Outfit isn't
inherently bold the way Bebas Neue is) + `JetBrains Mono` (data/labels),
matching the landing page. Updated everywhere: the stylesheet, the
Google Fonts `<link>`, every inline `style="font-family:..."` in
`index.html`, and every JS file that sets font-family in a template
string or a Chart.js config object.

## Signature: keycap motif

Added a small `.keycap-mark` element (`^` symbol, styled like a
physical key) before the header wordmark, matching the landing page's
brand signature. This is the one place `index.html`'s DOM structure
changed (one new `<span>`), everything else in the file is attribute-
and text-only edits.

## Execution fixes carried over from the v1 pass

- All neon glows (up to 40px blur / 0.3 opacity) trimmed to a
  restrained 4–14px / 0.1–0.25 range, now in the new amber hue.
  This included spots the first pass didn't reach, since they live in
  `history.js` and `workout.js` template strings, not the stylesheet.
- One border-radius outlier (`7px` → `8px`) fixed.
- `prefers-reduced-motion` support added (was missing entirely):
  a global CSS block plus the one JS line in `js/ui.js` that zeroes the
  GSAP tab-transition duration when the OS preference is set.

## Copy fixes

Every user-visible em-dash was rewritten (commas, periods, or a colon,
depending on what reads naturally) across the tutorial modal, toast
messages, empty states, and the readiness-signal labels in
`history.js`, `workout.js`, and `data.js`. Left alone: em-dashes inside
code comments (invisible to users) and the handful of lone `'—'`
placeholders used as an "no value yet" symbol (e.g. bodyweight not
logged, workout duration missing) — those are a UI convention, not
prose, and match the same placeholder already used elsewhere in the app.

## What wasn't touched

- No IDs, class names, or `onclick` handlers changed anywhere.
- No JS logic changed except the one reduced-motion line.
- The 175 inline `style=""` attributes in `index.html` that are purely
  layout (padding, margin, flex properties, not color/font) are still
  there. Only the ones carrying color or font values were touched,
  since those were the ones tied to the old brand identity.

## Verification performed before packaging

- `node --check` passed on all 12 JS files (no syntax errors introduced
  by the string replacements).
- `<div>` open/close tag count in `index.html`: 285/285, identical to
  the original, confirming no structural change beyond the one keycap
  `<span>`.
- CSS `{`/`}` brace count: 480/480 (balanced), 4 pairs more than the
  original's 476/476, matching the two new rule blocks added
  (`.keycap-mark` and the reduced-motion media query).
- Full project-wide grep sweep for every old hex/rgba literal and old
  font-family string: zero remaining outside of code comments.
- Line endings: the five `.js` files touched via scripted edits were
  restored to their original CRLF convention (my first editing pass
  had accidentally normalized them to LF, which would have made a real
  git diff of this change unreadable).
