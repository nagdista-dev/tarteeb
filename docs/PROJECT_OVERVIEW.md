# Tarteeb — Prayer-Based Muslim Daily Planner

**Tarteeb** is a full-featured, browser-based daily planner designed around the five daily Islamic prayers. It transforms the conventional day into a **Maghrib-to-Maghrib** cycle, where each day begins at sunset and flows through five prayer-aligned periods: Evening (Maghrib → Isha), Night (Isha → Fajr), Morning (Fajr → Dhuhr), Afternoon (Dhuhr → Asr), and Late Afternoon (Asr → Maghrib). Built as a Progressive Web App (PWA) with React 19 and Vite, it runs entirely on the client side with zero server dependencies.

---

## Table of Contents

- [1. Project Introduction](#1-project-introduction)
- [2. Full Features Overview](#2-full-features-overview)
- [3. Functional Modules](#3-functional-modules)
- [4. User Experience (UX)](#4-user-experience-ux)
- [5. Technical Overview](#5-technical-overview)
- [6. UI/UX Design Principles](#6-uiux-design-principles)
- [7. Key Benefits](#7-key-benefits)
- [8. Future Improvements](#8-future-improvements)

---

## 1. Project Introduction

### What is Tarteeb?

Tarteeb (from the Arabic "ترتيب", meaning *organisation* or *arrangement*) is a spiritual daily planner that helps Muslims organise their tasks, habits, and reflections around the Islamic prayer schedule. Instead of treating prayer as a separate reminder, Tarteeb makes the five daily prayers the **structural backbone** of the day.

### The Problem It Solves

Most productivity tools are designed around a 9-to-5, midnight-to-midnight worldview. For practising Muslims, the day rhythmically revolves around the five prayers — Fajr, Dhuhr, Asr, Maghrib, and Isha — whose times shift daily with the sun. Conventional planners ignore this pattern, forcing users to mentally map their workflow around constantly changing prayer times. Tarteeb solves this by making prayer times the primary organising axis.

### Target Users

- Practising Muslims who want to align their daily productivity with the prayer schedule
- Students and professionals seeking a spiritually-grounded planning tool
- Arabic-speaking and English-speaking users who need full bilingual support
- Privacy-conscious users who prefer local-first, account-free software

---

## 2. Full Features Overview

### 2.1 Prayer-Based Timeline

A vertical timeline view that renders the full day as a scrollable, time-scaled canvas. Prayer boundaries appear as labelled markers (Fajr, Dhuhr, Asr, Maghrib, Isha), and a red "now" line auto-scrolls to the current time on load. The timeline is divided into five colour-coded prayer periods, each with its own task section.

### 2.2 Task Management (CRUD)

Full create, read, update, and delete for user tasks within any prayer period.

- **Collision-free scheduling** — start/end time pickers show only available 5-minute slots that do not overlap with existing tasks
- **Three completion statuses** — each task can be `pending`, `completed`, or `not_completed`, toggled from the timeline or the dedicated Tasks page
- **Fixed tasks** — the five daily prayers and Morning/Evening Adhkar (supplications) are pre-populated and non-editable, with bidirectional sync between prayer tracking and task completion
- **Recurring tasks** — tasks marked as recurring are automatically copied to the next day
- **Task details** — each task supports a name, optional details/notes, duration, and scheduled time within its period
- **Confetti on completion** — completing a task fires a confetti animation via `canvas-confetti`
- **Undo support** — a toast notification with an undo button appears when toggling a task

### 2.3 Daily Journal & Study Notes

- A diary textarea for free-form daily reflections with manual save
- Per-period study notes: add, edit, delete, lock/unlock notes for each prayer period
- Edit history tracking for each note
- Notes appear in the Pulse dashboard and Markdown export

### 2.4 Habit Tracker

- Add and track daily habits with per-day completion toggling
- Streak computation showing consecutive days of adherence
- Per-habit notes for daily entries
- Reordering via up/down controls
- Auto-cleanup of entries older than 30 days
- Export habits as standalone Markdown

### 2.5 Prayer Tracker

- Track each of the five daily prayers through four states: `pending` → `on-time` → `late` → `missed` (cycled via click)
- Adhkar (Morning/Evening) tracking included
- Bidirectional sync with fixed prayer tasks on the timeline
- Prayer status grid displayed on the Pulse dashboard

### 2.6 Sleep Tracker

- Log sleep sessions with bedtime and wake-up time
- Auto-calculates total sleep hours, handling overnight sessions (crossing midnight) correctly
- Daily total displayed on the Pulse dashboard and included in Markdown export

### 2.7 Drinks Tracker

- Log beverage consumption with name and count
- Increment/decrement controls per drink
- Total consumption displayed on the Pulse dashboard

### 2.8 Mood Tracker

- Select a daily mood from eight options represented by emojis
- Mood stored as part of the day data and included in Markdown export

### 2.9 History Log

- Every day opened in the app is automatically recorded
- Browse past days with completion stats and journal entry previews
- "Open Day" to revisit a past day's full timeline
- "Delete" to remove a day's data entirely

### 2.10 Pulse Dashboard (Statistics)

A professional statistics dashboard showing daily performance metrics:

- **Composite productivity score** — weighted calculation: Tasks 25%, Habits 20%, Prayers 30%, Sleep 15%, Streak 10%
- **Four overview cards** — tasks, habits, prayers, and streak, each with SVG progress rings
- **Task breakdown** — completed/pending/not_completed counts with bar charts
- **Per-period completion bars** — visual breakdown of task completion by prayer period
- **Yesterday comparison** — ▲/▼ indicators comparing today against the previous day
- **Prayer status grid** — colour-coded grid for all five prayers
- **Sleep and drinks summary** — total hours and consumption

### 2.11 Alternative Plan

A completely separate, independent backup plan with its own set of tasks, timeline, and CRUD operations. It has no fixed prayers, no prayer notifications, and no countdown timers — designed for non-prayer-aligned planning or as a fallback. Accessible via the sidebar.

### 2.12 Export & Backup

- **Markdown export** — export the current or previous day as a detailed `.md` file including prayer times, all tasks with completion status, habits, sleep sessions, drinks, journal entry, and productivity score
- **JSON backup/restore** — export all `tarteeb_*` localStorage keys as a JSON file; import to restore data on another device or after cache clear

### 2.13 Push & Background Notifications

- **Web Push API** — subscribe to push notifications that work even when the browser is closed
- **Netlify Functions** — serverless endpoints for subscription management (`subscribe.js`) and notification dispatch (`notify.js`)
- **GitHub Actions cron** — runs every 15 minutes, triggers the notify function which checks prayer times for each subscriber and sends web-push notifications for approaching prayers
- **Automatic cleanup** — expired subscriptions (HTTP 410 Gone) are removed during notification dispatch

### 2.14 In-App Notifications

Real-time, sound-enabled notifications driven by a 10-second clock ticker:

- **Task start notification** — with live one-minute countdown updates
- **Task end notification** — when a task's scheduled end time arrives
- **Prayer notifications** — 15-minute pre-prayer countdown, prayer start alert, and prayer end alert
- **Period change modal** — a modal appears when a new prayer period begins, with Arabic calligraphy
- **New day notification** — when the planner day rolls over
- **End-of-day reminder** — alerts when the day is about to end
- **Duplicate prevention** — `useRef(Set)` tracking prevents re-triggering already-fired notifications

### 2.15 Settings & Customisation

- **Theme** — Light/Dark mode toggle, persisted to localStorage
- **Language** — full English and Arabic support with RTL layout switching
- **Font size** — four presets: Small (14px), Normal (16px), Large (18px), Extra Large (20px)
- **Time format** — 12-hour or 24-hour display
- **Day start mode** — Midnight (standard) or Maghrib (Islamic day start)
- **Location** — city + country selection (driven by `countries.js` data) or latitude/longitude coordinates
- **Prayer calculation method** — select from multiple Islamic calculation methods
- **Manual prayer time overrides** — override any prayer time manually in HH:MM format
- **Notification preferences** — toggle sound, vibration, and push notifications independently
- **Backup and restore** — export/import all data as JSON

### 2.16 PWA Support

- **Installable** — meets PWA criteria with a web app manifest, service worker, and `beforeinstallprompt` handler
- **Offline capable** — service worker caches static assets on first load with a cache-first strategy
- **Custom install button** — in-app button for browsers that support installation

### 2.17 Keyboard Shortcuts

| Key | Action          |
|-----|-----------------|
| h   | Home (Timeline) |
| t   | Tasks           |
| j   | Journal         |
| g   | Guide           |
| s   | Settings        |
| b   | Habits          |
| l   | Sleep           |
| d   | Drinks          |
| p   | Prayers         |
| a   | Alternative Plan|
| n   | Add new task    |
| Esc | Close modals    |

### 2.18 Other Features

- **Welcome modal** — shown on first visit with quick links to Settings and Guide
- **Guide page** — 15-step illustrated guide explaining how to use the application
- **Error log** — captures runtime errors (prayer fetch failures, settings errors) with source and timestamp, accessible from the sidebar
- **Contact developer** — send a message via WhatsApp from within the app
- **Fullscreen toggle** — switch to fullscreen mode
- **Dynamic metadata** — page title, description, and Open Graph meta tags update when switching languages
- **Favicon** — custom emerald crescent moon and star SVG icon

---

## 3. Functional Modules

### 3.1 User Interface Layer

The UI is a monolithic single-page application (SPA) rendered by `App.jsx`. It manages all routing, state, modals, and page rendering. Pages (Guide, Pulse Dashboard, Contact) exist both as inline render functions and as separate component files, though the inline versions are what actually render. The UI is structured as:

- **Sidebar** — navigation, next prayer countdown, date display (Gregorian + Hijri), prayer time strip, streak counter, error badge
- **Main content area** — swaps between pages (Timeline, Tasks, Journal, Habits, Sleep, Drinks, Prayers, Settings, Alternative Plan, Pulse Dashboard, Guide, Contact) based on `currentPage` state
- **Modal system** — task form modal, task action popup, habit modal, prayer notification modal, welcome modal, dialog confirmations, error log modal

### 3.2 Data Management Layer

All data is persisted in the browser's `localStorage` under namespaced keys:

- `tarteeb_day_YYYY-MM-DD` — per-day tasks, journal, study notes, mood
- `tarteeb_alternative_day_*` — Alternative Plan day data
- `tarteeb_prayer_cache` — cached prayer times (3-day window)
- `tarteeb_habits` — habit definitions and entries
- `tarteeb_prayer_tracking` — prayer status history
- `tarteeb_sleep_tracking` — sleep session logs
- `tarteeb_drinks_tracking` — drink logs
- `tarteeb_location_config` — user location and calculation method
- `tarteeb_settings` — theme, language, font size, time format preferences
- `tarteeb_notification_settings` — sound, vibration, push preferences
- `tarteeb_push_subscription` — push subscription object
- `tarteeb_welcome_dismissed` — welcome modal state

Data flows one-way: state changes trigger immediate writes to `localStorage` and re-render via React's `useState`.

### 3.3 Prayer Time Engine

Located in `src/utils/prayerService.js`, this module handles:

- Fetching prayer times from the **Aladhan API** (by city or coordinates)
- Local caching of prayer times (prevents redundant API calls)
- Prayer period boundary calculations (Maghrib-to-Maghrib logic)
- Time utilities: `parseTimeToMinutes()`, `formatMinutesToTime()`, slot availability computation
- Fixed task schedule generation (`getFixedTaskSchedule()`)
- Timeline status calculation (`calculateTimelineStatus()`)

### 3.4 Notification System

A multi-layered notification system with three tiers:

1. **In-app notifications** — driven by a 10-second React interval in `App.jsx`, checks task/prayer time boundaries and triggers sound (`bell.mp3`), vibration, and UI modals
2. **Service worker notifications** — displayed via the registered service worker for background notifications
3. **Push notifications** — server-side via Netlify Functions + GitHub Actions cron, using the Web Push API

### 3.5 Backup Infrastructure (Netlify Functions)

Serverless functions deployed to Netlify:

- `subscribe.js` — handles push subscription registration (POST) and unregistration (DELETE)
- `notify.js` — cron-triggered function that iterates subscriptions, fetches prayer times per subscriber, and sends web-push notifications
- `blob-store.js` — abstraction for reading/writing subscription data to Netlify Blob Store

### 3.6 Deployment & CI/CD

- **Netlify** — primary hosting with `netlify.toml` configuration (build command, publish directory, SPA redirect rules)
- **GitHub Pages** — secondary deployment via `deploy.yml` workflow
- **Cron trigger** — `prayer-notify.yml` runs every 15 minutes to trigger push notifications

---

## 4. User Experience (UX)

### How Users Interact with the System

The user opens Tarteeb to a **vertical timeline** showing today's schedule. Prayer periods are clearly delineated by coloured bands and labelled markers. The current time is indicated by a red "now" line that auto-scrolls into view. From here, users can:

- **Browse the day** — scroll through all five prayer periods, each containing their tasks
- **Add tasks** — tap the floating action button (FAB) or press `n` to open the task creation modal
- **Complete tasks** — tap a task card to toggle completion (with confetti feedback)
- **Navigate** — use the sidebar or keyboard shortcuts to switch between pages

### Content Organisation

Content is organised in a hierarchy:

1. **Day** — the top-level unit, starting at Maghrib
2. **Prayer period** — five periods per day (Evening, Night, Morning, Afternoon, Late Afternoon)
3. **Tasks** — individual items within a period, each with a scheduled time and duration
4. **Trackers** — habits, sleep, drinks, mood, and prayer tracking, each on their own dedicated page

### Productivity Improvements

- **Prayer-aligned structure** removes the mental overhead of planning around shifting prayer times
- **Collision-free scheduling** prevents overbooking and time conflicts
- **Recurring tasks** automate daily routine items
- **All-in-one dashboard** (Pulse) provides a single view of task, habit, prayer, sleep, and streak performance
- **History log** enables retrospective review of past days

### Key User Flows

**Morning routine flow:**
1. Open app → timeline auto-scrolls to current (Fajr) period
2. Complete Fajr prayer (tap prayer marker)
3. View Morning period tasks for the day
4. Complete Morning Adhkar (pre-populated fixed task)
5. Write a journal entry for the morning
6. Add new tasks for the Afternoon period

**End-of-day review flow:**
1. Navigate to Pulse Dashboard
2. View composite productivity score
3. Review prayer tracking (on-time/late/missed)
4. Check habit streaks
5. Log sleep session
6. Export day as Markdown for personal records

---

## 5. Technical Overview

### Architecture Style

**Single-Page Application (SPA)** with a monolithic component architecture. All state management, routing, and rendering logic resides in a single `App.jsx` component (~4,400 lines) using React hooks (`useState`, `useEffect`, `useRef`, `useCallback`, `useMemo`). There is no external state management library.

### Technology Stack

| Layer          | Technology                                     |
|----------------|-------------------------------------------------|
| Framework      | React 19                                       |
| Build Tool     | Vite 8                                         |
| Styling        | Tailwind CSS v4 + CSS custom properties        |
| Icons          | Lucide React                                   |
| Animation      | canvas-confetti                                |
| Fonts          | Inter (Latin), Tajawal (Arabic)                |
| API            | Aladhan API (prayer times)                     |
| Storage        | Browser localStorage                           |
| Push           | Web Push API                                   |
| Serverless     | Netlify Functions + Netlify Blob Store         |
| CI/CD          | GitHub Actions                                 |
| PWA            | vite-plugin-pwa + Workbox                      |

### Data Structure

Each day's data is stored as a JSON object in `localStorage`:

```json
{
  "tasks": [
    {
      "id": "uuid",
      "name": "Read Quran",
      "details": "After Fajr",
      "duration": 30,
      "period": "morning",
      "scheduledTime": "05:30",
      "type": "user",
      "isRecurring": true,
      "completed": false,
      "status": "pending"
    }
  ],
  "diary": "Today I...",
  "studyNotes": [
    { "id": "uuid", "period": "morning", "text": "Key takeaway", "locked": false }
  ],
  "prayerTimes": { ... },
  "mood": "happy"
}
```

### Storage Mechanisms

- **localStorage** — primary data store for all user data, preferences, and caches
- **Netlify Blob Store** — server-side storage for push notification subscriptions
- **Service Worker Cache** — browser cache for static assets (PWA offline support)

### Component/Page Structure

- **App.jsx** — root component containing all state, routing logic, sidebar, header, modals, and page render functions
- **Pages** — inline render functions within App.jsx (Timeline, Tasks, Journal, Habits, Sleep, Drinks, Prayers, Settings, Alternative Plan, Pulse Dashboard, Guide, Contact)
- **Utilities** — `prayerService.js` (prayer times, periods, time maths), `notificationManager.js` (push subscriptions), `constants.js` (shared constants)
- **i18n** — `i18n.js` with English and Arabic dictionaries (~1,000+ keys each), `t()` helper function
- **Styles** — `index.css` (~7,600 lines) with CSS custom properties for theming, Tailwind directives, and all component styles
- **Service Worker** — `service-worker.js` for PWA caching, push event handling, and notification click routing

---

## 6. UI/UX Design Principles

### Responsive Design

- **Desktop** — full layout with persistent sidebar, multi-column pages, and spacious content areas
- **Mobile** — collapsible sidebar with overlay, content fills full width, touch-friendly tap targets, safe area insets (`env(safe-area-inset-bottom)`)
- **Fluid scaling** — font size presets apply via `document.documentElement.style.fontSize`, scaling all `rem`-based sizing proportionally

### Layout Consistency

- Consistent header and sidebar structure across all pages
- Each tracker page (habits, sleep, drinks, prayers) follows the same card-based layout pattern
- The Pulse dashboard uses a grid of metric cards with uniform styling
- Settings uses a two-column grid on desktop, single-column on mobile

### Card-Based UI

- Task cards display name, time range, duration badge, and colour-coded left border (emerald for fixed tasks, teal for personal, gold for recurring)
- Metric cards on the Pulse dashboard use SVG progress rings with centred percentage labels
- Guide uses a grid of numbered step cards with illustrations

### Visual Feedback

- **Confetti animation** on task and habit completion
- **Toast notifications** with undo actions for task completion
- **Smooth transitions** for sidebar open/close, modal appearances
- **Colour coding** for prayer periods, task types, and completion states
- **Interactive states** — hover, active, and focus styles on all interactive elements

### Loading States

- **App ready delay** — a 3-second initialisation period prevents notification storms on first load
- **Prayer time indicator** — shows a loading state while fetching from the Aladhan API
- **No skeleton screens** — the app loads near-instantly since all content is client-side

### Theme System

- **Dark mode** (default) — dark background (#0a0a0a) with emerald accents
- **Light mode** — light background with complementary colours
- Applied via `data-theme` attribute on `<html>`, toggled by a CSS variable swap
- Colour palette uses CSS custom properties for consistent theming across all components
- Sufficient colour contrast maintained in both themes

---

## 7. Key Benefits

### Spiritual Alignment

Tarteeb is the only daily planner that places Islamic prayer times at the centre of the organisational structure. Instead of working around prayer, users build their day around it, reinforcing the spiritual rhythm that Islam prescribes.

### Complete Privacy

All data is stored in the user's browser. No accounts, no sign-ups, no cloud sync, no data collection. The only server requests are for prayer times (Aladhan API, optional) and push notification dispatch (opt-in). Users own their data entirely.

### Fully Offline Capable

Once loaded, the app works without an internet connection. Prayer times are cached, tasks are local, and the service worker ensures static assets are available offline. Push notifications are the only online-dependent feature.

### Bilingual by Default

Full English and Arabic support with automatic RTL layout switching. All interface text, prayer names, date formatting, and meta tags adapt to the selected language. The sidebar, timeline, modals, and all pages are fully translated.

### Zero Cost

Built entirely with free-tier services: Netlify (hosting + functions + blob store), GitHub Actions (CI/CD + cron), Aladhan API (prayer times), and Google Fonts. No subscription fees, no paid APIs, no backend costs.

### Comprehensive Tracking

Tarteeb combines task management, habit tracking, prayer tracking, sleep logging, drinks logging, mood tracking, and journaling into a single, integrated system. The Pulse dashboard synthesises all these dimensions into a single productivity score.

---

## 8. Future Improvements

- **Modular architecture refactor** — extract monolithic App.jsx into custom hooks and page components for maintainability
- **Unit and integration tests** — add test coverage for prayer calculations, slot computation, and task validation
- **Cloud synchronisation** — optional encrypted sync across devices via a personal storage provider
- **Month calendar view** — heatmap or calendar grid showing task completion across the month
- **Drag-and-drop task reordering** — allow users to reorder tasks within a period on the timeline
- **Pomodoro/focus timer** — integrate a study timer within each prayer period
- **AI-based suggestions** — smart task scheduling recommendations based on user habits
- **Advanced analytics** — longer-term trends, weekly/monthly reports, and export to PDF
- **Additional language support** — extend beyond English and Arabic to other Muslim-majority languages
- **Data encryption** — optional encryption for localStorage data on shared devices

---

*Tarteeb — Organise your day around what matters most.*
