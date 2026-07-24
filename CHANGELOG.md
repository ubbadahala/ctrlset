# Changelog

All notable changes to CtrlSet are documented here, most recent first.

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
