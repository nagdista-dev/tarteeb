/**
 * Tarteeb — Prayer Service Utility
 * Handles prayer time calculations, Aladhan API fetching, local cache, and logical planner day logic.
 */

// Helper: Format Date object to local YYYY-MM-DD
export function formatDateLocal(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// Helper: Add or subtract days
export function addDays(date, days) {
  const res = new Date(date);
  res.setDate(res.getDate() + days);
  return res;
}

// Default fallback prayer times (local solar approximation)
export const DEFAULT_PRAYER_TIMES = {
  fajr: "04:30",
  dhuhr: "12:30",
  asr: "15:45",
  maghrib: "19:00",
  isha: "20:30"
};

// Convert "HH:MM" to minutes from midnight
export function parseTimeToMinutes(timeStr) {
  if (!timeStr) return 0;
  const normalized = timeStr.trim();
  const isPM = /pm/i.test(normalized);
  const isAM = /am/i.test(normalized);
  const cleaned = normalized.replace(/\s*[ap]m\s*/i, '');
  const [h, m] = cleaned.split(':').map(Number);
  let hours = h || 0;
  if (isPM && hours < 12) hours += 12;
  if (isAM && hours === 12) hours = 0;
  return hours * 60 + (m || 0);
}

// 12h / 24h time format preference
let _use12h = false;

export function setUse12h(val) {
  _use12h = val;
}

export function getUse12h() {
  return _use12h;
}

// Convert minutes from midnight to time string
export function formatMinutesToTime(totalMinutes) {
  const h = Math.floor((totalMinutes % 1440) / 60);
  const m = Math.floor(totalMinutes % 60);
  if (!_use12h) {
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }
  const period = h < 12 ? 'AM' : 'PM';
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, '0')} ${period}`;
}

/**
 * Gets the cache of all date-specific prayer times.
 * Format: { "YYYY-MM-DD": { fajr, dhuhr, asr, maghrib, isha, hijriDate, isManual } }
 */
export function getPrayerCache() {
  const cacheStr = localStorage.getItem('tarteeb_prayer_cache');
  return cacheStr ? JSON.parse(cacheStr) : {};
}

export function savePrayerCache(cache) {
  localStorage.setItem('tarteeb_prayer_cache', JSON.stringify(cache));
}

/**
 * Get prayer times for a single Gregorian date from cache or defaults.
 */
export function getPrayerTimesForDate(dateStr) {
  const cache = getPrayerCache();
  return cache[dateStr] || { ...DEFAULT_PRAYER_TIMES, hijriDate: "", isManual: true };
}

/**
 * Finds which logical planner day the given date/time belongs to.
 * The planner day begins at Maghrib of Day X (using Day X's Maghrib time)
 * and ends at Maghrib of Day X+1 (using Day X+1's Maghrib time).
 * 
 * If today is dateStr and the time is past Maghrib, then the active planner day is tomorrow (dateStr + 1).
 * Otherwise, the active planner day is today (dateStr).
 */
export function getLogicalPlannerDate(date) {
  const todayStr = formatDateLocal(date);
  const todayPrayers = getPrayerTimesForDate(todayStr);
  const maghribTime = todayPrayers.maghrib || DEFAULT_PRAYER_TIMES.maghrib;
  
  const currentMinutes = date.getHours() * 60 + date.getMinutes();
  const maghribMinutes = parseTimeToMinutes(maghribTime);

  if (currentMinutes >= maghribMinutes) {
    // Past Maghrib, so we are in the next planner day
    return formatDateLocal(addDays(date, 1));
  } else {
    // Before Maghrib, we are in the current planner day
    return todayStr;
  }
}

/**
 * Retrieves the compiled prayer times for a logical planner day.
 * A planner day labeled YYYY-MM-DD (e.g. Friday) consists of:
 * - Maghrib and Isha from the previous calendar day (Thursday)
 * - Fajr, Dhuhr, and Asr from the current calendar day (Friday)
 */
export function getCompiledPrayersForPlannerDate(plannerDateStr) {
  const currDate = new Date(plannerDateStr);
  const prevDateStr = formatDateLocal(addDays(currDate, -1));

  const prevPrayers = getPrayerTimesForDate(prevDateStr);
  const currPrayers = getPrayerTimesForDate(plannerDateStr);

  return {
    maghrib: prevPrayers.maghrib || DEFAULT_PRAYER_TIMES.maghrib,
    isha: prevPrayers.isha || DEFAULT_PRAYER_TIMES.isha,
    fajr: currPrayers.fajr || DEFAULT_PRAYER_TIMES.fajr,
    dhuhr: currPrayers.dhuhr || DEFAULT_PRAYER_TIMES.dhuhr,
    asr: currPrayers.asr || DEFAULT_PRAYER_TIMES.asr,
    hijriDate: currPrayers.hijriDate || "",
    isManual: currPrayers.isManual || false
  };
}

/**
 * Fetches prayer times from Aladhan API for a specific date and location.
 */
export async function fetchPrayerTimesFromAPI(dateStr, locationConfig) {
  const [year, month, day] = dateStr.split('-');
  const dateFormatted = `${day}-${month}-${year}`; // DD-MM-YYYY for Aladhan API
  
  let url = '';
  if (locationConfig.type === 'city') {
    const { city, country } = locationConfig;
    url = `https://api.aladhan.com/v1/timingsByCity/${dateFormatted}?city=${encodeURIComponent(city)}&country=${encodeURIComponent(country)}&method=3`;
  } else if (locationConfig.type === 'coords') {
    const { latitude, longitude } = locationConfig;
    url = `https://api.aladhan.com/v1/timings/${dateFormatted}?latitude=${latitude}&longitude=${longitude}&method=3`;
  } else {
    throw new Error("Invalid location configuration");
  }

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error("Failed to fetch prayer times");
  }
  const result = await response.json();
  if (result.code !== 200 || !result.data) {
    throw new Error(result.data || "Aladhan API Error");
  }

  const timings = result.data.timings;
  const hijri = result.data.date.hijri;
  const hijriStr = `${hijri.day} ${hijri.month.en} ${hijri.year}`;

  return {
    fajr: timings.Fajr,
    dhuhr: timings.Dhuhr,
    asr: timings.Asr,
    maghrib: timings.Maghrib,
    isha: timings.Isha,
    hijriDate: hijriStr,
    isManual: false
  };
}

/**
 * Ensures cached prayer times exist for the given planner date and its surrounding days.
 * If API fails, falls back to manual/default values.
 */
export async function ensurePrayerTimesCached(dateStr, locationConfig) {
  const cache = getPrayerCache();
  const prevDateStr = formatDateLocal(addDays(new Date(dateStr), -1));
  const nextDateStr = formatDateLocal(addDays(new Date(dateStr), 1));
  
  let updated = false;

  const datesToFetch = [prevDateStr, dateStr, nextDateStr].filter(d => !cache[d]);

  if (datesToFetch.length > 0 && locationConfig && locationConfig.enabled) {
    for (const d of datesToFetch) {
      try {
        const timings = await fetchPrayerTimesFromAPI(d, locationConfig);
        cache[d] = timings;
        updated = true;
      } catch (err) {
        console.warn(`Failed to fetch for ${d}, using defaults:`, err);
        // Do not block, fallback to defaults
        cache[d] = {
          ...DEFAULT_PRAYER_TIMES,
          hijriDate: "",
          isManual: true
        };
        updated = true;
      }
    }
  } else {
    // If no location config, populate empty dates with defaults
    [prevDateStr, dateStr, nextDateStr].forEach(d => {
      if (!cache[d]) {
        cache[d] = {
          ...DEFAULT_PRAYER_TIMES,
          hijriDate: "",
          isManual: true
        };
        updated = true;
      }
    });
  }

  if (updated) {
    savePrayerCache(cache);
  }
}

/**
 * Systems-defined fixed Islamic tasks.
 */
export const FIXED_TASKS_TEMPLATES = [
  { name: "Maghrib Prayer", period: "evening", duration: 15, type: "fixed" },
  { name: "Isha Prayer", period: "night", duration: 15, type: "fixed" },
  { name: "Fajr Prayer", period: "morning", duration: 15, type: "fixed" },
  { name: "Morning Adhkar", period: "morning", duration: 15, type: "fixed" },
  { name: "Dhuhr Prayer", period: "afternoon", duration: 15, type: "fixed" },
  { name: "Asr Prayer", period: "late_afternoon", duration: 15, type: "fixed" },
  { name: "Evening Adhkar", period: "late_afternoon", duration: 15, type: "fixed" }
];

/**
 * Calculates current active period and percentage elapsed.
 * Returns: {
 *   activePeriod: "evening" | "night" | "morning" | "afternoon" | "late_afternoon" | "none",
 *   percentCompleted: number, // 0 to 100
 *   nextPrayerName: string,
 *   timeToNextPrayer: string // HH:MM
 * }
 */
export function calculateTimelineStatus(currentTime, compiledPrayers, plannerDateStr) {
  // Let's align all times relative to the start of the planner day: Day A Maghrib.
  const maghribA = parseTimeToMinutes(compiledPrayers.maghrib);
  const ishaA = parseTimeToMinutes(compiledPrayers.isha);
  const fajrB = parseTimeToMinutes(compiledPrayers.fajr) + 1440;
  const dhuhrB = parseTimeToMinutes(compiledPrayers.dhuhr) + 1440;
  const asrB = parseTimeToMinutes(compiledPrayers.asr) + 1440;
  const maghribB = parseTimeToMinutes(compiledPrayers.maghrib) + 1440; // Approx next day Maghrib

  // Determine current time in minutes relative to Day A midnight
  const currHours = currentTime.getHours();
  const currMins = currentTime.getMinutes();
  let currMinutesTotal = currHours * 60 + currMins;

  // Let's check if the current time falls inside the logical day.
  // The logical day runs from Maghrib A to Maghrib B.
  // If the current time is before Maghrib A (e.g. 10:00 AM on Day A),
  // but wait! The planner date is the date of Day B (the daylight portion).
  // So the current date is either Day A (before midnight) or Day B (after midnight).
  const currentGregStr = formatDateLocal(currentTime);

  if (currentGregStr === plannerDateStr) {
    // We are on Day B (the day of Fajr, Dhuhr, Asr).
    // Any time from 00:00 to Maghrib B is in the planner day.
    // So we add 1440 to the current time.
    currMinutesTotal += 1440;
  } else {
    // We are on Day A (the day of Maghrib A, Isha A).
    // If the time is before Maghrib A, it belongs to the *previous* planner day!
    // But if we are evaluating the *current* planner day:
    if (currMinutesTotal < maghribA) {
      // It's technically in the previous planner day.
      // But we can clip it or let it be. Let's just adjust it.
    }
  }

  // Intervals and active period
  let activePeriod = "none";
  let percentCompleted = 0;
  let nextPrayerName = "";
  let minsToNext = 0;

  if (currMinutesTotal >= maghribA && currMinutesTotal < ishaA) {
    activePeriod = "evening";
    percentCompleted = ((currMinutesTotal - maghribA) / (ishaA - maghribA)) * 100;
    nextPrayerName = "Isha";
    minsToNext = ishaA - currMinutesTotal;
  } else if (currMinutesTotal >= ishaA && currMinutesTotal < fajrB) {
    activePeriod = "night";
    percentCompleted = ((currMinutesTotal - ishaA) / (fajrB - ishaA)) * 100;
    nextPrayerName = "Fajr";
    minsToNext = fajrB - currMinutesTotal;
  } else if (currMinutesTotal >= fajrB && currMinutesTotal < dhuhrB) {
    activePeriod = "morning";
    percentCompleted = ((currMinutesTotal - fajrB) / (dhuhrB - fajrB)) * 100;
    nextPrayerName = "Dhuhr";
    minsToNext = dhuhrB - currMinutesTotal;
  } else if (currMinutesTotal >= dhuhrB && currMinutesTotal < asrB) {
    activePeriod = "afternoon";
    percentCompleted = ((currMinutesTotal - dhuhrB) / (asrB - dhuhrB)) * 100;
    nextPrayerName = "Asr";
    minsToNext = asrB - currMinutesTotal;
  } else if (currMinutesTotal >= asrB && currMinutesTotal < maghribB) {
    activePeriod = "late_afternoon";
    percentCompleted = ((currMinutesTotal - asrB) / (maghribB - asrB)) * 100;
    nextPrayerName = "Maghrib";
    minsToNext = maghribB - currMinutesTotal;
  } else {
    // Fallback or boundary
    activePeriod = "late_afternoon";
    percentCompleted = 100;
    nextPrayerName = "Maghrib";
    minsToNext = 0;
  }

  // Format hours and minutes to next prayer
  const hoursToNext = Math.floor(minsToNext / 60);
  const minutesToNext = Math.floor(minsToNext % 60);
  const timeToNextPrayer = hoursToNext > 0 
    ? `${hoursToNext}h ${minutesToNext}m` 
    : `${minutesToNext}m`;

  return {
    activePeriod,
    percentCompleted: Math.min(100, Math.max(0, percentCompleted)),
    nextPrayerName,
    timeToNextPrayer
  };
}

/**
 * Map period keys to display names and Arabic names
 */
export const PERIODS_META = {
  evening: { name: "Evening", arabic: "المساء", range: "Maghrib to Isha" },
  night: { name: "Night", arabic: "الليل", range: "Isha to Fajr" },
  morning: { name: "Morning", arabic: "الصباح", range: "Fajr to Dhuhr" },
  afternoon: { name: "Afternoon", arabic: "الظهر", range: "Dhuhr to Asr" },
  late_afternoon: { name: "Late Afternoon", arabic: "العصر", range: "Asr to Maghrib" }
};

export function getPeriodStartMinutes(periodKey, compiledPrayers) {
  const maghrib = parseTimeToMinutes(compiledPrayers.maghrib);
  const isha = parseTimeToMinutes(compiledPrayers.isha);
  const fajr = parseTimeToMinutes(compiledPrayers.fajr);
  const dhuhr = parseTimeToMinutes(compiledPrayers.dhuhr);
  const asr = parseTimeToMinutes(compiledPrayers.asr);

  switch (periodKey) {
    case 'evening': return maghrib;
    case 'night': return isha;
    case 'morning': return fajr + 1440;
    case 'afternoon': return dhuhr + 1440;
    case 'late_afternoon': return asr + 1440;
    default: return 0;
  }
}

export function getPeriodEndMinutes(periodKey, compiledPrayers) {
  const maghrib = parseTimeToMinutes(compiledPrayers.maghrib);
  const isha = parseTimeToMinutes(compiledPrayers.isha);
  const fajr = parseTimeToMinutes(compiledPrayers.fajr);
  const dhuhr = parseTimeToMinutes(compiledPrayers.dhuhr);
  const asr = parseTimeToMinutes(compiledPrayers.asr);

  switch (periodKey) {
    case 'evening': return isha;
    case 'night': return fajr + 1440;
    case 'morning': return dhuhr + 1440;
    case 'afternoon': return asr + 1440;
    case 'late_afternoon': return maghrib + 1440; // End at next Maghrib
    default: return 0;
  }
}

export function getHourMarksForPeriod(periodKey, compiledPrayers) {
  const startMins = getPeriodStartMinutes(periodKey, compiledPrayers);
  const endMins = getPeriodEndMinutes(periodKey, compiledPrayers);
  const duration = endMins - startMins;

  const startHour = Math.ceil(startMins / 60);
  const endHour = Math.floor(endMins / 60);

  const marks = [];
  for (let h = startHour; h <= endHour; h++) {
    const mins = h * 60;
    const pct = ((mins - startMins) / duration) * 100;
    marks.push({
      label: `${String(h % 24).padStart(2, '0')}:00`,
      percent: pct
    });
  }
  return marks;
}

export function formatDurationHours(minutes) {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (mins === 0) {
    return hours === 1 ? '1 hour' : `${hours} hours`;
  }
  if (hours === 0) {
    return `${mins} mins`;
  }
  return `${hours}h ${mins}m`;
}

/** Ordered keys for the full planner day (Maghrib → next Maghrib). */
export const PLANNER_PERIOD_ORDER = [
  'evening', 'night', 'morning', 'afternoon', 'late_afternoon'
];

export function getPlannerDayStartMinutes(compiledPrayers) {
  return parseTimeToMinutes(compiledPrayers.maghrib);
}

export function getPlannerDayEndMinutes(compiledPrayers) {
  return parseTimeToMinutes(compiledPrayers.maghrib) + 1440;
}

export function getPlannerDayDurationMinutes(compiledPrayers) {
  return getPlannerDayEndMinutes(compiledPrayers) - getPlannerDayStartMinutes(compiledPrayers);
}

/** Current moment on the planner-day axis (minutes from midnight, may exceed 1440). */
export function getCurrentPlannerMinutes(currentTime, plannerDateStr) {
  const maghrib = parseTimeToMinutes(getPrayerTimesForDate(plannerDateStr).maghrib || DEFAULT_PRAYER_TIMES.maghrib);
  let mins = currentTime.getHours() * 60 + currentTime.getMinutes();
  const gregStr = formatDateLocal(currentTime);

  if (gregStr === plannerDateStr) {
    mins += 1440;
  } else if (mins < maghrib) {
    mins += 1440;
  }
  return mins;
}

export function plannerMinutesToPercent(mins, compiledPrayers) {
  const start = getPlannerDayStartMinutes(compiledPrayers);
  const end = getPlannerDayEndMinutes(compiledPrayers);
  const duration = end - start;
  if (duration <= 0) return 0;
  return Math.min(100, Math.max(0, ((mins - start) / duration) * 100));
}

export function getPrayerMarkersForPlannerDay(compiledPrayers) {
  const maghrib = parseTimeToMinutes(compiledPrayers.maghrib);
  const markers = [
    { key: 'maghrib_start', label: 'Maghrib', time: compiledPrayers.maghrib, minutes: maghrib },
    { key: 'isha', label: 'Isha', time: compiledPrayers.isha, minutes: parseTimeToMinutes(compiledPrayers.isha) },
    { key: 'fajr', label: 'Fajr', time: compiledPrayers.fajr, minutes: parseTimeToMinutes(compiledPrayers.fajr) + 1440 },
    { key: 'dhuhr', label: 'Dhuhr', time: compiledPrayers.dhuhr, minutes: parseTimeToMinutes(compiledPrayers.dhuhr) + 1440 },
    { key: 'asr', label: 'Asr', time: compiledPrayers.asr, minutes: parseTimeToMinutes(compiledPrayers.asr) + 1440 },
    { key: 'maghrib_end', label: 'Maghrib', time: compiledPrayers.maghrib, minutes: maghrib + 1440 }
  ];
  return markers.map(m => ({
    ...m,
    percent: plannerMinutesToPercent(m.minutes, compiledPrayers)
  }));
}

export function getHourMarksForPlannerDay(compiledPrayers) {
  const start = getPlannerDayStartMinutes(compiledPrayers);
  const end = getPlannerDayEndMinutes(compiledPrayers);
  const duration = end - start;
  const startHour = Math.ceil(start / 60);
  const endHour = Math.floor(end / 60);
  const marks = [];

  for (let h = startHour; h <= endHour; h++) {
    const mins = h * 60;
    marks.push({
      label: formatMinutesToTime(mins),
      percent: ((mins - start) / duration) * 100
    });
  }
  return marks;
}

export function getDefaultTimeForPeriod(periodKey, compiledPrayers) {
  const start = getPeriodStartMinutes(periodKey, compiledPrayers);
  return formatMinutesToTime(start);
}

const FIXED_TASK_PRAYER_KEY = {
  'Maghrib Prayer': 'maghrib',
  'Isha Prayer': 'isha',
  'Fajr Prayer': 'fajr',
  'Dhuhr Prayer': 'dhuhr',
  'Asr Prayer': 'asr'
};

export function getTaskDisplayTime(task, compiledPrayers) {
  if (task.scheduledTime) return task.scheduledTime;
  const prayerKey = FIXED_TASK_PRAYER_KEY[task.name];
  if (prayerKey && compiledPrayers[prayerKey]) {
    return compiledPrayers[prayerKey];
  }
  return getDefaultTimeForPeriod(task.period, compiledPrayers);
}

export function scheduledTimeToPlannerMinutes(timeStr, periodKey, compiledPrayers) {
  if (!timeStr) return getPeriodStartMinutes(periodKey, compiledPrayers);
  let mins = parseTimeToMinutes(timeStr);
  const periodStart = getPeriodStartMinutes(periodKey, compiledPrayers);
  const periodEnd = getPeriodEndMinutes(periodKey, compiledPrayers);

  if (periodStart >= 1440 && mins < 1440) {
    mins += 1440;
  } else if (periodEnd > 1440 && mins < periodStart) {
    mins += 1440;
  }

  return Math.min(periodEnd - 1, Math.max(periodStart, mins));
}

export function getTaskPlannerMinutes(task, compiledPrayers) {
  return scheduledTimeToPlannerMinutes(
    getTaskDisplayTime(task, compiledPrayers),
    task.period,
    compiledPrayers
  );
}

export function sortTasksForPlannerDay(tasks, compiledPrayers) {
  return [...tasks].sort((a, b) => {
    const diff = getTaskPlannerMinutes(a, compiledPrayers) - getTaskPlannerMinutes(b, compiledPrayers);
    if (diff !== 0) return diff;
    return (a.name || '').localeCompare(b.name || '');
  });
}
