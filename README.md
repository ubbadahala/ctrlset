# 🏋️ CtrlSet: Cloud-Native Gym Tracker

CtrlSet is a fast, single-page strength training tracker — log workouts, track recovery metrics, and watch your personal records build over time. Built with vanilla JavaScript and backed by Supabase for real-time cloud sync across devices.

For the detailed, dated history of every update, see **[CHANGELOG.md](./CHANGELOG.md)**.

## ✨ What CtrlSet Does

* **Workout logging** with live per-set deltas against your last session, rest timers, and 1RM estimates
* **Repeat Workout** — reload a past routine's exercises into a new draft in one tap
* **Recovery tracking** — sleep, protein, bodyweight, supplements, and soreness, with reminders if you fall behind
* **Rest day logging** — Active Rest or Complete Rest, editable after the fact
* **History** — searchable, filterable by muscle group and date range, with an editable detail view per workout
* **Progress dashboards** — training consistency heatmap, personal records, muscle group distribution, strength-over-time, bodyweight trend, and a month-over-month comparison card — with a one-tap **Share Progress** poster export
* **Plateau Watch** — proactively flags any exercise stuck at the same weight for 3+ sessions with a suggested deload
* **Achievements** — 15 badges across workout count, streaks, lifetime volume, and PR milestones, unlocked in real time
* **Workout Reminders** — real push notifications (wakes a closed app/browser) on your usual training days if you haven't logged yet
* **Installable PWA** — works offline for loading/browsing, installable to a home screen with quick-action shortcuts
* **Cloud sync** — Supabase-backed auth, relational data model, and full JSON/CSV import-export

## 🛠️ Tech Stack

* **Frontend:** Vanilla JavaScript (ES6+), HTML5, CSS3 (custom glassmorphism UI)
* **Backend:** Supabase (PostgreSQL, GoTrue Auth, Edge Functions)
* **Data Visualization:** Chart.js
* **Export Generation:** html2canvas
* **Offline Support:** Service Worker + Web App Manifest
* **Push Notifications:** Web Push (VAPID) via a Supabase Edge Function

## 📁 Project Structure

```
├── index.html              # App shell + all views
├── css/style.css           # All styling
├── js/
│   ├── auth.js              # Supabase auth flow
│   ├── state.js             # Global state + cloud sync engine
│   ├── utils.js              # Shared pure helpers (dates, 1RM calc, stagnation check)
│   ├── ui.js                 # Toasts, confirm dialogs, tab switching
│   ├── timers.js              # Session clock, rest timers, draft autosave/restore
│   ├── data.js                 # Settings, backup import/export, reminders
│   ├── workout.js               # Workout logging, editing, exercise name autocomplete
│   ├── charts.js                 # Progress page charts + Plateau Watch + period comparison
│   ├── history.js                  # History feed, recap, rest day logging
│   ├── achievements.js               # Badge definitions + unlock computation
│   └── push.js                        # Web Push subscribe/unsubscribe
├── sw.js                    # Service worker (offline cache + push handling)
├── manifest.json            # PWA manifest
├── supabase/migrations/     # Tracked schema history (see below)
└── tests/                   # Unit tests for pure logic (see below)
```

## 🧪 Running Tests

Pure logic with no DOM dependency (achievement unlocking, stagnation detection, streak calculation, period-comparison math) has unit test coverage under `tests/`, using Node's built-in test runner — no install required beyond Node itself (v18+).

```bash
node --test "tests/*.test.js"
```

## 🗄️ Database Schema Migrations

Schema changes are tracked as dated SQL files in `supabase/migrations/`, applied via the Supabase SQL editor or `supabase db push`. See that folder for the current set and what each one is for. Web Push deployment (Edge Function + secrets) is documented separately and kept out of this repo since it involves credentials — ask if you need the walkthrough again.
