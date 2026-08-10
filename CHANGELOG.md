# Changelog

All notable changes to CtrlSet are documented here, most recent first.

## Fixed Missing Animation on 4 Overlays (Not an iOS Bug — a Gap in the GSAP Rollout)

The previous GSAP rollout removed the CSS `transition` that `.modal-overlay`/`.confirm-overlay` (shared classes) used to rely on, and added the GSAP replacement to the *generic* `openModal`/`closeModal` and `showConfirm`/`dismissConfirm` functions — but missed 4 other places that toggle an overlay sharing those same classes through their **own** dedicated open/close functions rather than the generic ones. Since the CSS transition was gone and GSAP was never wired into these specific functions, they animated with nothing at all — on any platform, not just iOS.

Fixed:
* `js/history.js`: `openRestDayModal()`/`dismissRestTypeModal()` (`#restTypeOverlay`)
* `js/workout.js`: `openRepeatWorkoutModal()`/`dismissRepeatWorkoutModal()` (`#repeatWorkoutOverlay`)
* `js/data.js`: `setExerciseInjuryNote()`/`dismissInjuryNoteModal()` (`#injuryNoteOverlay`)
* `js/auth.js`: all 5 places that show/hide `#authOverlay` (the login/signup screen) — `checkSession()`'s both branches, login success, signup-with-immediate-session, and logout. This one's the most significant, since it's one of the first things a user interacts with.

All four now call the same `_gsapOpenOverlay`/`_gsapCloseOverlay` helpers already used by the generic functions. Verified every overlay element in `index.html` sharing `.modal-overlay`/`.confirm-overlay` (9 total) is now accounted for and routes through one of these paths.

Note: `#authOverlay`'s inner `.auth-modal` box has always used its own self-contained `@keyframes modalEnter` animation (not the CSS `transition` that was removed), so it's unaffected either way — the fix here only concerns the overlay background's fade.

## GSAP Applied Across the App's JS-Orchestrated Animations

Extended GSAP (previously only used for tab transitions) to the rest of the app's JS-driven animation/transition points. Scoped to animations that are actually orchestrated by JS — pure CSS `:hover`/`:active` micro-states are correctly left as plain CSS (GSAP's own guidance too, and cheaper for the browser than routing simple state changes through JS).

**Converted:**
* `js/ui.js`: `animateValue()` (the number count-up used for stats like total volume/streak) — replaced the hand-rolled `requestAnimationFrame` loop and manual `easeOutQuart` math with a GSAP tween.
* `js/achievements.js`, `js/history.js`: the staggered entrance for Achievement badges and History cards now uses GSAP's native `stagger` option instead of computing `animation-delay` per item index in the template string — same visual effect, more idiomatic.
* `js/charts.js`: `toggleDetailedCharts()` — this previously had **no animation at all** (instant show/hide); now fades/rises in via GSAP. Deliberately not animating `height` here, even though that's the more typical accordion approach — this section holds 4 Chart.js canvases, and `height` is a layout-triggering property that would force a reflow of that whole subtree every frame. Opacity/transform is compositor-only and cheap, consistent with this app's iOS performance history.
* `js/ui.js`: toast notifications (`toast()`/`toastWithUndo()`) now share a `_animateToastIn`/`_dismissToast` helper pair, replacing the previous CSS-animation + `animationend`-listener approach.
* `js/ui.js`: `openModal`/`closeModal` and `showConfirm`/`dismissConfirm` (covering workout view/edit, recovery edit, tutorial, and every confirm-style dialog including rest-type/repeat-workout/injury-note) now share `_gsapOpenOverlay`/`_gsapCloseOverlay` helpers instead of CSS `transition` on class toggle.
* Removed the now-redundant CSS (`transition`/`animation` properties, unused keyframes) everywhere GSAP took over.

**Deliberately left as CSS**, with reasoning:
* **Confetti** (`triggerConfetti()`) — creates ~50 simultaneously-animating particles; CSS keyframe animations run on the compositor thread independent of JS, which is cheaper than 50 individual GSAP tweens for something this disposable/fire-and-forget.
* **Button/input hover, active, and focus states** — simple, declarative, state-driven; converting these to GSAP would be against GSAP's own best-practice guidance and adds JS overhead for no benefit.
* **Recap page entrance** (`.recap-inner`'s `slideIn`) and **rest timer widget** (start/minimize/maximize/stop) — both already animate via mechanisms that don't have the `display:none`-timing bug the tab transitions had (recap's content is freshly inserted HTML each render; the rest timer widget uses opacity/pointer-events toggling, never `display:none`), so converting them wouldn't fix anything, just add risk for no functional gain. Can revisit if wanted purely for stylistic consistency.

## Fixed "Delete" Text Bleeding Through History Cards

The swipe-to-delete red background (always structurally present behind each workout card, normally revealed only by sliding the card away) was becoming visible on regular cards without swiping. Root cause: `.glass-panel` is only ~45% opaque with a blur, and after the staggered entrance animation was added to `.workout-entry-wrap` (animating the wrap's own opacity), that combination created a compositing pass where the semi-transparent, blurred card let the red "Delete ✕" bleed through during the fade-in.

* `css/style.css`: `.swipe-delete-bg` now starts at `opacity: 0` by default — genuinely hidden, not just relying on the card in front of it being opaque enough to mask it.
* `js/history.js`: `attachSwipeDelete()` now explicitly sets the delete background's opacity to 1 only while actively swiping, and back to 0 on cancel/reset.
* Also fixed a small inconsistency noticed while in there: the swipe-to-delete confirm dialog said "will be permanently removed" with no mention of undo, even though the delete it triggers does support undo — now matches the wording used elsewhere.

## Rebuilt Tab Transitions on GSAP

Replaced the hand-rolled CSS-keyframes + class-toggling + double-`requestAnimationFrame` transition with a GSAP timeline. The previous version's core fix (forcing a paint between the `display:none→block` switch and the animation start) worked around the underlying WebKit quirk; GSAP avoids it natively, since it animates by setting inline styles directly through its own `requestAnimationFrame`-driven ticker rather than relying on CSS `animation` timing — the same class of problem GSAP is specifically known for handling reliably on iOS Safari.

* `index.html`/`sw.js`: added GSAP (cdnjs, same CDN pattern already used for Chart.js/html2canvas) as a new dependency, cached for offline use. Bumped the service worker cache version since the app shell file list changed.
* `js/ui.js`: `switchTab()` now builds a `gsap.timeline()` — exit tween, a `.call()` step that swaps which view is active and runs the page's render calls, then an enter tween — instead of manually sequencing `setTimeout`s and CSS animation classes. Includes a plain-JS fallback (instant switch, no animation) if GSAP fails to load, e.g. first load with no connection before the service worker has cached it.
* `css/style.css`: removed the now-unused `@keyframes viewExitLeft/Right/EnterFromLeft/Right` and `.view-exit-*`/`.view-enter-*` classes.
* `js/workout.js`: tightened `goAddExerciseInSettings()`'s timeout to match GSAP's exact, guaranteed timeline duration (360ms) instead of the previous conservative buffer needed to cover rAF-delay uncertainty.

## Fixed Tab Transitions Not Being Fluid on iOS

Root cause: the entrance step switched a view from `display:none` to `display:block` and added its animation-triggering class in the same synchronous tick. iOS Safari specifically needs an actual paint to happen between those two things, or it just snaps straight to the animation's end state instead of playing it — a well-documented WebKit quirk, and the reason the slide felt fine conceptually but not fluid in practice on iOS.

* `js/ui.js`: `switchTab()` now waits for a double `requestAnimationFrame` after setting `display:block`, guaranteeing a real frame has painted with the pre-animation styles before the entrance animation class gets added.
* `css/style.css`: added `will-change: transform, opacity` to the transition classes, hinting the browser to promote them to their own compositor layer ahead of time rather than mid-animation (which reads as a stutter).
* Also reset scroll position to the top when a new tab becomes active, so the incoming view doesn't appear mid-scroll from wherever the previous tab was left.
* `js/workout.js`: bumped `goAddExerciseInSettings()`'s timeout (420ms → 480ms) to keep pace with the transition's now-slightly-longer total duration from the added rAF delay.

## Staggered List-Item Entrance Animations

Added a staggered fade-in to the two *bounded* lists in the app — deliberately scoped to only these two, given the app's confirmed history of iOS Safari struggling with many simultaneously-animated `.glass-panel` (backdrop-filter) elements at once:
* **History list** — capped at 7 items per page, each fading in ~40ms after the previous.
* **Achievement badges** — fixed at 15, each ~25ms after the previous.

Both reuse the existing `fadeIn` keyframe (already used by `.rest-entry`) rather than introducing a new animation, with `animation-delay` set per item based on its index and `both` fill-mode so items don't flash visible before their delay elapses.

**Caught and fixed a UX issue this introduced**: the History search box re-renders the list on every keystroke (`oninput`), which would have replayed the full stagger cascade on every character typed — felt glitchy rather than fluid. Added `debouncedRenderHistory()` (250ms) so the list only actually re-renders once typing pauses. Muscle/sort/date-range filters use `onchange` (fires once per selection, not per-keystroke) so they didn't need the same fix. Achievements aren't triggered by any rapid-fire input, so no debounce was needed there either.

## Directional Tab Transitions + Sticky Session Timer

* **Tab switching now slides directionally** instead of cutting instantly — moving to a tab further right (e.g. Log → Progress) slides content out to the left and the new tab in from the right, and vice versa for moving left, matching standard mobile tab-bar UX. Implemented as a sequential exit-then-enter (not a true overlapping crossfade) to avoid restructuring the layout into an absolute/grid overlap just for this — simpler, and lower-risk given this app's past sensitivity to GPU-heavy effects on iOS Safari. Total transition ~360ms (180ms out, 180ms in).
* Fixed a timing regression this introduced: `goAddExerciseInSettings()` (jumps to Settings and focuses the new-exercise field when you tap "add it in Settings" from an unmatched exercise name) had a `setTimeout` tuned for the old instant tab switch; bumped to account for the new animated transition so it doesn't try to focus a field before the tab has actually finished sliding in.
* **The session timer bar no longer disappears when you scroll** during an active workout — it's now `position: sticky` at the top of the Log page instead of scrolling away with the rest of the form. Given its own precedent (the floating "End Session" button was already `position: fixed`), this closes the gap where you could end a session from anywhere but couldn't see the clock from anywhere. Background made more opaque (no blur) so scrolled content underneath doesn't show through distractingly.

## Settings Page Organization

Grouped Settings' 8 previously-flat cards into labeled sections, reusing the same section-label pattern from the Progress page hierarchy work (generalized `.progress-section-label` into a shared `.section-label` class):
* Help & Tutorial stays at the top, ungrouped (quick access, not a configuration item)
* **👤 Account** — Account
* **⚙️ Preferences** — Appearance, Weekly Volume Target, Workout Reminders
* **🏋️ Exercises** — Exercise Database
* **💾 Data** — Data & Backup (Danger Zone stays nested inside this card as before, already visually distinct via its red styling)

No functional changes — this is purely reordering/labeling the existing cards.

## Progress Page Visual Hierarchy

Reorganized the Progress page from a flat stack of ~10 equal-weight cards into a clearer hierarchy:
* **Hero** — Achievements stays at the top, unchanged.
* **🔎 Insights** (new section label) — This Month vs Last Month and Plateau Watch, grouped together since both are "notice/act on this" cards rather than reference data. Plateau Watch moved up from below Personal Records to sit next to the other insight card.
* **📋 Overview** (new section label) — Training Consistency (heatmap) and Personal Records, the two most frequently-glanced-at reference cards.
* **📊 Detailed Charts** (new collapsible section, collapsed by default) — Nutritional Consistency, Muscle Group Distribution, Strength Over Time, Bodyweight Trend, and Volume by Muscle Group. Collapsing this also shortens the page for anyone who mainly cares about the top-tier cards; the choice is remembered in localStorage.
* Chart.js instances get an explicit `.resize()` call when the section is expanded, as a safety net in case a chart rendered at 0×0 while its container was hidden (Chart.js's own responsive/ResizeObserver handling should already cover this, but it's a cheap defensive addition).
* Minor cleanup: Plateau Watch's title color now uses the `var(--warning)` variable (from the light-mode contrast audit) instead of the hardcoded hex it still had.

## Light Mode Contrast Audit

A full pass across every element for light-mode visibility/contrast issues. Two recurring bug patterns accounted for most of it:

**Pattern 1 — pastel/neon colors tuned only for the dark background.** Several elements used bright or pastel colors (bright green/red/orange/blue) designed to pop against the near-black dark-mode background; the same colors have poor contrast against the light-mode near-white background.
* Introduced light-mode-safe `--green` (`#1b8a4a`), `--red` (`#d32f2f`), and a new `--warning` (`#b8620a`) variable, fixing every usage of those at once: live set deltas (`.delta-pos`/`.delta-neg` — shown on every set typed during logging), Plateau Watch suggestions, Daily Readiness labels, achievement/period-comparison trend colors, and more.
* Added targeted light-mode overrides for the remaining one-off pastel colors that didn't map to those variables: destructive/danger buttons, the exercise-name validation warning, the injury-flag caution, rest-day entry titles, and the header tagline.
* Fixed the same root cause in **Chart.js configurations**: every chart (Volume by Muscle Group, Bodyweight Trend, Strength Over Time, Muscle Group Distribution) hardcoded neon axis-label colors and near-invisible-on-white gridlines directly in its JS options, which silently overrides the app's existing `Chart.defaults` theme handling. Added a shared `chartThemeColors()` helper so every chart now picks correct tick/grid/tooltip colors based on the active theme.

**Pattern 2 — a hardcoded dark background paired with a theme-variable text color.** Several floating/popover-style elements have their own always-rendered dark background, with text using `var(--text)`/`var(--accent)`/etc. — fine in dark mode (where those variables are already light-colored), but in light mode those variables switch to dark text, which then renders as dark-on-dark against the same never-changing dark background — i.e. **invisible**. Found and fixed in:
* The exercise-name search/autocomplete dropdown (used constantly while logging)
* The "LOGS" exercise-history peek popover
* Toast notifications (shown on nearly every action in the app)
* The login/signup screen itself (`.auth-modal`) — reachable in light mode after logging out with light mode previously enabled; the theme isn't known before first login, so this specific screen had never been exercised in light mode before
* The mini rest-timer pill (forced to keep its bright accent color instead, since its background is intentionally always dark by design, unlike the others above)
* The Settings exercise database row inputs (`.settings-exercise-name`/`.settings-exercise-muscle`), which had higher CSS specificity than — and were silently shadowing — the app's existing global light-mode input styling
* A few scattered inline `rgba(255,255,255,0.05)` dividers/backgrounds (recovery history rows, PR muscle tags, nutrition stack indicators) that read as near-invisible hairlines on a light background — replaced with the existing, already-tuned `var(--glass-border)`

No dark-mode values were changed — every fix here is additive (`body.light-mode` overrides or new light-mode-specific variable values), so dark mode's appearance is untouched.

## Blur Rule: Full-Screen Takeovers Get Blur, Popup Modals Don't

* Restored `backdrop-filter: blur(20px)` on `.recap-overlay` (+ light-mode override), following the same reasoning as the earlier rest-timer restoration: it's a full-screen scrollable page takeover (hero, stats, table), not a small centered popup box, so it doesn't carry the nested-backdrop-filter-over-a-long-list risk that caused the original History crash.
* Established rule going forward: full-screen page takeovers (`.recap-overlay`, `.rest-timer-widget`) use blur; small centered popup boxes (`.modal-overlay`, `.confirm-overlay`, the auth overlay) stay solid-background-only.
* Note: `.modal` (used by `viewWorkoutModal`, the overlay directly implicated in the original History crash) is actually similarly sized to `.recap-inner` (`max-width: 680px`) — but since it's the specific one confirmed to crash, it stays blur-free regardless of box size rather than reintroducing that risk.

## Restored Blur on the Rest Timer Widget

* Reverted `.rest-timer-widget` back to its original `backdrop-filter: blur(24px)`, unlike the other popup overlays. It only ever appears during an active workout session (Log page), never over a long History list of `.glass-panel` cards — which was the actual iOS crash trigger for the other overlays — so there's no real risk here, and the blur look is worth keeping for this one.

## Background Scroll Lock When a Popup Is Open

* The page behind any open popup (modals, confirm dialogs, recap, the rest timer, the auth gate) can no longer be scrolled while it's open.
* Added `lockBodyScroll()`/`unlockBodyScroll()` (counter-based, so it stays correct even with rapid or nested open/close calls) to every overlay open/close pair in the app: `openModal`/`closeModal`, `showConfirm`/`dismissConfirm`, the rest-day-type/repeat-workout/injury-note modals, recap, the rest timer widget (including its minimize/maximize pill behavior — scroll unlocks while minimized to a pill, since that's no longer blocking), and all 5 scattered auth-overlay show/hide points in `auth.js`.
* Uses `position: fixed` on `<body>` rather than just `overflow: hidden`, since the latter alone doesn't reliably stop scroll/touch-rubberbanding on iOS Safari. Scroll position is saved before locking and restored after unlocking so the page doesn't visually jump.
* Fixed a related pre-existing bug while in there: the click-outside-to-dismiss handler for `.modal-overlay` manipulated the class directly instead of calling `closeModal()`, meaning it never removed the `.app-background-scaled` dimming effect — dismissing a modal by tapping outside it left the background permanently dimmed/scaled. Now routes through `closeModal()` properly.

## Consistent No-Blur Backgrounds Across All Popup Overlays

* Applied the same no-`backdrop-filter` solid-background approach (already used for `.modal-overlay`) to every other full-viewport popup overlay in the app, for both visual consistency and to close off remaining instances of the same iOS Safari crash risk:
  - `.confirm-overlay` (confirm dialogs, rest-type/repeat-workout/injury-note modals)
  - `.recap-overlay` (end-of-session recap), including its light-mode override
  - The auth/login gate overlay — this one had an **inline** `backdrop-filter: blur(12px)` in `index.html` that bypassed the `.modal-overlay` class fix entirely
  - `.rest-timer-widget` (full-page rest timer) — had the heaviest blur of all of them (24px)
* All five now use the same solid `rgba(5,5,5,0.88)` background (or the light-mode equivalent) instead of blur.
* Left smaller UI elements alone (buttons, toasts, dropdowns, skeleton loaders) — those aren't full-viewport popups and carry much less compositing cost; a much smaller-scoped change if wanted later.

## Root Cause Found: iOS Crash Was the History List Itself, Not the Modal

* Confirmed (via testing with a filtered vs. unfiltered History list) that the crash wasn't actually about the modal at all — it was the number of simultaneously-rendered `backdrop-filter` elements. Every workout/rest entry in History uses `.glass-panel`, which applies `backdrop-filter: blur(16px)`; each one needs its own GPU compositing layer, and History had no pagination — a full, unfiltered history could render hundreds of these at once. That many simultaneous backdrop-filter layers is a confirmed iOS Safari/WebKit crash cause, independent of whatever triggers the interaction (opening a modal just happened to be the moment it tipped over).
* **Fix: pagination.** History now renders a maximum of 7 entries at a time (workouts + rest days combined), with Prev/Next controls. This directly caps the number of simultaneous `.glass-panel` elements regardless of how much history exists, while keeping the existing visual style (backdrop-filter blur) intact rather than swapping it out. The page resets to 1 whenever search/muscle/sort/date-range filters actually change, but is preserved across other re-renders (delete/undo, sync, etc.).
* Checked the rest of the app for the same unbounded-list pattern: the Personal Records grid also uses `.glass-panel` per card but is already capped at 10 entries, so it was never actually at risk. Recovery History rows don't use `.glass-panel` at all.
* The two earlier fixes below (removing `filter: blur()` from the modal background-scale effect, and removing `backdrop-filter` from `.modal-overlay`) were valid fixes for real (if smaller) risks, but this pagination fix is what actually resolves the reported crash.

## Follow-up: iOS Crash on Opening Workout Details from History

* The previous crash fix (removing `filter: blur()` from `.app-background-scaled`) didn't fully resolve it — the crash was still reproducible specifically when opening workout details from History. Root cause: `.modal-overlay` used `backdrop-filter: blur(12px)`, sitting on top of a page that can have a long list of `.glass-panel` cards (every workout entry), each *already* using `backdrop-filter: blur(16px)` of its own. Stacking another backdrop-filter blur over a potentially long list of individually-blurred elements is a known severe iOS Safari/WebKit compositing crash pattern. Removed `.modal-overlay`'s backdrop-filter entirely, compensating with a darker solid background (`rgba(5,5,5,0.88)`) for similar visual separation without the blur computation.

## Critical Fixes: iOS Crash on Modal Open, Share/Save Image on Safari

* **iOS crash when opening workout details (or any modal):** `.app-background-scaled` applied `filter: blur(4px) brightness(0.7)` to `#mainAppContent`, which wraps the entire app including all Progress page `<canvas>` charts. Combining `filter` with `transform` on a large container holding multiple canvases is a known iOS Safari/WebKit GPU-compositing crash trigger, especially under the tighter memory limits of a homescreen-installed PWA — manifesting as the app crashing and reloading repeatedly whenever a modal (like workout details) opened. Replaced the filter-based dim effect with a plain translucent overlay (`::after` + opacity), keeping the cheap `transform: scale()` "receding background" effect but removing the expensive/crash-prone filter entirely.
* **"Save Image" not working on iPhone (Safari, including homescreen-installed PWA):** Both Share Workout and Share Progress used an `<a download>` trick to trigger a save, which iOS Safari does not reliably support — it either navigates to the raw image instead of downloading, or does nothing visible at all in standalone PWA mode. Added `sharePosterImage()`, which uses the Web Share API (`navigator.share()` with a `File`) when available — this opens the native share sheet on iOS/Android, from which "Save Image" actually works — falling back to the original direct-download approach on desktop browsers that don't support sharing files.

## Help & Tutorial

* Added an in-app "📖 How CtrlSet Works" tutorial — an accordion modal covering every major feature area (logging, recovery & rest days, daily readiness, injury flags, history & recap, progress/achievements/plateau watch, reminders, backup, and PWA install). Reachable anytime from Settings, and shown automatically once for brand-new users (no workouts logged yet, never dismissed before) so first-time users get oriented without hunting for a help menu.

## Readiness & Safety

* **Daily Readiness Score:** A card at the top of the Log page reads today's (or yesterday's) sleep and soreness logs plus how many consecutive days you've trained without a break, and shows a simple Fresh/Moderate/Fatigued signal with plain-language reasons — rule-based and explainable rather than a black-box score. Stays hidden until there's enough data to say anything meaningful.
* **Injury Flags:** Exercises in Settings can now be flagged with a note (e.g. "aggravates my shoulder"). Selecting that exercise while logging a workout — in either the main log form or the History edit modal — shows a gentle caution with the note, rather than relying on memory.

## Share Progress

* Added a "📸 Share" button on the "This Month vs Last Month" Progress card. Generates a downloadable poster image (same style as the existing workout-recap share) summarizing the current calendar month: total volume, workout count, best streak, any PRs hit this month, and total achievements unlocked — reuses the existing `html2canvas` pipeline and off-screen share-card container rather than introducing new rendering machinery.

## Codebase Health Pass

* **Docs split:** Moved the detailed, dated feature history out of `README.md` into this file, so the README stays a clean product overview instead of a growing log.
* **Unit tests:** Added `tests/` with Node's built-in test runner covering the pure logic most at risk of a silent regression: `isStagnant()`, `computeBestStreakFromDates()`, `computeAchievements()` (including PR-counting and unlock-date correctness), and the period-comparison math (`computePeriodStats()`/`getMonthBounds()`). Uses a small `vm`-based harness (`tests/harness.js`) to run the actual source files with minimal DOM stubs — no bundler or headless-browser dependency needed.
* **Tracked migrations:** Recreated `supabase/migrations/` as numbered, dated SQL files (schema only, no secrets) covering everything shipped since the original v4.0 base schema: `rest_type`, the reminder settings columns, and `push_subscriptions`. The Web Push Edge Function and its VAPID secrets remain deployed and tracked outside this repo.

## v4.1 — Reliability, UX & Engagement

### 🐛 Reliability Fixes
* **Session Restore:** Fixed a race condition where resuming a draft after closing the browser wouldn't show the "last session Xd ago" bar or live set deltas — both depend on workout history that loads asynchronously from Supabase, and the restore path ran before that data arrived. Both now recompute once cloud sync completes.
* **Recovery Log Editing:** Fixed a copy-paste bug where editing a recovery log referenced the wrong Supabase client variable, causing every edit to silently fail.
* **Exercise Management:** Discovered and implemented a missing `saveExercises()` function — renaming an exercise, changing its muscle group, deleting it, or restoring defaults were all silently failing before ever reaching the cloud.
* **Import Deduplication:** Fixed the JSON import engine to also catch duplicate exercise names *within* the same backup file (previously only checked against exercises already in the cloud).
* **Chart Wrapper Bug:** Fixed the Volume by Muscle Group chart grabbing the wrong `.chart-wrap` element (the first one in the DOM, belonging to a different chart) instead of its own.

### 📱 Mobile & Navigation UX
* **History Sub-Tabs:** Split the History page into Workouts / Recovery tabs so recovery logs no longer require scrolling past the entire workout feed to reach.
* **Recap Page Alignment:** The end-of-session recap now matches the History detail view's structure — grouped by exercise with stacked sets and a Muscle column, instead of one row per individual set.
* **Undoable Deletes:** Deleting a workout or rest day now shows an "Undo" toast with a 5-second grace period before the cloud delete actually fires, instead of an instant permanent delete.
* **Autosave Indicator:** A subtle "✓ Saved" flash now confirms every autosave tick during an active session.
* **Date-Range Filter:** History can now be filtered by preset ranges (7/30/90/365 days) or a custom From/To range, alongside the existing muscle and sort filters.
* **Rest Day Types:** Rest days can now be logged as Active Rest (cardio, walk, mobility) or Complete Rest, editable in place after logging via a 🔄 toggle — no more delete-and-relog.
* **Recovery Reminder:** A dismissible banner nudges you on the Log page if recovery hasn't been logged today or in several days.
* **Loading Skeletons:** All Progress page cards (heatmap, PRs, radar, strength, bodyweight, volume chart) now show skeleton loaders during initial cloud sync instead of flashing empty.
* **Exercise Rename & Merge:** Renaming an exercise in Settings now offers to propagate the change across past workout history too, so search/PRs/strength charts don't carry a typo forever. Renaming onto an existing exercise name merges the two instead of blocking with a "name already exists" error.
* **Pick-From-List Exercise Names:** The exercise name field (in both the main logging form and the History edit-workout modal) is now a searchable pick-list instead of free text with a datalist. Typing filters your existing exercises live with muscle group shown per match; typing something that doesn't match flags the field and offers a direct link to add it in Settings first. Saving is blocked if any exercise name still doesn't match a known exercise, preventing typos from becoming silent duplicate entries.

### 🔁 Repeat Workout
* A "Repeat Workout" button next to the Workout Name field opens a picker of past workout names (most recently used first). Selecting one clones that workout's exercises, sets, and reps into a new draft — weights start blank so today's numbers are entered fresh rather than silently carried over from last time.

### 🏅 Achievements
* **15 Badges:** Workout count (1/10/50/100), streak (3/7/14/30 days), lifetime volume (1K/10K/50K/100K/500K kg), and PR count (1/10/50) milestones, shown as a badge grid at the top of the Progress page with unlock dates and live progress toward locked ones.
* **Real-Time Unlocks:** Achievements are checked the moment a workout is saved — newly-crossed badges trigger a toast + confetti immediately.

### ⚠️ Plateau Watch
* Surfaces the app's existing stagnation-detection logic (previously only reachable via a manual "predict" button mid-workout) as a proactive Progress page card — any exercise stuck at the same weight for 3+ sessions is flagged with a suggested deload weight.

### 📊 This Month vs Last Month
* A period-over-period comparison card on the Progress page — Volume, Workouts, PRs Set, and Best Streak for the current calendar month against the previous one, each with a trend arrow and percentage change.

### 📴 PWA / Offline Support
* **Installable:** Added a web app manifest and properly sized icons so CtrlSet can be installed to a home screen like a native app.
* **Offline App Shell:** A service worker caches the app shell (HTML/CSS/JS/CDN libraries) so the app loads without a connection. Supabase API calls are explicitly excluded from caching so online/offline error handling still behaves correctly.
* **Install Shortcuts:** Long-pressing the installed app icon offers "Start Workout" and "Log Recovery" shortcuts that jump straight to the relevant part of the app.
* **Scope note:** this covers offline *loading* and installability, not offline *writes* — saving a workout still requires a connection. Draft autosave (localStorage) already works offline independent of this.

### 🔔 Workout Reminders
* Settings now has a day-of-week picker for "usual training days" plus an enable toggle. On a selected day, if a workout hasn't been logged yet, CtrlSet sends a real push notification — one that arrives even if the app/browser is fully closed, the same way a native app's notifications work.
* Backed by a Web Push subscription (stored per-device in `push_subscriptions`) and a Supabase Edge Function (`send-workout-reminders`) that runs on a schedule, checks who's due, and sends the push via VAPID-signed Web Push. Deployment for this piece lives outside this repo.
* **iOS note:** requires installing CtrlSet to the home screen first (Settings → Share → Add to Home Screen), and iOS 16.4+. Push notifications don't work in ordinary mobile Safari tabs.
* A same-tab Notification API check still runs as a lightweight fallback whenever the app happens to be open, independent of the push pipeline.

## v4.0 — Cloud Migration

This major release transitioned the application from local browser storage to a secure, relational PostgreSQL database with real-time cloud synchronization.

### ☁️ Supabase Authentication & Security
* **Full Auth Flow:** Implemented Email/Password authentication with a custom glassmorphism modal.
* **Email Verification:** Added support for secure email confirmation links with a custom inline "Check Your Email" UI state.
* **Row-Level Security (RLS):** Locked down the entire database. Users can only read, insert, update, and delete their own specific records based on `auth.uid()`.
* **Automated User Triggers:** Deployed a PostgreSQL `SECURITY DEFINER` trigger to automatically mirror authenticated users into the public `users` table for flawless Foreign Key relations.

### 🔄 Data Architecture & Cloud Sync
* **Relational Database Design:** Shifted from flat JSON arrays to normalized SQL tables (`workouts`, `workout_sets`, `recovery_logs`, `rest_days`, `exercises`, `user_settings`).
* **Master Sync Engine:** Replaced synchronous local data fetches with `syncDataFromSupabase()`, an asynchronous engine that fetches and reconstructs the complex relational data (like joining `workout_sets` to `workouts`) into the frontend UI state on login.
* **Asynchronous CRUD Operations:** All save, edit, and delete functions now push directly to the cloud, utilizing `upsert` logic to seamlessly handle data conflicts.

### 💽 Smart Backup & Import Parsing
* **UUID Dictionary Mapping:** Completely rewrote the JSON import engine to handle legacy local backups. The importer now uploads custom exercises to the cloud, retrieves their new UUIDs, builds a local dictionary, and accurately maps those IDs to the relational `workout_sets` during bulk upload.
* **Deduplication:** The import engine automatically filters out duplicate custom exercises to keep the database clean, both against existing cloud data and within the same backup file.
* **Secure Data Wipes:** The "Delete All Data" feature now issues cascading delete commands to the cloud database, securely wiping all user-specific rows.

### ⚙️ UI & Settings Synchronization
* **Cloud Settings:** The Light Mode preference and Weekly Volume Target are now saved to the `user_settings` table and sync across devices automatically.
* **Account Display:** Added an active account module in the Settings tab to display the currently logged-in user's email.
* **Gatekeeper UI:** The authentication modal strictly prevents users from accessing the underlying app or closing the modal if a valid session token is not detected.
