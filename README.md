# Tarteeb — Prayer-Based Daily Planner

A daily planner organized around the five daily prayers (Maghrib–Maghrib cycle). Built with React + Vite.

## Features

- **Prayer-aware timeline** — tasks are scheduled within prayer periods (Maghrib, Isha, Fajr, Dhuhr, Asr) with automatic time slot management
- **Collision-free scheduling** — start/end time selects only show available 5-minute slots that don't overlap existing tasks
- **Fixed prayer tasks** — five daily prayers and Adhkar are pre-populated and cannot be edited or deleted
- **Markdown export** — export the day's tasks, prayer times, and journal notes as a `.md` file
- **Journal** — daily diary with save button, Arabic/RTL support
- **History** — browse, open, or delete past days
- **Sidebar** — collapsible on mobile, shows prayer times, next prayer countdown, and completion stats
- **Dark mode** — toggleable light/dark theme
- **Local storage** — all data persists in the browser

## Getting Started

```bash
npm install
npm run dev
```

Build for production:

```bash
npm run build
```

## Tech Stack

- React 19
- Vite
- Prayer times via Aladhan API
- Google Fonts (Inter, Tajawal)
- Lucide React icons
