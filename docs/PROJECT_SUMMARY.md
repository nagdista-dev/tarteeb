# Project Overview

**Tarteeb** is a full-featured Muslim daily planner built with **React 19 + Vite + Tailwind CSS**. It organizes the day around the five Islamic prayer times using a **Maghrib-to-Maghrib** day cycle. Every day starts at sunset (Maghrib) and flows through five prayer-based periods: Evening (Maghrib→Isha), Night (Isha→Fajr), Morning (Fajr→Dhuhr), Afternoon (Dhuhr→Asr), and Late Afternoon (Asr→Maghrib). Tasks are scheduled inside these blocks with collision-free time slots.

**Main goals:**
- Provide a spiritually-aligned daily planner centred on Islamic prayer times
- Enable complete task management with prayer-period-based scheduling
- Offer holistic self-tracking: habits, sleep, drinks, prayer tracking, mood, and journaling
- Full bilingual support (English/Arabic) with RTL layout
- Operate entirely client-side with localStorage persistence — no accounts, no servers, complete privacy
- Support PWA installation, push notifications, and offline usage

**Core functionality:**
- Prayer-based vertical timeline view with scrolling day
- Task CRUD with collision-free scheduling within prayer periods
- Fixed prayer tasks (Fajr, Dhuhr, Asr, Maghrib, Isha) and Adhkar (Morning/Evening)
- Recurring tasks that carry over day-to-day
- **Alternative Plan** — a separate, independent backup plan with its own tasks (no fixed prayers, no notifications), accessible via sidebar
- Daily journal with period-specific notes
- Habit tracker with streaks and completion stats
- Sleep tracker with session-based logging
- Drinks tracker
- Prayer tracking (on-time, late, missed)
- Mood tracking
- Pulse/Statistics dashboard with composite productivity score
- Export to Markdown
- Backup/restore all data as JSON
- Push/background notifications via Netlify Functions + GitHub Actions cron
- Light/Dark theme, 12h/24h time format, 4 font sizes
- Full Arabic internationalisation with RTL support

---

# Architecture

## Frontend Structure

### Entry Point
- **`src/main.jsx`** — React entry point, renders `<App />` inside `React.StrictMode`

### Main Application Component
- **`src/App.jsx`** (~4441 lines) — Monolithic single-page application containing all state, logic, and rendering inline. This is the heart of the app.

### Pages (Separated into their own files)
- **`src/pages/GuidePage.jsx`** — "How to Use" guide with 15 step-by-step cards
- **`src/pages/PulseDashboard.jsx`** — Statistics dashboard component (extracted but does not appear to be imported in App.jsx)
- **`src/pages/ContactPage.jsx`** — "Contact Developer" page with WhatsApp link

### Components
- **`src/components/Toast.jsx`** — Toast notification component (inline rendering in App.jsx duplicates this)

### Utilities
- **`src/utils/prayerService.js`** — Prayer time calculations, Aladhan API fetching, local cache, day boundary logic, period/time helpers
- **`src/utils/notificationManager.js`** — Push notification subscription management (Web Push API)
- **`src/utils/constants.js`** — Shared constants (FIXED_TASK_SCHEDULE, PRAYER_KEYS, STATUS_COLORS, etc.)

### i18n
- **`src/i18n.js`** — Full English and Arabic translation dictionaries (1000+ keys each), `t()` helper, `translateTaskName()` for fixed task names

### Styles
- **`src/index.css`** (~7622 lines) — All styles using CSS custom properties for theming, no CSS modules. Includes Tailwind CSS directives. Dark mode via `[data-theme="dark"]` attribute.

### Data
- **`src/data/countries.js`** — Country → Cities mapping for the location settings dropdown

### Service Worker
- **`src/service-worker.js`** — Workbox-injected service worker with cache-first strategy for static assets, push event handling, and notification click handling

## Backend Structure

The app is **serverless** — there is no traditional backend. The "backend" consists of:

### Netlify Functions
- **`netlify/functions/subscribe.js`** — Handles Push Subscription POST (register) and DELETE (unregister) requests
- **`netlify/functions/notify.js`** — Cron-triggered function that checks prayer times and sends push notifications to all subscribers
- **`netlify/functions/utils/blob-store.js`** — Netlify Blob store abstraction for reading/writing subscriptions

### GitHub Actions Workflows
- **`.github/workflows/deploy.yml`** — Builds and deploys to GitHub Pages on push to main
- **`.github/workflows/prayer-notify.yml`** — Every 15 minutes, triggers the Netlify notify function via cron

### Hosting Configuration
- **`netlify.toml`** — Build command, publish directory, function directory, SPA redirect rules

## Data Flow

1. **On app load**, `App.jsx` reads `locationConfig` from `localStorage` (defaults to Cairo, Egypt)
2. `ensurePrayerTimesCached()` checks the local prayer cache (`tarteeb_prayer_cache` in localStorage) for the active date and ±1 day
3. If missing and API is enabled, **Aladhan API** is called via `fetchPrayerTimesFromAPI()`; falls back to default times on failure
4. `getCompiledPrayersForPlannerDate()` assembles the correct prayer times for the logical planner day (in Maghrib mode, Maghrib/Isha come from the previous calendar day)
5. Day data (`tasks`, `diary`, `studyNotes`) is loaded from `tarteeb_day_YYYY-MM-DD` in localStorage
6. If no saved data exists, a new day is created with fixed tasks and any recurring tasks from the previous day
7. All user interactions update `dayData` state, which is immediately persisted to localStorage
8. The real-time clock (10s interval) drives timeline position, prayer notifications, task start/end notifications, and end-of-day reminders

## State Management

All state is managed via React hooks (`useState`, `useEffect`, `useRef`, `useCallback`) in `App.jsx`. There is **no external state management library**. The key state categories are:

| Category | State Variables | Persistence |
|---|---|---|
| UI/Navigation | `currentPage`, `sidebarOpen`, `collapsedPeriods` | In-memory only |
| Theme/Settings | `theme`, `lang`, `fontSize`, `use12h`, `dayStartMode` | localStorage |
| Location | `locationConfig` | localStorage |
| Day Data | `dayData` (tasks, diary, notes, prayerTimes, stats) | localStorage (`tarteeb_day_*`) |
| Alternative Plan | `alternativeDayData`, `altDayDataRef`, `altPageView` ('home' | 'tasks') | localStorage (`tarteeb_alternative_day_*`) |
| Prayer Cache | Retrieved via `getPrayerCache()` | localStorage (`tarteeb_prayer_cache`) |
| Habits | `habits` | localStorage (`tarteeb_habits`) |
| Prayer Tracking | `prayerTracking` | localStorage (`tarteeb_prayer_tracking`) |
| Sleep Tracking | `sleepTracking` | localStorage (`tarteeb_sleep_tracking`) |
| Drinks Tracking | `drinksTracking` | localStorage (`tarteeb_drinks_tracking`) |
| Notifications | `notifSoundEnabled`, `notifVibrateEnabled`, `pushSubscribed` | localStorage |
| Errors | `errorLog` | In-memory only |
| Modals | `taskModal`, `taskActionPopup`, `habitModal`, `dialog`, etc. | In-memory only |

**Key patterns:**
- `dayDataRef` — a `useRef` mirror of `dayData` used inside callbacks to avoid stale closures
- `notifiedTasks`, `notifiedTaskEnds`, `notifiedPrayers` — `useRef(Set)` to track which notifications have already fired
- `taskTimerIntervals` — `useRef(Map)` to manage per-task countdown intervals
- `appReadyRef` — a `useRef` boolean set to `true` after 3 seconds to delay notification effects until the app is fully initialised
- `calculateStats()` is called on every `updateDayData()` to recompute completion percentages

## External Services and Integrations

| Service | Purpose | Usage |
|---|---|---|
| **Aladhan API** | Fetch prayer times by city or coordinates | `fetchPrayerTimesFromAPI()` in `prayerService.js` |
| **Google Fonts** | Inter (Latin) + Tajawal (Arabic) | Loaded in `index.html` and `index.css` |
| **Lucide React** | Icon library | ~30 different icons imported in `App.jsx` |
| **canvas-confetti** | Confetti animation on task/habit completion | `confetti()` calls on toggle |
| **Netlify Blob Store** | Store push subscription data server-side | `blob-store.js` |
| **Web Push API** | Browser push notifications | `notificationManager.js` + service worker |
| **GitHub Actions** | CI/CD and cron-based prayer notifications | `deploy.yml`, `prayer-notify.yml` |
| **Vite PWA Plugin** | PWA manifest and service worker injection | `vite.config.js` |
| **Tailwind CSS v4** | Utility CSS framework | `index.css` imports `tailwindcss` |

---

# Features Implemented

## Prayer-Based Timeline

**Description:** A vertical timeline view showing the full day with continuous time markers, prayer boundaries, and a red "now" line that auto-scrolls on load.

**How it works:**
- `renderFullDayView()` in `App.jsx` builds a continuous day view with a `timelineHeight` computed from visual duration
- Hour ticks are spaced proportionally using percentage-based positioning
- Night/day bands are colour-coded bands
- Prayer markers (Fajr, Dhuhr, Asr, Maghrib, Isha) appear as clickable initials — clicking cycles through pending → completed → not_completed
- The "now" line auto-scrolls into view on first load via `requestAnimationFrame`
- Each task is rendered as a positioned card with a bar, time range, duration badge, and name

**Relevant files:** `src/App.jsx` (lines 2009–2168), `src/index.css` (timeline-related classes)

## Task Management (CRUD)

**Description:** Full create, read, update, delete for user tasks within prayer periods.

**How it works:**
- Tasks have: `id`, `name`, `details`, `duration`, `period`, `scheduledTime`, `type` (fixed/user/personal), `isRecurring`, `completed`, `status`
- **Add**: Floating action button (FAB) or 'n' keyboard shortcut opens the task modal
- **Edit**: Clicking a task opens the Task Action Popup with Edit/Delete options
- **Delete**: Confirmation dialog, filtered out of the tasks array
- **Completion**: Toggle via task card click or task action popup; fires confetti and toast with undo
- Three completion statuses: `pending`, `completed`, `not_completed`
- Fixed tasks (prayers, adhkar) cannot be edited or deleted

**Collision-free scheduling:**
- `getAvailableStartSlots()` / `getAvailableEndSlots()` compute available 1-minute resolution slots
- `getOccupiedSlots()` collects occupied ranges with a `TASK_GAP` of 5 minutes between tasks
- `validateTaskForm()` checks duration, boundaries, and overlap before submit
- When editing, the task's own ID is excluded from conflict checking

**Relevant files:** `src/App.jsx` (lines 1274–1364, 1981–2006), `src/utils/prayerService.js`

## Fixed Tasks (Prayers + Adhkar)

**Description:** 7 pre-populated, non-editable, non-deletable tasks: 5 daily prayers (Maghrib, Isha, Fajr, Dhuhr, Asr) + Morning Adhkar + Evening Adhkar.

**How it works:**
- `FIXED_TASKS_TEMPLATES` in `prayerService.js` defines them
- `FIXED_TASK_SCHEDULE` maps each task to a period and offset from period start
- `getFixedTaskSchedule()` computes the exact start time based on prayer times
- Evening Adhkar is placed 60 minutes before Maghrib end
- `syncPrayerToTask()` and `syncAdhkarToTask()` bidirectionally sync prayer tracking status with task completion

**Relevant files:** `src/utils/prayerService.js` (lines 270–278), `src/App.jsx` (lines 65–120, 1239–1272)

## Recurring Tasks

**Description:** Tasks marked as `isRecurring: true` are automatically copied to the next day.

**How it works:**
- When creating a new day (no saved data), the previous day's recurring tasks are filtered and cloned with new IDs
- Recurring tasks get the type `'user'` instead of `'personal'`

**Relevant files:** `src/App.jsx` (lines 1016–1025)

## Daily Journal

**Description:** Write daily reflections with auto-save and per-period study notes.

**How it works:**
- Diary textarea with manual save button
- Study notes can be added per prayer period using chip buttons
- Notes support edit, delete, lock/unlock, and show edit history
- Notes appear in the Pulse dashboard and Markdown export

**Relevant files:** `src/App.jsx` (lines 1427–1489, 1902–1911, 2974–3117)

## History Log

**Description:** Every day opened is recorded. Users can browse past days and view stats or "Open Day" to revisit.

**How it works:**
- The `auto-cleanup` effect (lines 599–618) keeps at least 3 recent days in localStorage
- Previous day data is loaded for comparison in the Pulse dashboard
- Export supports both current and previous day

## Settings & Customisation

**Theme:** Light/Dark mode toggled via `data-theme` attribute on `<html>`. Persisted to `localStorage`.

**Language:** English/Arabic with full RTL support. Sets `lang`, `dir`, and updates `document.title`/meta tags dynamically.

**Font Size:** 4 presets (Small 14px, Normal 16px, Large 18px, Extra Large 20px) applied via `document.documentElement.style.fontSize`.

**Time Format:** 12-hour or 24-hour display. Module-level `_use12h` flag in `prayerService.js`.

**Day Start Mode:** Midnight (standard) or Maghrib (Islamic day start). Controls `getLogicalPlannerDate()`, `getCompiledPrayersForPlannerDate()`, and all period calculations.

**Location:** City + Country or Latitude/Longitude configuration for Aladhan API. Country → City dropdowns driven by `src/data/countries.js`.

**Manual Prayer Times:** Override any prayer time manually (HH:MM format), stored directly in the prayer cache.

**Backup & Restore:** Export all `tarteeb_*` localStorage keys as a JSON file; import to restore.

**Relevant files:** `src/App.jsx` (lines 239–315, 3545–3926)

## Push & Background Notifications

**Description:** Receive notifications even when the app is closed, powered by Web Push API + Netlify Functions + GitHub Actions cron.

**How it works:**
1. User enables notifications → browser requests permission → `subscribeToPush()` subscribes via PushManager
2. Subscription is sent to `/.netlify/functions/subscribe` (POST) which stores it in Netlify Blob Store
3. Every 15 minutes, GitHub Actions cron triggers `/.netlify/functions/notify`
4. The notify function iterates all subscriptions, fetches prayer times for each subscriber's location, checks if any prayer is within 5 minutes, and sends a web-push notification
5. Expired subscriptions (410 Gone) are automatically cleaned up

**Relevant files:** `src/utils/notificationManager.js`, `src/service-worker.js`, `netlify/functions/notify.js`, `netlify/functions/subscribe.js`, `netlify/functions/utils/blob-store.js`, `.github/workflows/prayer-notify.yml`

## In-App Task/Prayer Notifications

**Description:** Real-time notifications for task start, task end (with live countdown), prayer time changes, new day, and end-of-day reminder.

**How it works:**
- `triggerNotification()` in `App.jsx` handles sound (custom bell.mp3), vibration, and service worker notification display
- A 10-second clock ticker drives all notification checks
- `useEffect` hooks monitor `currentTime` and fire notifications when time boundaries are crossed
- Task notifications: start notification → every-minute countdown → end notification
- Prayer notifications: 15-minute pre-prayer countdown → prayer start notification → prayer end notification
- `notifiedTasks` / `notifiedTaskEnds` / `notifiedPrayers` (Ref Sets) prevent duplicate firings
- Notification preferences (sound, vibrate) are persisted and toggleable

**Relevant files:** `src/App.jsx` (lines 641–689, 786–941)

## Export to Markdown

**Description:** Export the current or previous day as a detailed Markdown (.md) file.

**How it works:**
- `exportToMarkdown()` builds a comprehensive markdown document including:
  - Date (Gregorian + Hijri), app settings
  - Prayer times with status
  - Tasks split by status (completed/pending/not_completed) with time, duration, period
  - Task breakdown by period with visual bars
  - Habits, sleep sessions, drinks log
  - Journal/diary entry
  - Productivity score composite
  - Daily streak
- The blob is downloaded via `<a>` element click

**Relevant files:** `src/App.jsx` (lines 1547–1900)

## Pulse Dashboard (Statistics)

**Description:** A professional resume-style dashboard showing daily performance metrics with SVG progress rings and yesterday comparison.

**How it works:**
- Composite productivity score weighted: Tasks 25%, Habits 20%, Prayers 30%, Sleep 15%, Streak 10%
- Four overview cards (tasks, habits, prayers, streak) with progress rings
- Task breakdown by status (completed/pending/not_completed) with bar charts
- Per-period completion bars
- Yesterday comparison with ▲/▼ indicators
- Prayer status grid for all 5 prayers
- Habits list for today
- Sleep and drinks summary

**Relevant files:** `src/App.jsx` (lines 2241–2690), `src/pages/PulseDashboard.jsx`

## Habit Tracker

**Description:** Track daily habits with streaks, completion rate, reordering, and per-habit notes.

**How it works:**
- Habits stored as array with `id`, `name`, `createdAt`, `entries` (date → {completed, notes})
- Toggle completion with confetti
- Auto-cleanup entries older than 30 days
- Support reordering via up/down buttons
- Export habits as standalone Markdown

**Relevant files:** `src/App.jsx` (lines 371–421, 1393–1523, 3304–3366)

## Prayer Tracker

**Description:** Track each of the 5 daily prayers with status: pending → on-time → late → missed (cycled via click).

**How it works:**
- `prayerTracking` state keyed by `{date: {prayerKey: status}}`
- Clicking prayer markers on the timeline or the Prayer Times page cycles through statuses
- Bidirectional sync with fixed prayer tasks
- Adhkar (Morning/Evening) are also tracked

**Relevant files:** `src/App.jsx` (lines 378–440, 1239–1272)

## Sleep Tracker

**Description:** Log sleep sessions with bedtime and wake-up time, auto-calculates hours.

**How it works:**
- `sleepTracking` state keyed by date
- `calcSleepHours()` handles overnight sessions (end <= start → +24h)
- Total daily sleep displayed and included in Pulse dashboard and export

**Relevant files:** `src/App.jsx` (lines 387–535, 3368–3442)

## Drinks Tracker

**Description:** Log drinks with name and count, with +/- controls.

**How it works:**
- `drinksTracking` state keyed by date
- Per-drink count adjustment, total displayed

**Relevant files:** `src/App.jsx` (lines 537–568, 3444–3514)

## Mood Tracker

**Description:** Select a daily mood from 8 options with emoji representation.

**How it works:**
- Mood is stored as a string on `dayData.mood`
- Included in Markdown export

## PWA Support

**Description:** Installable progressive web app with offline caching.

**How it works:**
- Vite PWA plugin with injectManifest strategy
- Service worker caches static assets on install, serves cache-first with network fallback
- `beforeinstallprompt` event listener with custom install button
- Web app manifest with green theme, icons, standalone display

**Relevant files:** `vite.config.js`, `src/service-worker.js`, `src/App.jsx` (lines 712–739)

## Welcome Modal

**Description:** Shown on first visit with links to Settings and Guide.

**How it works:**
- `showWelcome` state initialised from `tarteeb_welcome_dismissed` localStorage key
- Dismiss sets the key to 'true'

## Prayer Notification Modal

**Description:** A modal appears when a new prayer period begins.

**How it works:**
- `calculateTimelineStatus()` computes the current active period
- When `activePeriod` changes and `prayerNotif` is null, the modal is set
- A notification is also fired

## Keyboard Shortcuts

| Key | Action |
|---|---|
| `h` | Home |
| `t` | Tasks |
| `j` | Journal |
| `g` | Guide |
| `s` | Settings |
| `b` | Habits |
| `l` | Sleep |
| `d` | Drinks |
| `p` | Prayers |
| `a` | Alternative Plan |
| `n` | Add task (home/tasks) |
| `Escape` | Close modals |

## Error Log

**Description:** Captures runtime errors (prayer fetch failures, settings errors) and displays them in an error log modal.

**How it works:**
- `addError(message, source)` pushes to `errorLog` array and console.error
- Error badge shows count in sidebar footer
- Modal lists all errors with time, source, and message
- Clear All button

## Contact Developer

**Description:** Send a message to the developer via WhatsApp.

**How it works:**
- Textarea → constructs `https://wa.me/201143044699?text=...` URL
- Opens in new tab

---

# YouTube Integration

There is **no YouTube integration** in this codebase. The task.md template mentions a YouTube Integration section, but no such feature exists in the current project.

---

# UI/UX Improvements

## Layout Improvements
- Full-screen app container with `100dvh` height and responsive padding
- Sidebar overlay for mobile with smooth open/close animation
- Two-column settings page grid
- Dedicated pages for each tracker (habits, sleep, drinks, prayers, pulse)
- "Now" line auto-scrolls to current time position on home page
- Current period auto-scroll on tasks page

## Component Enhancements
- Task cards with colour-coded left borders (emerald=fixed, teal=personal, gold=recurring)
- Three-status completion indicators on tasks page
- SVG progress rings in Pulse dashboard
- Collision-free time picker with hour/minute dropdowns
- Live duration badge updating as start/end change
- Period chip buttons for study notes
- Lock/edit/delete actions on notes
- Toast notification system with undo action
- Action popup for tasks (mark complete, edit, delete)

## Mobile Optimisations
- Collapsible sidebar with overlay
- FAB (floating action button) for adding tasks
- Responsive grid layouts that stack on small screens
- Safe area insets (`env(safe-area-inset-bottom)`)
- Touch-friendly button sizes
- Hidden download button on mobile (header)
- RTL support for Arabic layout

## Accessibility Improvements
- `dir="auto"` on all text inputs
- `aria-label` on icon buttons
- Semantic HTML elements (`header`, `main`, `aside`, `nav`, `section`, `article`)
- Keyboard navigation with shortcuts
- Font size scaling via rem units
- Sufficient colour contrast in both themes

## User Experience Refinements
- Confetti animation on task/habit completion
- Toast with undo for task completion toggle
- Collision-free scheduling prevents overlapping tasks
- Auto-cleanup of old localStorage data
- First-run welcome modal
- Notification permission prompt on first visit
- Prayer notification modal with Arabic calligraphy
- Daily streak display in sidebar
- Yesterday comparison in Pulse dashboard

---

# Performance Optimizations

## Loading Optimizations
- Prayer times are fetched for 3 days at once (prev, current, next) and cached
- New days are created client-side without API calls
- App ready delay (3 seconds) before triggering notifications to avoid initialisation storms
- Alternative Plan tasks intentionally bypass all notification effects (sound, vibration, push, countdown timers) to avoid duplicate alerts

## Rendering Improvements
- `requestAnimationFrame` for scroll operations
- `useRef` for sets/maps to avoid re-renders on notification tracking
- Conditional rendering for pages, modals, and dialogs
- Memoised callbacks via `useCallback` for `triggerNotification`

## Caching
- Prayer times cached in localStorage (`tarteeb_prayer_cache`) — survives page reloads
- Service worker caches static assets on first load
- Previous day data loaded from localStorage for comparison

## Network Request Optimizations
- Aladhan API called only for uncached dates
- Prayer notification cron runs server-side, not from client

## Bundle Size Optimizations
- Vite manual chunks separate `react` and `react-dom` into a vendor chunk
- Lucide React icons imported individually (tree-shakeable)
- Tailwind CSS v4 with JIT compilation

---

# Bug Fixes

| Fix | Root Cause | Resolution | Impact |
|---|---|---|---|
| Notification on page refresh | Service worker not claiming clients immediately | Added `self.clients.claim()` in activate event | Notifications work reliably after refresh |
| Mobile favicon not showing | Missing `link[rel="icon"]` for mobile sizes | Added proper favicon references | Icon displays on mobile browsers |
| Netlify build failing | Missing function bundler config | Added `node_bundler = "esbuild"` to `netlify.toml` | Functions deploy successfully |
| Task slot availability mismatch | `getOccupiedSlots` not including `TASK_GAP` | Added `TASK_GAP` to occupied slot end calculation | Collision-free scheduling works correctly |
| Past-time tasks showing "no available slots" | Add mode showed empty slots for past periods | Added descriptive "All times in this period have passed" message + auto-set `not_completed` status | Better UX for past tasks |
| Notification toast icon missing | Icon path not set | Added `NOTIF_ICON` constant and set icon/badge on all notifications | Icons appear in notifications |
| Auto-selected time period reverting | Period change not recalculating available slots | `handlePeriodChange()` now properly recomputes start/end slots | Correct default times when switching periods |
| Settings API toggle not persisting on desktop | Checkbox state not synced on initial load | `settingsForm` initialised from `locationConfig` state | API toggle reflects saved preference |
| Time validation in manual times | Missing regex validation | Added `HH:MM` regex pattern + `pattern` attribute on input | Invalid times rejected |
| Dismissible settings errors | Error banner had no close button | Added `settings-error-close` button with `setApiError(null)` | Errors dismissable |

---

# Technical Decisions

## Monolithic App Component
**Decision:** All state and logic in a single `App.jsx` (~4441 lines).
**Rationale:** The app was built rapidly with frequent iteration. All state is interconnected (tasks affect prayer tracking, which affects Pulse stats, etc.), making separation difficult without a state management library. Pages like `PulseDashboard.jsx` and `ContactPage.jsx` have been partially extracted but are not yet fully independent.

## localStorage as the Sole Database
**Decision:** All user data persisted in browser localStorage.
**Rationale:** Zero backend cost, complete privacy, works offline, simple to implement. Trade-off: data is browser-specific and can be lost on clear cache. Backup/restore mitigates this.

## Maghrib Day Start Logic
**Decision:** Support both Midnight and Maghrib-based day starts.
**Rationale:** Islamic day starts at sunset (Maghrib). The `_dayStartMode` flag toggles between conventional midnight and Islamic day. This affects `getLogicalPlannerDate()`, `getCompiledPrayersForPlannerDate()`, all period boundary calculations, and timeline rendering.

## Custom Time Picker (Not Native `<input type="time">`)
**Decision:** Custom hour/minute dropdowns with slot availability filtering.
**Rationale:** Native time inputs don't support showing only available slots. The custom `tm-picker` components filter by `getAvailableStartSlots()` / `getAvailableEndSlots()` to enforce collision-free scheduling.

## Web Push via Netlify + GitHub Actions (Not Firebase)
**Decision:** Self-hosted push notification infrastructure using Web Push API, Netlify Functions, and GitHub Actions cron.
**Rationale:** Avoids third-party push services (Firebase, OneSignal). Keeps user data private. Costs nothing on Netlify's free tier. The GitHub Actions cron runs every 15 minutes to check prayer times.

## Tailwind CSS v4
**Decision:** Use Tailwind CSS v4 for utility-first styling.
**Rationale:** Fast development with consistent design tokens. However, most styles are hand-written in `index.css` using CSS custom properties rather than Tailwind utilities directly.

---

# File Structure Overview

```
/
├── index.html                          # HTML shell with meta tags, font preconnects
├── vite.config.js                      # Vite config: React, Tailwind, PWA plugin, chunking
├── eslint.config.js                    # ESLint flat config
├── netlify.toml                        # Netlify build/function/redirect config
├── package.json                        # Dependencies and scripts
│
├── public/
│   ├── favicon.svg                     # Crescent + star SVG favicon
│   ├── icons.svg                       # Social link icons
│   └── bell.mp3                        # Custom notification sound
│
├── src/
│   ├── main.jsx                        # React entry point
│   ├── App.jsx                         # Monolithic app: state, logic, all rendering
│   ├── App.css                         # (unused — all styles in index.css)
│   ├── index.css                       # All styles (~7622 lines), CSS custom properties
│   ├── i18n.js                         # EN/AR dictionaries (~2000 keys), t(), translateTaskName()
│   ├── service-worker.js               # Workbox SW: caching, push, notification clicks
│   │
│   ├── components/
│   │   └── Toast.jsx                   # Toast notification component
│   │
│   ├── pages/
│   │   ├── GuidePage.jsx               # 15-step "How to Use" guide
│   │   ├── PulseDashboard.jsx          # Statistics dashboard (standalone component)
│   │   └── ContactPage.jsx             # WhatsApp contact page
│   │
│   ├── data/
│   │   └── countries.js                # Country → Cities mapping file
│   │
│   └── utils/
│       ├── prayerService.js            # Prayer times, API fetch, cache, periods, helpers
│       ├── notificationManager.js       # Push subscription management
│       └── constants.js                 # Shared constants
│
├── netlify/
│   └── functions/
│       ├── subscribe.js                # POST/DELETE push subscriptions
│       ├── notify.js                   # Cron-triggered prayer push notifications
│       └── utils/
│           └── blob-store.js           # Netlify Blob read/write for subscriptions
│
├── .github/
│   └── workflows/
│       ├── deploy.yml                  # Build + deploy to GitHub Pages
│       └── prayer-notify.yml           # 15-min cron for prayer notifications
│
└── docs/
    ├── task.md                         # Task instructions
    └── PROJECT_SUMMARY.md              # This file
```

---

# Current Status

## Completed
- ✅ Full prayer-based timeline with real-time "now" indicator
- ✅ Task CRUD with collision-free scheduling
- ✅ 7 fixed prayer/adhkar tasks with bidirectional sync
- ✅ Recurring tasks (carry-over)
- ✅ Daily journal with per-period study notes
- ✅ Habit tracker with streaks, reordering, and 30-day cleanup
- ✅ Sleep tracker with session management
- ✅ Drinks tracker with +/- count
- ✅ Prayer tracker (on-time/late/missed) with 5-prayer grid
- ✅ Mood tracker
- ✅ Pulse/Statistics dashboard with composite score and yesterday comparison
- ✅ Markdown export (current + previous day)
- ✅ JSON backup/restore
- ✅ Light/Dark theme
- ✅ Bilingual (English/Arabic) with full RTL
- ✅ 4 font sizes
- ✅ 12h/24h time format
- ✅ Midnight/Maghrib day start modes
- ✅ Aladhan API prayer time fetching (city or coordinates)
- ✅ Manual prayer time overrides
- ✅ Country → City dropdown selector
- ✅ In-app task/prayer countdown notifications with custom sound + vibration
- ✅ Push/background notifications via Netlify Functions + Web Push
- ✅ PWA support (installable, offline caching)
- ✅ Welcome modal (first visit)
- ✅ Prayer period change notification modal
- ✅ End-of-day reminder notification
- ✅ Keyboard shortcuts (including `a` for Alternative Plan)
- ✅ Alternative Plan — independent backup day plan with separate tasks, timeline, and CRUD (no fixed prayers, no notifications)
- ✅ Error log modal
- ✅ Contact developer page
- ✅ Fullscreen toggle
- ✅ Streak computation
- ✅ Auto-cleanup old localStorage data

## Partially Completed
- 🟡 **PulseDashboard.jsx as separate component** — Exists as a file but is not imported in App.jsx; App.jsx has its own inline `renderPulseDashboard()`
- 🟡 **Toast.jsx component** — Exists as a file but App.jsx renders toast inline rather than using the component
- 🟡 **ContactPage.jsx** — Exists as a separate file but App.jsx uses inline `renderContactPage()`
- 🟡 **GuidePage.jsx** — Exists as separate file but App.jsx renders guide inline (though the content is duplicated with the same translations)

## Pending
- ❌ Night period end (midnight mode) currently ends at 1440 (24:00) — should wrap to Fajr
- ❌ No drag-and-drop task reordering on timeline
- ❌ No task categories/tags
- ❌ No data sync between devices
- ❌ No calendar view for month overview
- ❌ No Pomodoro/study timer
- ❌ No audio player for Quran/lectures
- ❌ No sharing/collaboration features
- ❌ No unit tests or integration tests

---

# Known Limitations

1. **Monolithic App.jsx** — At ~4441 lines, the main component is difficult to maintain. State management would benefit from extraction into custom hooks or a lightweight state library.

2. **No test coverage** — There are no unit, integration, or E2E tests. Core logic (prayer calculations, slot computation, task validation) is untested.

3. **localStorage size limits** — ~5-10 MB depending on browser. Habit entries are cleaned up after 30 days, but large amounts of study notes or journal entries could eventually hit limits.

4. **Aladhan API dependency** — The app relies on a third-party API for prayer times. If the API is down, fallback defaults are used. No user notification of stale times.

5. **Night period boundary in midnight mode** — The night period (Isha → Fajr) ends at midnight (24:00) in midnight mode instead of wrapping to Fajr. This means early-morning prayers before Fajr are shown as "none" period.

6. **Duplicated page implementations** — `GuidePage.jsx`, `ContactPage.jsx`, and `PulseDashboard.jsx` exist as separate files but App.jsx has its own inline implementations that are actually used. The separated files are dead code.

7. **No input validation for task duration** — While the form validates collisions and boundaries, there's no minimum/maximum duration constraint beyond > 0.

8. **No timezone support** — All times are treated as the browser's local timezone. Users in different timezones than their configured city may get incorrect prayer-to-local time mapping.

9. **No data encryption** — All localStorage data is plain JSON. Sensitive if used on shared devices.

10. **Push notification delivery timing** — The 15-minute cron interval means push notifications for prayer times may be up to 15 minutes late.

---

# Recommended Next Steps

## High Priority
1. **Extract App.jsx into modular architecture** — Break the monolithic component into custom hooks (`useDayData`, `useNotifications`, `usePrayerTimes`, `useTrackers`) and page components. This is the single most impactful improvement for maintainability.
2. **Add unit tests for prayerService.js** — Test `parseTimeToMinutes()`, `formatMinutesToTime()`, `getAvailableStartSlots()`, `getOccupiedSlots()`, `calculateTimelineStatus()`, and day boundary logic.
3. **Fix night period boundary in midnight mode** — The night period should wrap from Isha to Fajr, not end at midnight.

## Medium Priority
4. **Remove dead code** — Either wire up `GuidePage.jsx`, `ContactPage.jsx`, and `PulseDashboard.jsx` as proper imports in App.jsx, or remove them if the inline versions are to remain.
5. **Add drag-and-drop task reordering** — Allow users to reorder tasks within a period on the timeline.
6. **Add month calendar view** — Overview of task completion across the month with heatmap or calendar grid.
7. **Alternative Plan enhancements** — Add "Copy from Main Plan" button to seed the alt plan, daily re-initialization logic, export support, and "promote to main plan" feature.
8. **Set up CI with lint + type check** — Add a GitHub Actions workflow that runs `npm run lint` on PRs.

## Low Priority
8. **Theming improvements** — Add more theme options (e.g., high-contrast, sepia) and system-preference detection.
9. **Offline fallback indicators** — Show a banner when prayer times are stale or using defaults.
10. **Pomodoro/ focus timer** — Integrate a simple timer within each period block.
11. **Shared progress / Community features** — Optional anonymous sharing of streaks or productivity scores.
12. **Data export enhancements** — Additional export formats (PDF, CSV, JSON) and scheduled auto-export.
