# Tarteeb — Prayer-Based Muslim Daily Planner

A full-featured daily planner organised around the five daily Islamic prayers, using a **Maghrib-to-Maghrib** day cycle. Built with React 19 + Vite.

Every day starts at Maghrib (sunset) and runs through the next five prayer periods: **Evening** (Maghrib → Isha), **Night** (Isha → Fajr), **Morning** (Fajr → Dhuhr), **Afternoon** (Dhuhr → Asr), and **Late Afternoon** (Asr → Maghrib). Tasks are scheduled inside these blocks with collision-free time slots.

---

## Features

### Prayer-Based Timeline
- **Vertical timeline view** — scroll through your entire day with a continuous timeline marked with prayer boundaries and a red "now" line.
- **5 prayer periods** — tasks are grouped into the five periods automatically.
- **Fixed tasks** — the five daily prayers and Morning/Evening Adhkar are pre-populated, non-editable, and non-deletable.
- **Collision-free scheduling** — start/end time dropdowns in the task modal only show 5-minute slots that don't conflict with existing tasks.

### Task Management
- **Add, edit, delete tasks** — create personal or recurring tasks within any prayer period.
- **Completion tracking** — toggle tasks complete/incomplete from the timeline or the Tasks page.
- **Recurring tasks** — optionally repeat tasks daily.
- **Overall progress** — per-period and overall completion percentage shown on the Tasks page.

### Daily Journal
- Write daily reflections with automatic save.
- Journal entries are stored alongside the day's data and visible in the History log.

### History Log
- Every day you open Tarteeb is recorded.
- Browse past days, view journal entries and completion stats.
- "Open Day" to revisit a past day's timeline; "Delete" to remove it entirely.

### Settings & Customisation
- **Location** — fetch automatic prayer times via the Aladhan API (by city or coordinates).
- **Manual overrides** — set any prayer time manually.
- **Theme** — toggle Light / Dark mode (defaults to dark).
- **Language** — switch between English and Arabic (defaults to Arabic).
- **Time format** — choose 12-hour or 24-hour display.
- **Font size** — four presets: Small, Normal, Large, Extra Large.
- All preferences are saved to `localStorage`.

### Export
- Export the current day as a Markdown (`.md`) file, including prayer times, all tasks with completion status, and the journal entry.

### Additional UI
- **Sidebar** — shows the next prayer countdown, today's date (Gregorian + Hijri), prayer time strip with colour-coded boxes (gold for Maghrib, emerald for Isha/Dhuhr, teal for Fajr/Asr), and navigation links.
- **Mobile responsive** — collapsible sidebar with overlay, touch-friendly.
- **Welcome modal** — shown on first visit with links to Settings and Guide.
- **Prayer notifications** — a modal appears when a new prayer period begins.
- **Dynamic metadata** — page title, description, and OG meta tags update when switching languages.
- **Favicon** — custom emerald crescent moon + star SVG.

---

## How It Works

### The Prayer Day Cycle

| Period    | From         | To           | Prayer       |
| --------- | ------------ | ------------ | ------------ |
| Evening   | Maghrib      | Isha         | Maghrib      |
| Night     | Isha         | Fajr         | Isha         |
| Morning   | Fajr         | Dhuhr        | Fajr         |
| Afternoon | Dhuhr        | Asr          | Dhuhr        |
| Late Aftn | Asr          | Maghrib      | Asr          |

Fixed tasks (the five prayers + Morning Adhkar + Evening Adhkar) are placed at their prayer times automatically.

### Data Flow

1. On load, the app reads the user's location config from `localStorage`.
2. Prayer times are fetched from the **Aladhan API** (with a local cache), or loaded from manual overrides.
3. The day's tasks, journal, and stats are stored per-date in `localStorage` under keys like `tarteeb_day_2026-06-04`.
4. The timeline is computed from prayer period boundaries and task schedules in real-time.

### Tech Stack

- **React 19** — with hooks (useState, useEffect, useRef, useCallback, useMemo)
- **Vite** — fast dev server and production builds
- **Aladhan API** — daily prayer time fetching
- **localStorage** — all user data persists client-side
- **Google Fonts** — Inter (Latin) + Tajawal (Arabic)
- **Lucide React** — icon library

---

## Getting Started

```bash
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

### Build for Production

```bash
npm run build
npm run preview
```

The production build is output to `dist/`.

### Lint

```bash
npm run lint
```

---

## Project Structure

```
src/
├── App.jsx                # Main application component (routing, state, sidebar, modals, timeline, pages)
├── i18n.js                # English + Arabic translation strings, t() helper
├── main.jsx               # React entry point
├── index.css              # All styles — layout, theme variables, components, RTL support
├── utils/
│   └── prayerService.js   # Prayer time calculations, API fetching, period boundaries, minutes formatting
public/
├── favicon.svg            # Crescent + star favicon
├── icons.svg              # Social link icons
index.html                 # HTML shell with lang="ar", OG meta tags, favicon
```

---

## Key Technical Details

- **Day boundary**: The planner day starts at Maghrib (sunset) of the selected date and wraps through the next day's prayers. The date picker defaults to the current Maghrib-based day.
- **Time representation**: All times are stored as `"HH:MM"` strings internally, converted to minutes-from-midnight via `parseTimeToMinutes()` (which also handles 12-hour formats like `"7:30 PM"`).
- **Format conversion**: `formatMinutesToTime(minutes)` produces `"HH:MM"` in 24-hour mode or `"H:MM AM/PM"` in 12-hour mode based on a module-level `_use12h` flag in `prayerService.js`.
- **Slot availability**: `getAvailableStartSlots()` and `getAvailableEndSlots()` return 5-minute resolution slots filtered by existing task conflicts within a prayer period.
- **Font scaling**: Font size is applied via `document.documentElement.style.fontSize` so all `rem` values scale proportionally.
- **RTL support**: The `dir` attribute on `<html>` switches between `"ltr"` and `"rtl"`. The CSS includes overrides for layout, borders, margins, and font-family selection per direction.
- **Prayer notification**: Fires once per period transition using a `useRef` to track the last active period, preventing re-triggers.

---

## Contributing

This is a personal project. Suggestions and bug reports are welcome via GitHub Issues.

---

## License

MIT
