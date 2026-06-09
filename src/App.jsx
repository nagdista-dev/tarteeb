import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Bell, Check, Plus, Minus, Edit2, Trash2, Settings, Moon, Sun,
  BookOpen, Clock, Sparkles, MapPin, X, AlertCircle,
  ChevronUp, ChevronDown, RefreshCw, Download, HelpCircle, List, Type, Menu, Target,
  Smartphone, Lock, Unlock, Upload, Search, Zap, Activity,
  TrendingUp, BarChart3, Flame, CalendarDays, PenLine, Heart, Coffee, Award, Send,
  Maximize, Minimize
} from 'lucide-react';
import confetti from 'canvas-confetti';
import {
  formatDateLocal, addDays, getPrayerTimesForDate,
  getLogicalPlannerDate, getCompiledPrayersForPlannerDate,
  ensurePrayerTimesCached, FIXED_TASKS_TEMPLATES,
  calculateTimelineStatus, PERIODS_META, savePrayerCache, getPrayerCache,
  getPeriodStartMinutes, getPeriodEndMinutes, formatDurationHours,
  getPlannerPeriodOrder, getDefaultTimeForPeriod, getCurrentPlannerMinutes,
   getTaskDisplayTime, getTaskPlannerMinutes, sortTasksForPlannerDay, scheduledTimeToPlannerMinutes,
  formatMinutesToTime, setUse12h, getUse12h, parseTimeToMinutes,
  setDayStartMode, getDayStartMode, DAY_START_MODES,
  getPlannerDayStartMinutes, getPlannerDayEndMinutes, getPrayerMarkersForPlannerDay
} from './utils/prayerService';

import { t, setLanguage, getLanguage, translateTaskName } from './i18n';
import countries from './data/countries';

const calculateStats = (tasks) => {
  const total = tasks.length;
  const completed = tasks.filter(t => t.completed).length;
  const fixed = tasks.filter(t => t.type === 'fixed');
  const fixedCompleted = fixed.length ? Math.round((fixed.filter(t => t.completed).length / fixed.length) * 100) : 0;
  const personal = tasks.filter(t => t.type !== 'fixed');
  const personalCompleted = personal.length ? Math.round((personal.filter(t => t.completed).length / personal.length) * 100) : 0;
  return {
    totalTasks: total,
    completedTasks: completed,
    overallCompleted: total ? Math.round((completed / total) * 100) : 0,
    fixedCompleted,
    personalCompleted
  };
};

let fallbackTaskId = 0;
const createTaskId = () => (
  globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `task_${fallbackTaskId += 1}`
);

const TASK_GAP = 5;
const NOTIF_ICON = '/icons/icon-192.png';

const getTaskStartMinutes = (task, prayers) => scheduledTimeToPlannerMinutes(
  getTaskDisplayTime(task, prayers),
  task.period,
  prayers
);

const FIXED_TASK_SCHEDULE = {
  'Maghrib Prayer': { period: 'evening', offset: 0 },
  'Isha Prayer': { period: 'night', offset: 0 },
  'Fajr Prayer': { period: 'morning', offset: 0 },
  'Morning Adhkar': { period: 'morning', offset: 20 },
  'Dhuhr Prayer': { period: 'afternoon', offset: 0 },
  'Asr Prayer': { period: 'late_afternoon', offset: 0 },
  'Evening Adhkar': { period: 'late_afternoon', offset: 0 }
};

const PRAYER_TO_TASK_NAME = {
  'fajr': 'Fajr Prayer',
  'dhuhr': 'Dhuhr Prayer',
  'asr': 'Asr Prayer',
  'maghrib': 'Maghrib Prayer',
  'isha': 'Isha Prayer'
};

const FIXED_TASK_PRAYER_KEY = {
  'Fajr Prayer': 'fajr',
  'Dhuhr Prayer': 'dhuhr',
  'Asr Prayer': 'asr',
  'Maghrib Prayer': 'maghrib',
  'Isha Prayer': 'isha'
};

const TASK_TO_ADHKAR_KEY = {
  'Morning Adhkar': 'adhkar_morning',
  'Evening Adhkar': 'adhkar_evening'
};

const ADHKAR_KEY_TO_TASK = {
  'adhkar_morning': 'Morning Adhkar',
  'adhkar_evening': 'Evening Adhkar'
};

const getFixedTaskSchedule = (task, prayers) => {
  const isAdhkar = task.name.includes('Adhkar');
  const duration = isAdhkar ? 10 : 15;
  if (task.name === 'Evening Adhkar') {
    const start = getPeriodEndMinutes('late_afternoon', prayers) - 60;
    return {
      period: 'late_afternoon',
      duration,
      scheduledTime: formatMinutesToTime(start)
    };
  }
  const schedule = FIXED_TASK_SCHEDULE[task.name];
  if (!schedule) return null;
  const start = getPeriodStartMinutes(schedule.period, prayers) + schedule.offset;
  return {
    period: schedule.period,
    duration,
    scheduledTime: formatMinutesToTime(start)
  };
};

const normalizeFixedTask = (task, prayers) => {
  const fixedSchedule = task.type === 'fixed' ? getFixedTaskSchedule(task, prayers) : null;
  return fixedSchedule ? { ...task, ...fixedSchedule, isRecurring: false } : task;
};

const normalizeTasksForPrayerBlocks = (tasks, prayers) => {
  const usedRangesByBlock = {};

  return sortTasksForPlannerDay(tasks.map(task => normalizeFixedTask(task, prayers)), prayers).map(task => {
    const blockStart = getPeriodStartMinutes(task.period, prayers);
    const blockEnd = getPeriodEndMinutes(task.period, prayers);
    const blockDuration = Math.max(1, blockEnd - blockStart);
    const usedRanges = usedRangesByBlock[task.period] || [];
    const hasOverlap = (s, e) => usedRanges.some(r => Math.max(s, r.start) < Math.min(e, r.end));

    if (task.type === 'fixed') {
      const start = getTaskStartMinutes(task, prayers);
      const duration = Number(task.duration) || 15;
      usedRanges.push({ start, end: start + duration + TASK_GAP });
      usedRangesByBlock[task.period] = usedRanges;
      return task;
    }

    let duration = Math.max(1, Math.min(Number(task.duration) || 15, blockDuration));
    let start = getTaskStartMinutes(task, prayers);

    if (start < blockStart || start >= blockEnd || start + duration > blockEnd) {
      start = Math.min(Math.max(blockStart, start), blockEnd - duration);
    }

    while (hasOverlap(start, start + duration + TASK_GAP) && start + duration + TASK_GAP <= blockEnd) {
      start += TASK_GAP;
    }

    if (hasOverlap(start, start + duration + TASK_GAP)) {
      start = blockStart;
      while (hasOverlap(start, start + duration + TASK_GAP) && start + duration + TASK_GAP <= blockEnd) {
        start += TASK_GAP;
      }
    }

    usedRanges.push({ start, end: start + duration + TASK_GAP });
    usedRangesByBlock[task.period] = usedRanges;

    return {
      ...task,
      duration,
      scheduledTime: formatMinutesToTime(start)
    };
  });
};

const getFirstAvailableTimeForPeriod = (period, tasks, prayers, duration = 15, excludeTaskId = null, minTime = null) => {
  const blockStart = getPeriodStartMinutes(period, prayers);
  const blockEnd = getPeriodEndMinutes(period, prayers);
  const occupied = getOccupiedSlots(period, tasks, prayers, excludeTaskId);

  for (let start = Math.max(blockStart, minTime ?? blockStart); start + duration <= blockEnd; start += 1) {
    const overlaps = occupied.some(slot => start < slot.end && start + duration > slot.start);
    if (!overlaps) return formatMinutesToTime(start);
  }

  return formatMinutesToTime(blockStart);
};

const getOccupiedSlots = (period, tasks, prayers, excludeTaskId = null) => {
  return tasks
    .map(task => normalizeFixedTask(task, prayers))
    .filter(task => task.period === period && task.id !== excludeTaskId)
    .map(task => {
      const start = getTaskStartMinutes(task, prayers);
      return { start, end: start + (Number(task.duration) || 15) };
    })
    .sort((a, b) => a.start - b.start);
};

const getAvailableStartSlots = (period, tasks, prayers, excludeTaskId = null, minTime = null) => {
  const blockStart = getPeriodStartMinutes(period, prayers);
  const blockEnd = getPeriodEndMinutes(period, prayers);
  const occupied = getOccupiedSlots(period, tasks, prayers, excludeTaskId);
  const slots = [];

  for (let start = blockStart; start < blockEnd; start += 1) {
    if (minTime !== null && start < minTime) continue;
    const overlaps = occupied.some(slot => start >= slot.start && start < slot.end);
    if (!overlaps) slots.push(start);
  }

  return slots;
};

const getAvailableEndSlots = (period, tasks, prayers, startMinutes, excludeTaskId = null) => {
  const blockEnd = getPeriodEndMinutes(period, prayers);
  const occupied = getOccupiedSlots(period, tasks, prayers, excludeTaskId);
  const slots = [];

  for (let end = startMinutes + 1; end <= blockEnd; end += 1) {
    const crossesOther = occupied.some(slot => startMinutes < slot.end && end > slot.start);
    if (!crossesOther) slots.push(end);
  }

  return slots;
};

const translateDuration = (minutes) => {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (mins === 0) {
    return hours === 1 ? t('duration.hour') : t('duration.hours').replace('%', hours);
  }
  if (hours === 0) {
    return t('duration.mins').replace('%', mins);
  }
  return t('duration.hm').replace('%h', hours).replace('%m', mins);
};

function App() {
  // ---- UI Navigation ----
  const [currentPage, setCurrentPage] = useState('home'); // home | tasks | journal | guide | settings | study | habits

  // ---- Theme ----
  const [theme, setTheme] = useState(() => localStorage.getItem('tarteeb_theme') || 'light');

  // ---- Language ----
  const [lang, setLang] = useState(() => {
    const saved = localStorage.getItem('tarteeb_lang') || 'ar';
    setLanguage(saved);
    return saved;
  });

  useEffect(() => {
    document.documentElement.setAttribute('lang', lang);
    document.documentElement.setAttribute('dir', lang === 'ar' ? 'rtl' : 'ltr');
    localStorage.setItem('tarteeb_lang', lang);
    setLanguage(lang);
    document.title = lang === 'ar' ? 'Tarteeb — منظم يومي مسلم' : 'Tarteeb — Muslim Daily Planner';
    document.querySelector('meta[name="description"]')?.setAttribute('content',
      lang === 'ar'
        ? 'Tarteeb — منظم يومي مسلم: خطط يومك حول أوقات الصلاة، إدارة المهام، ومذكرات يومية'
        : 'Muslim Daily Planner — organize your day around Islamic prayer times with a beautiful vertical timeline, task management, and daily diary.'
    );
    document.querySelector('meta[property="og:title"]')?.setAttribute('content',
      lang === 'ar' ? 'Tarteeb — منظم يومي مسلم' : 'Tarteeb — Muslim Daily Planner'
    );
    document.querySelector('meta[property="og:description"]')?.setAttribute('content',
      lang === 'ar'
        ? 'خطط يومك حول أوقات الصلاة الإسلامية مع خط زمني عمودي جميل، إدارة المهام، ومذكرات يومية'
        : 'Organize your day around Islamic prayer times with a beautiful vertical timeline, task management, and daily diary.'
    );
    document.querySelector('meta[name="twitter:title"]')?.setAttribute('content',
      lang === 'ar' ? 'Tarteeb — منظم يومي مسلم' : 'Tarteeb — Muslim Daily Planner'
    );
    document.querySelector('meta[name="twitter:description"]')?.setAttribute('content',
      lang === 'ar'
        ? 'خطط يومك حول أوقات الصلاة الإسلامية مع خط زمني عمودي جميل، إدارة المهام، ومذكرات يومية'
        : 'Organize your day around Islamic prayer times with a beautiful vertical timeline, task management, and daily diary.'
    );
  }, [lang]);

  // ---- Font Size ----
  const FONT_SIZES = ['small', 'normal', 'large', 'xlarge'];
  const FONT_SIZE_VALUES = { small: '14px', normal: '16px', large: '18px', xlarge: '20px' };
  const [fontSize, setFontSize] = useState(() => {
    const saved = localStorage.getItem('tarteeb_font_size');
    return FONT_SIZES.includes(saved) ? saved : 'normal';
  });

  useEffect(() => {
    document.documentElement.style.fontSize = FONT_SIZE_VALUES[fontSize];
    localStorage.setItem('tarteeb_font_size', fontSize);
  }, [fontSize]);

  // ---- Time Format ----
  const [use12h, setUse12hState] = useState(() => {
    const saved = localStorage.getItem('tarteeb_use12h');
    if (saved === null) return true;
    return saved === 'true';
  });

  useEffect(() => {
    setUse12h(use12h);
    localStorage.setItem('tarteeb_use12h', use12h);
  }, [use12h]);

  // ---- Day Start Mode ----
  const [dayStartMode, setDayStartModeState] = useState(() => {
    const saved = localStorage.getItem('tarteeb_day_start_mode');
    if (saved && Object.values(DAY_START_MODES).includes(saved)) return saved;
    return DAY_START_MODES.MIDNIGHT;
  });

  useEffect(() => {
    setDayStartMode(dayStartMode);
    localStorage.setItem('tarteeb_day_start_mode', dayStartMode);
    // Recompute active date when mode changes
    setActiveDate(getLogicalPlannerDate(new Date()));
  }, [dayStartMode]);

  // ---- Location Config ----
  const [locationConfig, setLocationConfig] = useState(() => {
    const saved = localStorage.getItem('tarteeb_location_config');
    const defaults = { enabled: true, type: 'city', city: 'Cairo', country: 'Egypt', latitude: '30.0444', longitude: '31.2357' };
    return saved ? { ...defaults, ...JSON.parse(saved), enabled: true } : defaults;
  });

  // ---- Planner Date & Data ----
  const [activeDate, setActiveDate] = useState(() => getLogicalPlannerDate(new Date()));
  const [dayData, setDayData] = useState(null);
  const dayDataRef = useRef(dayData);
  dayDataRef.current = dayData;

  // ---- Mobile sidebar ----
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // ---- Real‑time Clock ----
  const [currentTime, setCurrentTime] = useState(new Date());
  const [timelineStatus, setTimelineStatus] = useState(null);

  // ---- Modals & Forms ----
  const [taskModal, setTaskModal] = useState({ open: false, mode: 'add', task: null });
  const [taskForm, setTaskForm] = useState({
    name: '', details: '', duration: 15, period: 'evening', scheduledTime: '19:00', endTime: '19:15', isRecurring: false
  });
  const [settingsForm, setSettingsForm] = useState({ ...locationConfig });
  const [manualTimesForm, setManualTimesForm] = useState({ fajr: '', dhuhr: '', asr: '', maghrib: '', isha: '' });
  const [diaryDraft, setDiaryDraft] = useState('');
  const [diarySaved, setDiarySaved] = useState(true);
  const [studyText, setStudyText] = useState('');
  const [studyPeriod, setStudyPeriod] = useState('morning');
  const [editingNoteId, setEditingNoteId] = useState(null);
  const [editText, setEditText] = useState('');
  const [collapsedPeriods, setCollapsedPeriods] = useState({ evening: true, night: true, morning: true, afternoon: true, late_afternoon: true });
  const [expandedTaskId, setExpandedTaskId] = useState(null);
  const [dialog, setDialog] = useState(null);
  const [errorLog, setErrorLog] = useState([]);
  const [errorModalOpen, setErrorModalOpen] = useState(false);

  const addError = (message, source) => {
    const entry = { id: Date.now(), message, source, time: new Date().toLocaleTimeString() };
    setErrorLog(prev => [entry, ...prev]);
    console.error(source ? `[${source}] ${message}` : message);
  };
  const [loading, setLoading] = useState(false);
  const [apiError, setApiError] = useState(null);
  const [showWelcome, setShowWelcome] = useState(() => !localStorage.getItem('tarteeb_welcome_dismissed'));
  const [prayerNotif, setPrayerNotif] = useState(null);
  const [showNotifPrompt, setShowNotifPrompt] = useState(false);
  const [showNotifStatus, setShowNotifStatus] = useState(false);
  const [contactMessage, setContactMessage] = useState('');
  const [contactSending, setContactSending] = useState(false);
  const lastActivePeriod = useRef(null);
  const [habits, setHabits] = useState(() => {
    try { return JSON.parse(localStorage.getItem('tarteeb_habits') || '[]'); }
    catch { return []; }
  });
  const [habitModal, setHabitModal] = useState({ open: false, mode: 'add', habit: null });
  const [habitForm, setHabitForm] = useState({ name: '' });

  // ---- Prayer Tracker ----
  const [prayerTracking, setPrayerTracking] = useState(() => {
    try { return JSON.parse(localStorage.getItem('tarteeb_prayer_tracking') || '{}'); }
    catch { return {}; }
  });
  useEffect(() => {
    localStorage.setItem('tarteeb_prayer_tracking', JSON.stringify(prayerTracking));
  }, [prayerTracking]);

  // ---- Sleep Tracker ----
  const [sleepTracking, setSleepTracking] = useState(() => {
    try { return JSON.parse(localStorage.getItem('tarteeb_sleep_tracking') || '{}'); }
    catch { return {}; }
  });
  useEffect(() => {
    localStorage.setItem('tarteeb_sleep_tracking', JSON.stringify(sleepTracking));
  }, [sleepTracking]);

  // Clean up old habit entries (>30 days) on mount to prevent localStorage bloat
  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem('tarteeb_habits') || '[]');
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - 30);
      const cutoffStr = formatDateLocal(cutoff);
      let changed = false;
      const cleaned = stored.map(h => {
        if (!h.entries) return h;
        const newEntries = {};
        Object.keys(h.entries).forEach(dateStr => {
          if (dateStr >= cutoffStr) {
            newEntries[dateStr] = h.entries[dateStr];
          } else {
            changed = true;
          }
        });
        return { ...h, entries: newEntries };
      });
      if (changed) {
        localStorage.setItem('tarteeb_habits', JSON.stringify(cleaned));
        setHabits(cleaned);
      }
    } catch {}
  }, []);

  const PRAYER_KEYS = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'];
  const PRAYER_STATUSES = ['pending', 'not_completed', 'completed'];

  const getPrayerStatus = (dateStr, prayerKey) => {
    return prayerTracking[dateStr]?.[prayerKey] || 'pending';
  };
  const cyclePrayerStatus = (dateStr, prayerKey) => {
    const current = prayerTracking[dateStr]?.[prayerKey] || 'pending';
    const idx = PRAYER_STATUSES.indexOf(current);
    const next = PRAYER_STATUSES[(idx + 1) % PRAYER_STATUSES.length];
    setPrayerTracking(prev => ({ ...prev, [dateStr]: { ...(prev[dateStr] || {}), [prayerKey]: next } }));
    // Sync back to tasks
    if (prayerKey.startsWith('adhkar_')) {
      syncAdhkarToTask(prayerKey, next);
    } else {
      syncPrayerToTask(prayerKey, next);
    }
  };

  // ---- Mood Tracker ----
  const MOODS = ['happy', 'grateful', 'peaceful', 'energetic', 'tired', 'stressed', 'anxious', 'sad'];
  const MOOD_EMOJIS = { happy: '😊', grateful: '🤲', peaceful: '🕊️', energetic: '⚡', tired: '😴', stressed: '😰', anxious: '😟', sad: '😢' };

  // ---- Fullscreen ----
  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  };

  // ---- Task search ----
  const [taskSearch, setTaskSearch] = useState('');

  // ---- Toast notifications ----
  const [toast, setToast] = useState(null);
  const showToast = (message, action = null) => {
    setToast({ message, action, key: Date.now() });
  };
  const dismissToast = () => {
    setToast(null);
  };

  // ---- Sleep hours calculator ----
  const calcSleepHours = (start, end) => {
    const [sh, sm] = start.split(':').map(Number);
    const [eh, em] = end.split(':').map(Number);
    const startMin = sh * 60 + sm;
    let endMin = eh * 60 + em;
    if (endMin <= startMin) endMin += 24 * 60;
    return Math.round(((endMin - startMin) / 60) * 10) / 10;
  };

  const todaySessions = sleepTracking[activeDate] || [];
  const todayTotalHours = todaySessions.reduce((sum, s) => sum + calcSleepHours(s.start, s.end), 0);

  const addSleepSession = () => {
    const newSession = { id: createTaskId(), start: '22:00', end: '06:00' };
    setSleepTracking(prev => ({
      ...prev,
      [activeDate]: [...(prev[activeDate] || []), newSession]
    }));
  };
  const updateSleepSession = (id, field, value) => {
    setSleepTracking(prev => ({
      ...prev,
      [activeDate]: (prev[activeDate] || []).map(s =>
        s.id === id ? { ...s, [field]: value } : s
      )
    }));
  };
  const deleteSleepSession = (id) => {
    setSleepTracking(prev => ({
      ...prev,
      [activeDate]: (prev[activeDate] || []).filter(s => s.id !== id)
    }));
  };

  // ---- Drinks Tracker ----
  const [drinksTracking, setDrinksTracking] = useState(() => {
    try { return JSON.parse(localStorage.getItem('tarteeb_drinks_tracking') || '{}'); }
    catch { return {}; }
  });
  useEffect(() => {
    localStorage.setItem('tarteeb_drinks_tracking', JSON.stringify(drinksTracking));
  }, [drinksTracking]);

  const todayDrinks = drinksTracking[activeDate] || [];

  const addDrink = () => {
    const newDrink = { id: createTaskId(), name: '', count: 1 };
    setDrinksTracking(prev => ({
      ...prev,
      [activeDate]: [...(prev[activeDate] || []), newDrink]
    }));
  };
  const updateDrink = (id, field, value) => {
    setDrinksTracking(prev => ({
      ...prev,
      [activeDate]: (prev[activeDate] || []).map(d =>
        d.id === id ? { ...d, [field]: value } : d
      )
    }));
  };
  const deleteDrink = (id) => {
    setDrinksTracking(prev => ({
      ...prev,
      [activeDate]: (prev[activeDate] || []).filter(d => d.id !== id)
    }));
  };

  // ---- Daily streak computation ----
  const computeStreak = () => {
    const today = formatDateLocal(new Date());
    let streak = 0;
    let d = new Date();
    while (true) {
      const key = `tarteeb_day_${formatDateLocal(d)}`;
      const saved = localStorage.getItem(key);
      if (!saved) break;
      try {
        const data = JSON.parse(saved);
        const tasks = data.tasks || [];
        const completed = tasks.filter(t => t.completed).length;
        if (completed === 0 && formatDateLocal(d) !== today) break;
        if (completed > 0) streak++;
      } catch { break; }
      d = addDays(d, -1);
    }
    return streak;
  };

  // ---- Previous day data for download ----
  const prevDate = formatDateLocal(addDays(new Date(), -1));
  const [prevDayData, setPrevDayData] = useState(() => {
    const saved = localStorage.getItem(`tarteeb_day_${prevDate}`);
    return saved ? JSON.parse(saved) : null;
  });

  // ---- Auto-cleanup old data (keep at least 2 days) ----
  useEffect(() => {
    const current = activeDate || formatDateLocal(new Date());
    const keepDates = [current, formatDateLocal(addDays(new Date(current), -1)), formatDateLocal(addDays(new Date(current), -2))];
    const keepKeys = new Set(keepDates.map(d => `tarteeb_day_${d}`));
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('tarteeb_day_') && /^\d{4}-\d{2}-\d{2}$/.test(key.slice('tarteeb_day_'.length)) && !keepKeys.has(key)) {
        localStorage.removeItem(key);
      }
    }
    const prevDate = formatDateLocal(addDays(new Date(current), -1));
    const saved = localStorage.getItem(`tarteeb_day_${prevDate}`);
    if (saved) {
      const parsed = JSON.parse(saved);
      setPrevDayData(prev => {
        if (JSON.stringify(prev) === JSON.stringify(parsed)) return prev;
        return parsed;
      });
    }
  }, [activeDate]);


  const dismissWelcome = () => {
    localStorage.setItem('tarteeb_welcome_dismissed', 'true');
    setShowWelcome(false);
  };

  const enableNotifications = async () => {
    if (typeof Notification === 'undefined') return;
    const result = await Notification.requestPermission();
    localStorage.setItem('tarteeb_notif_permission', result);
    setShowNotifPrompt(false);

    if (result === 'granted' && 'serviceWorker' in navigator) {
      try {
        const registration = await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: 'YOUR_PUBLIC_VAPID_KEY' // TODO: Replace with actual VAPID key
        });
        console.log('User subscribed:', subscription);
      } catch (e) {
        console.error('Subscription failed:', e);
      }
    }
  };

  const triggerNotification = useCallback(async (title, options = {}) => {
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;

    const notifOptions = {
      icon: NOTIF_ICON,
      badge: NOTIF_ICON,
      vibrate: [200, 100, 200],
      ...options
    };

    // Try service worker registration first (more reliable on mobile PWAs)
    if ('serviceWorker' in navigator) {
      try {
        const registration = await navigator.serviceWorker.ready;
        if (registration && registration.showNotification) {
          await registration.showNotification(title, notifOptions);
          return;
        }
      } catch (e) {
        console.error('ServiceWorker notification failed:', e);
      }
    }

    // Fallback to standard Notification (mostly for desktop)
    try {
      new Notification(title, notifOptions);
    } catch (e) {
      console.error('Standard notification failed:', e);
    }
  }, []);

  const dismissNotifPrompt = () => {
    localStorage.setItem('tarteeb_notif_prompt_dismissed', 'true');
    setShowNotifPrompt(false);
  };

  const dismissPrayerNotif = () => {
    lastActivePeriod.current = prayerNotif;
    setPrayerNotif(null);
  };

  // ---- Theme Sync ----
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('tarteeb_theme', theme);
  }, [theme]);

  // ---- Persist habits ----
  useEffect(() => {
    localStorage.setItem('tarteeb_habits', JSON.stringify(habits));
  }, [habits]);

  // ---- PWA Install ----
  const deferredPrompt = useRef(null);
  const [installable, setInstallable] = useState(false);

  useEffect(() => {
    const handler = (e) => {
      e.preventDefault();
      deferredPrompt.current = e;
      setInstallable(true);
    };
    window.addEventListener('beforeinstallprompt', handler);
    window.addEventListener('appinstalled', () => {
      setInstallable(false);
      deferredPrompt.current = null;
    });
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstall = async () => {
    const prompt = deferredPrompt.current;
    if (!prompt) return;
    prompt.prompt();
    const result = await prompt.userChoice;
    if (result.outcome === 'accepted') {
      setInstallable(false);
      deferredPrompt.current = null;
    }
  };

  // ---- Clock ticker (10s) ----
  useEffect(() => {
    const interval = setInterval(() => {
      const now = new Date();
      setCurrentTime(now);

      const logical = getLogicalPlannerDate(now);
      if (logical !== activeDate) setActiveDate(logical);
    }, 10000);
    return () => clearInterval(interval);
  }, [activeDate]);

  // ---- Notification Permission & Prompt ----
  useEffect(() => {
    if (typeof Notification === 'undefined') return;
    const stored = localStorage.getItem('tarteeb_notif_permission');
    if (stored === 'granted' || stored === 'denied') return;
    const perm = Notification.permission;
    if (perm === 'granted' || perm === 'denied') {
      localStorage.setItem('tarteeb_notif_permission', perm);
      return;
    }
    const dismissed = localStorage.getItem('tarteeb_notif_prompt_dismissed');
    if (!dismissed && !showWelcome) {
      setShowNotifPrompt(true);
    }
  }, [showWelcome]);

  // ---- Task Notifications ----
  useEffect(() => {
    if (typeof Notification === 'undefined') return;
    if (Notification.permission !== 'granted') return;
    if (!dayData?.tasks || !dayData?.prayerTimes) return;
    if (dayData.date !== activeDate) return;
    const prayers = dayData.prayerTimes;
    const nowMinutes = getCurrentPlannerMinutes(currentTime, activeDate);
    dayData.tasks.forEach(task => {
      const startMinutes = getTaskPlannerMinutes(task, prayers);
      const endMinutes = startMinutes + (Number(task.duration) || 15);
      const startKey = `${task.id}_start`;
      const endKey = `${task.id}_end`;
      if (!task.completed && Math.abs(nowMinutes - startMinutes) <= 1.5 && !notifiedTasks.current.has(startKey)) {
        notifiedTasks.current.add(startKey);
        triggerNotification(t('notif.taskStart'), { body: task.name, tag: `task-start-${task.id}` });
      }
      if (!task.completed && Math.abs(nowMinutes - endMinutes) <= 1.5 && !notifiedTasks.current.has(endKey)) {
        notifiedTasks.current.add(endKey);
        triggerNotification(t('notif.taskEnd'), { body: task.name, tag: `task-end-${task.id}` });
      }
    });
  }, [currentTime, dayData]);

   // ---- End-of-day reminder (30 min before day ends) ----
   useEffect(() => {
     if (typeof Notification === 'undefined') return;
     if (Notification.permission !== 'granted') return;
     if (!activeDate) return;
     const todayKey = activeDate;
     if (remindedEndOfDay.current === todayKey) return;
     const compiled = getCompiledPrayersForPlannerDate(activeDate);
     const dayEnd = getPlannerDayEndMinutes(compiled);
     const nowMin = getCurrentPlannerMinutes(currentTime, activeDate);
     if (nowMin >= dayEnd - 30) {
       remindedEndOfDay.current = todayKey;
       triggerNotification(t('notif.dayEnding'), { body: t('notif.dayEndingBody'), tag: `${activeDate}_day-ending`, renotify: true });
     }
   }, [currentTime, activeDate, triggerNotification, t]);

   // ---- New day notification ----
   useEffect(() => {
     if (typeof Notification === 'undefined') return;
     if (Notification.permission !== 'granted') return;
     if (prevActiveDateRef.current && prevActiveDateRef.current !== activeDate) {
       triggerNotification(t('notif.newDay'), { body: t('notif.newDayBody'), tag: `${activeDate}_new-day`, renotify: true });
     }
     prevActiveDateRef.current = activeDate;
   }, [activeDate, triggerNotification, t]);

   // ---- Prayer start/end notifications ----
   useEffect(() => {
     if (typeof Notification === 'undefined') return;
     if (Notification.permission !== 'granted') return;
     if (!activeDate) return;
     const compiled = getCompiledPrayersForPlannerDate(activeDate);
     const markers = getPrayerMarkersForPlannerDay(compiled);
     const nowMin = getCurrentPlannerMinutes(currentTime, activeDate);
     for (let i = 0; i < markers.length; i++) {
       const m = markers[i];
       const startMins = m.minutes;
       const endMins = i < markers.length - 1 ? markers[i + 1].minutes : startMins + (1440 / markers.length);
       const startKey = `${activeDate}_prayer_${m.key}_start`;
       const endKey = `${activeDate}_prayer_${m.key}_end`;
        if (Math.abs(nowMin - startMins) <= 1 && !notifiedPrayers.current.has(startKey)) {
          notifiedPrayers.current.add(startKey);
          
          // Persistent Timer Notification: 15 minutes countdown
          let countdown = 15;
          const timerInterval = setInterval(() => {
            countdown -= 1;
            if (countdown <= 0) {
              clearInterval(timerInterval);
              return;
            }
            // Use the same title/options structure for consistent service worker behavior
            triggerNotification(`${m.label}: ${countdown} mins remaining`, { 
              body: 'Prayer time countdown', 
              tag: startKey, 
              renotify: true,
              requireInteraction: true 
            });
          }, 60000); 

          triggerNotification(`${m.label}: 15 mins remaining`, { 
            body: 'Prayer time countdown', 
            tag: startKey, 
            renotify: true,
            requireInteraction: true 
          });
          
          if (typeof navigator.vibrate === 'function') navigator.vibrate([200, 100, 200]);
        }
       if (Math.abs(nowMin - endMins) <= 1 && !notifiedPrayers.current.has(endKey)) {
         notifiedPrayers.current.add(endKey);
         triggerNotification(t('notif.prayerEnd'), { body: m.label, tag: endKey, vibrate: [200, 100, 200] });
         if (typeof navigator.vibrate === 'function') navigator.vibrate([200, 100, 200]);
       }
     }
   }, [currentTime, activeDate, triggerNotification, t]);

  // ---- Scroll to top on page change ----
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [currentPage]);

  // ---- Keyboard Shortcuts ----
  useEffect(() => {
    function handleKeyDown(e) {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;
      if (taskModal.open || habitModal.open || dialog || showWelcome || showNotifPrompt || prayerNotif) {
        if (e.key === 'Escape') {
          if (taskModal.open) setTaskModal(prev => ({ ...prev, open: false }));
          else if (habitModal.open) setHabitModal(prev => ({ ...prev, open: false }));
          else if (dialog && dialog.type === 'alert') closeDialog();
          else if (showWelcome) dismissWelcome();
          else if (showNotifPrompt) dismissNotifPrompt();
          else if (prayerNotif) dismissPrayerNotif();
        }
        return;
      }
      if (e.key === 'h') { setCurrentPage('home'); window.scrollTo(0, 0); }
      else if (e.key === 't') { setCurrentPage('tasks'); window.scrollTo(0, 0); }
      else if (e.key === 'j') { setCurrentPage('journal'); window.scrollTo(0, 0); }
      else if (e.key === 'g') { setCurrentPage('guide'); window.scrollTo(0, 0); }
      else if (e.key === 's') { setCurrentPage('settings'); window.scrollTo(0, 0); }
      else if (e.key === 'b') { setCurrentPage('habits'); window.scrollTo(0, 0); }
      else if (e.key === 'l') { setCurrentPage('sleep'); window.scrollTo(0, 0); }
      else if (e.key === 'd') { setCurrentPage('drinks'); window.scrollTo(0, 0); }
      else if (e.key === 'p') { setCurrentPage('prayers'); window.scrollTo(0, 0); }
      else if (e.key === 'n' && (currentPage === 'home' || currentPage === 'tasks') && dayData) {
        openTaskModal('add');
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  });

  // ---- Load / Init day data ----
  useEffect(() => {
    let active = true;
    async function init() {
      setLoading(true);
      setApiError(null);
      try {
        await ensurePrayerTimesCached(activeDate, locationConfig);
      } catch (e) {
        addError(e.message || 'Prayer time fetch failed', 'prayerTimes');
      }

      if (!active) return;

      const compiled = getCompiledPrayersForPlannerDate(activeDate);
      const storageKey = `tarteeb_day_${activeDate}`;
      const saved = localStorage.getItem(storageKey);

      if (saved) {
        const parsed = JSON.parse(saved);
        parsed.prayerTimes = {
          fajr: compiled.fajr,
          dhuhr: compiled.dhuhr,
          asr: compiled.asr,
          maghrib: compiled.maghrib,
          isha: compiled.isha
        };
        parsed.hijriDate = compiled.hijriDate;
        parsed.tasks = normalizeTasksForPrayerBlocks(parsed.tasks || [], parsed.prayerTimes);
        parsed.stats = calculateStats(parsed.tasks);
        localStorage.setItem(storageKey, JSON.stringify(parsed));
        setDayData(parsed);
      } else {
        // create new day (copy recurring tasks from previous day)
        const prevDate = formatDateLocal(addDays(new Date(activeDate), -1));
        const prevSaved = localStorage.getItem(`tarteeb_day_${prevDate}`);
        const recurring = prevSaved ? JSON.parse(prevSaved).tasks.filter(t => t.isRecurring).map(t => ({
          id: Math.random().toString(36).substr(2, 9),
          name: t.name,
          details: t.details || '',
          duration: Number(t.duration) || 15,
          period: t.period,
          type: 'user',
          isRecurring: true,
          completed: false
        })) : [];

        const fixed = FIXED_TASKS_TEMPLATES.map(t => ({
          id: Math.random().toString(36).substr(2, 9),
          name: t.name,
          details: '',
          duration: t.duration,
          period: t.period,
          type: 'fixed',
          isRecurring: false,
          completed: false
        }));

        const initialTasks = normalizeTasksForPrayerBlocks([...fixed, ...recurring], {
          fajr: compiled.fajr,
          dhuhr: compiled.dhuhr,
          asr: compiled.asr,
          maghrib: compiled.maghrib,
          isha: compiled.isha
        });

        const newDay = {
          date: activeDate,
          hijriDate: compiled.hijriDate,
          prayerTimes: {
            fajr: compiled.fajr,
            dhuhr: compiled.dhuhr,
            asr: compiled.asr,
            maghrib: compiled.maghrib,
            isha: compiled.isha
          },
          tasks: initialTasks,
          diary: '',
          studyNotes: [],
          mood: '',
          stats: calculateStats(initialTasks)
        };
        localStorage.setItem(storageKey, JSON.stringify(newDay));
        setDayData(newDay);
      }
      setLoading(false);
    }
    init();
    return () => { active = false; };
  }, [activeDate, locationConfig]);

  // ---- Timeline status (next prayer etc.) ----
  useEffect(() => {
    if (dayData?.prayerTimes) {
      const status = calculateTimelineStatus(currentTime, dayData.prayerTimes, activeDate);
      setTimelineStatus(status);

      if (status.activePeriod !== 'none' && status.activePeriod !== lastActivePeriod.current && lastActivePeriod.current !== null && !prayerNotif) {
        setPrayerNotif(status.activePeriod);
        if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
          const periodKey = status.activePeriod;
          const periodPrayer = { morning: 'Fajr', afternoon: 'Dhuhr', late_afternoon: 'Asr', evening: 'Maghrib', night: 'Isha' }[periodKey];
          if (periodPrayer) {
            new Notification(t('notif.prayerStart'), { body: periodPrayer, icon: NOTIF_ICON, tag: `${activeDate}_period-${periodKey}` });
            if (typeof navigator.vibrate === 'function') navigator.vibrate([200, 100, 200]);
          }
        }
      }
      if (!prayerNotif) {
        lastActivePeriod.current = status.activePeriod;
      }
    }
  }, [currentTime, dayData, activeDate, prayerNotif]);

  // ---- Auto-scroll to current time line (once) ----
  const hasScrolledRef = useRef(false);
  const notifiedTasks = useRef(new Set());
  const remindedEndOfDay = useRef(null);
  const prevActiveDateRef = useRef(activeDate);
  const notifiedPrayers = useRef(new Set());
  useEffect(() => {
    if (currentPage !== 'home' || !dayData || hasScrolledRef.current) return;
    hasScrolledRef.current = true;
    requestAnimationFrame(() => {
      const container = document.querySelector('.content-area');
      const el = document.querySelector('.timeline-now-line');
      if (el && container) {
        const containerRect = container.getBoundingClientRect();
        const elRect = el.getBoundingClientRect();
        container.scrollTo({ top: elRect.top - containerRect.top + container.scrollTop - containerRect.height / 2, behavior: 'smooth' });
      }
    });
  }, [currentPage, dayData]);

  // ---- Auto-scroll to current period on Tasks page ----
  const tasksPageRef = useRef(null);
  useEffect(() => {
    if (currentPage !== 'tasks' || !dayData || !timelineStatus) return;
    const activePeriod = timelineStatus.activePeriod;
    if (!activePeriod || activePeriod === 'none') return;
    requestAnimationFrame(() => {
      const container = document.querySelector('.content-area');
      const el = document.querySelector(`.tasks-block[data-period="${activePeriod}"]`);
      if (el && container) {
        const containerRect = container.getBoundingClientRect();
        const elRect = el.getBoundingClientRect();
        container.scrollTop = elRect.top - containerRect.top + container.scrollTop - containerRect.height / 3;
      }
    });
  }, [currentPage, dayData, timelineStatus]);

  // ---- Forms sync ----
  useEffect(() => {
    const cached = getPrayerTimesForDate(activeDate);
    setManualTimesForm({
      fajr: cached.fajr || '04:30',
      dhuhr: cached.dhuhr || '12:30',
      asr: cached.asr || '15:45',
      maghrib: cached.maghrib || '19:00',
      isha: cached.isha || '20:30'
    });
    setSettingsForm({ ...locationConfig });
  }, [activeDate, locationConfig]);

  // ---- Sync diary draft when viewing journal ----
  useEffect(() => {
    if (currentPage === 'journal' && dayData) {
      setDiaryDraft(dayData.diary || '');
      setDiarySaved(true);
      setStudyText('');
      const active = timelineStatus?.activePeriod;
      if (active && active !== 'none') {
        setStudyPeriod(active);
      }
    }
  }, [currentPage, dayData]);

  const updateDayData = (updated) => {
    updated.stats = calculateStats(updated.tasks);
    localStorage.setItem(`tarteeb_day_${updated.date}`, JSON.stringify(updated));
    setDayData(updated);
  };

  const toggleTaskCompletion = (id) => {
    const task = dayDataRef.current?.tasks.find(t => t.id === id);
    if (!task) return;

    const wasCompleted = task.completed;
    const newCompleted = !wasCompleted;
    const newStatus = newCompleted ? 'completed' : 'pending';

    if (!wasCompleted) {
      confetti({
        particleCount: 120,
        spread: 80,
        origin: { x: 0.5, y: 0.5 },
        colors: ['#059669', '#0d9488', '#d97706', '#f59e0b', '#10b981']
      });
    }

    setDayData(prev => {
      if (!prev) return prev;
      const updTasks = prev.tasks.map(t => t.id === id ? { ...t, completed: newCompleted, status: newStatus } : t);
      const updated = { ...prev, tasks: updTasks };
      updated.stats = calculateStats(updated.tasks);
      localStorage.setItem(`tarteeb_day_${updated.date}`, JSON.stringify(updated));
      showToast(
        !wasCompleted ? t('toast.taskCompleted') : t('toast.taskUncompleted'),
        { label: t('toast.undo'), action: () => toggleTaskCompletion(id) }
      );
      return updated;
    });

    syncTaskToPrayerTracking(task.name, newStatus);
  };

  const setTaskStatus = (id, newStatus) => {
    const task = dayData?.tasks.find(t => t.id === id);
    if (!task) return;

    if (newStatus === 'completed' && task.status !== 'completed' && !task.completed) {
      confetti({
        particleCount: 120,
        spread: 80,
        origin: { x: 0.5, y: 0.5 },
        colors: ['#059669', '#0d9488', '#d97706', '#f59e0b', '#10b981']
      });
    }

    setDayData(prev => {
      if (!prev) return prev;
      const updTasks = prev.tasks.map(t => 
        t.id === id ? { ...t, status: newStatus, completed: newStatus === 'completed' } : t
      );
      const updated = { ...prev, tasks: updTasks };
      updated.stats = calculateStats(updated.tasks);
      localStorage.setItem(`tarteeb_day_${updated.date}`, JSON.stringify(updated));
      return updated;
    });

    syncTaskToPrayerTracking(task.name, newStatus);
  };

  const triggerConfetti = () => {
    confetti({
      particleCount: 80,
      spread: 70,
      origin: { x: 0.5, y: 0.5 },
      colors: ['#059669', '#0d9488', '#d97706', '#f59e0b', '#10b981']
    });
  };

  const syncTaskToPrayerTracking = (taskName, newStatus, dateStr) => {
    const targetDate = dateStr || activeDate;
    const prayerKey = FIXED_TASK_PRAYER_KEY[taskName];
    if (prayerKey) {
      setPrayerTracking(prev => ({ ...prev, [targetDate]: { ...(prev[targetDate] || {}), [prayerKey]: newStatus } }));
      return;
    }
    const adhkarKey = TASK_TO_ADHKAR_KEY[taskName];
    if (adhkarKey) {
      setPrayerTracking(prev => ({ ...prev, [targetDate]: { ...(prev[targetDate] || {}), [adhkarKey]: newStatus } }));
    }
  };

  const syncPrayerToTask = (prayerKey, status) => {
    const taskName = PRAYER_TO_TASK_NAME[prayerKey];
    if (!taskName || !dayData) return;
    setDayData(prev => {
      const updTasks = prev.tasks.map(t =>
        t.name === taskName ? { ...t, completed: status === 'completed', status } : t
      );
      return { ...prev, tasks: updTasks };
    });
  };

  const syncAdhkarToTask = (adhkarKey, status) => {
    const taskName = ADHKAR_KEY_TO_TASK[adhkarKey];
    if (!taskName || !dayData) return;
    setDayData(prev => {
      const updTasks = prev.tasks.map(t =>
        t.name === taskName ? { ...t, completed: status === 'completed', status } : t
      );
      return { ...prev, tasks: updTasks };
    });
  };

  const getDefaultPeriod = () => {
    const active = timelineStatus?.activePeriod;
    return active && active !== 'none' ? active : 'evening';
  };

  const openTaskModal = (mode, task = null, periodOverride = null) => {
    const prayers = dayData?.prayerTimes;
    if (mode === 'edit' && task?.type === 'fixed') return;
    if (mode === 'add' && prayers) {
      const period = periodOverride || getDefaultPeriod();
      const nowMin = getCurrentPlannerMinutes(currentTime, activeDate);
      const startTime = getFirstAvailableTimeForPeriod(period, dayData.tasks, prayers, 15, null, nowMin);
      const startMin = scheduledTimeToPlannerMinutes(startTime, period, prayers);
      const endSlots = getAvailableEndSlots(period, dayData.tasks, prayers, startMin);
      const endTime = endSlots.length > 0 ? formatMinutesToTime(endSlots[0]) : formatMinutesToTime(startMin + 15);
      const duration = endSlots.length > 0 ? endSlots[0] - startMin : 15;
      setTaskForm({
        name: '', details: '', duration, period,
        scheduledTime: startTime, endTime, isRecurring: false
      });
      setTaskModal({ open: true, mode: 'add', task: null });
    } else if (task && prayers) {
      const taskEnd = getTaskStartMinutes(task, prayers) + (Number(task.duration) || 15);
      setTaskForm({
        name: task.name,
        details: task.details || '',
        duration: task.duration,
        period: task.period,
        scheduledTime: getTaskDisplayTime(task, prayers),
        endTime: formatMinutesToTime(taskEnd),
        isRecurring: task.isRecurring || false
      });
      setTaskModal({ open: true, mode: 'edit', task });
    }
  };

  const handleTaskSubmit = (e) => {
    e.preventDefault();
    if (!taskForm.name.trim()) return;
    if (taskModal.mode === 'edit' && taskModal.task?.type === 'fixed') return;

    const prayers = dayData.prayerTimes;
    const startMin = scheduledTimeToPlannerMinutes(taskForm.scheduledTime, taskForm.period, prayers);
    const endMin = scheduledTimeToPlannerMinutes(taskForm.endTime, taskForm.period, prayers);
    const duration = endMin - startMin;

    const formWithDuration = { ...taskForm, duration };
    const validationError = validateTaskForm(formWithDuration, dayData.tasks, taskModal.task?.id);
    if (validationError) {
      showAlert(validationError);
      return;
    }

    let newTasks;
    if (taskModal.mode === 'add') {
      const newTask = {
        id: createTaskId(),
        name: taskForm.name,
        details: taskForm.details,
        duration,
        period: taskForm.period,
        scheduledTime: taskForm.scheduledTime,
        type: taskForm.isRecurring ? 'user' : 'personal',
        isRecurring: taskForm.isRecurring,
        completed: false
      };
      newTasks = [...dayData.tasks, newTask];
    } else {
      newTasks = dayData.tasks.map(t => t.id === taskModal.task.id ? {
        ...t,
        name: taskForm.name,
        details: taskForm.details,
        duration,
        period: taskForm.period,
        scheduledTime: taskForm.scheduledTime,
        isRecurring: taskForm.isRecurring,
        type: taskForm.isRecurring ? 'user' : (t.type === 'fixed' ? 'fixed' : 'personal')
      } : t);
    }
    updateDayData({ ...dayData, tasks: newTasks });
    setTaskModal({ open: false, mode: 'add', task: null });
  };

  const deleteTask = async (id) => {
    const task = dayData?.tasks.find(t => t.id === id);
    if (task?.type === 'fixed') return;
    const confirmed = await showConfirm(t('confirm.deleteTask'));
    if (confirmed) {
      const newTasks = dayData.tasks.filter(t => t.id !== id);
      updateDayData({ ...dayData, tasks: newTasks });
    }
  };

  const moveTask = (id, direction) => {
    if (!dayData) return;
    const tasks = [...dayData.tasks];
    const idx = tasks.findIndex(t => t.id === id);
    if (idx === -1) return;
    const task = tasks[idx];
    const periodTasks = tasks.filter(t => t.period === task.period);
    const periodIndices = periodTasks.map(t => tasks.indexOf(t));
    const localIdx = periodIndices.findIndex(i => i === idx);
    if ((direction === -1 && localIdx === 0) || (direction === 1 && localIdx === periodIndices.length - 1)) return;
    const swapIdx = periodIndices[localIdx + direction];
    [tasks[idx], tasks[swapIdx]] = [tasks[swapIdx], tasks[idx]];
    updateDayData({ ...dayData, tasks });
  };

  const completeAllInPeriod = (period) => {
    if (!dayData) return;
    const newTasks = dayData.tasks.map(t => t.period === period && t.type !== 'fixed' ? { ...t, completed: true } : t);
    updateDayData({ ...dayData, tasks: newTasks });
  };

  const resetAllInPeriod = (period) => {
    if (!dayData) return;
    const newTasks = dayData.tasks.map(t => t.period === period && t.type !== 'fixed' ? { ...t, completed: false } : t);
    updateDayData({ ...dayData, tasks: newTasks });
  };

  // ---- Habit Functions ----
  const getTodayStr = () => formatDateLocal(new Date());

  const toggleHabit = (id) => {
    const today = getTodayStr();
    setHabits(prev => prev.map(h => {
      if (h.id !== id) return h;
      const entries = { ...(h.entries || {}) };
      const current = entries[today];
      const wasDone = current?.completed || false;
      if (!wasDone) {
        confetti({
          particleCount: 80,
          spread: 70,
          origin: { x: 0.5, y: 0.5 },
          colors: ['#059669', '#0d9488', '#d97706', '#f59e0b', '#10b981']
        });
      }
      entries[today] = { completed: !wasDone, notes: current?.notes || '' };
      return { ...h, entries };
    }));
  };

  const addHabit = (name) => {
    const habit = {
      id: createTaskId(),
      name: name.trim(),
      createdAt: getTodayStr(),
      entries: {}
    };
    setHabits(prev => [...prev, habit]);
  };

  // ---- Study Functions ----
  const addStudyNote = () => {
    const text = studyText.trim();
    if (!text || !dayData) return;
    const note = {
      id: createTaskId(),
      text,
      period: studyPeriod,
      createdAt: new Date().toISOString(),
      time: formatMinutesToTime(getCurrentPlannerMinutes(currentTime, activeDate)),
      locked: false
    };
    const updatedNotes = [...(dayData.studyNotes || []), note];
    updateDayData({ ...dayData, studyNotes: updatedNotes });
    setStudyText('');
    setStudyPeriod(timelineStatus?.activePeriod || 'morning');
  };

  const deleteStudyNote = async (noteId) => {
    if (!dayData) return;
    const note = (dayData.studyNotes || []).find(n => n.id === noteId);
    if (note?.locked) return;
    const confirmed = await showConfirm(t('journal.deleteConfirm'));
    if (!confirmed) return;
    const updatedNotes = (dayData.studyNotes || []).filter(n => n.id !== noteId);
    updateDayData({ ...dayData, studyNotes: updatedNotes });
  };

  const toggleLockNote = (noteId) => {
    if (!dayData) return;
    const updatedNotes = (dayData.studyNotes || []).map(n =>
      n.id === noteId ? { ...n, locked: !n.locked } : n
    );
    updateDayData({ ...dayData, studyNotes: updatedNotes });
  };

  const startEditNote = (noteId) => {
    const note = (dayData?.studyNotes || []).find(n => n.id === noteId);
    if (!note) return;
    setEditingNoteId(noteId);
    setEditText(note.text);
  };

  const saveEditNote = () => {
    const text = editText.trim();
    if (!text || !dayData || !editingNoteId) return;
    const updatedNotes = (dayData.studyNotes || []).map(n =>
      n.id === editingNoteId
        ? { ...n, text, previousText: n.text, editedAt: new Date().toISOString() }
        : n
    );
    updateDayData({ ...dayData, studyNotes: updatedNotes });
    setEditingNoteId(null);
    setEditText('');
  };

  const cancelEditNote = () => {
    setEditingNoteId(null);
    setEditText('');
  };

  const getNotesForPeriod = (period) => {
    return (dayData?.studyNotes || []).filter(n => n.period === period);
  };

  const deleteHabit = async (id) => {
    const confirmed = await showConfirm(t('habits.deleteConfirm'));
    if (confirmed) setHabits(prev => prev.filter(h => h.id !== id));
  };

  const moveHabit = (index, direction) => {
    const target = index + direction;
    if (target < 0 || target >= habits.length) return;
    setHabits(prev => {
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const exportHabitsMarkdown = () => {
    if (!habits.length) return;
    let md = `# ${t('habits.title')}\n\n`;
    habits.forEach(h => {
      md += `## ${h.name}\n`;
      const dates = Object.keys(h.entries || {}).sort();
      if (dates.length) {
        md += `| ${t('export.date')} | ${t('habits.today')} | ${t('habits.notes')} |\n`;
        md += `|---|---|---|\n`;
        for (const d of dates) {
          const e = h.entries[d];
          md += `| ${d} | ${e.completed ? '✓' : '✗'} | ${e.notes || ''} |\n`;
        }
        md += '\n';
      }
    });
    return md;
  };

  const exportStudyNotesMarkdown = () => {
    const notes = dayData?.studyNotes;
    if (!notes || notes.length === 0) return '';
    const lines = [];
    lines.push('');
    lines.push(`## ${t('journal.studyNotes')}`);
    lines.push('');
    getPlannerPeriodOrder().forEach(periodKey => {
      const periodNotes = notes.filter(n => n.period === periodKey).sort((a, b) => (a.time || '').localeCompare(b.time || ''));
      if (periodNotes.length === 0) return;
      const periodLabel = `${t('period.' + periodKey)} — ${t('period.' + periodKey + 'Range')}`;
      lines.push(`### ${periodLabel}`);
      lines.push('');
      periodNotes.forEach(n => {
        const timeLabel = n.time ? `\`${n.time}\` ` : '';
        lines.push(`- ${timeLabel}${n.text}`);
      });
      lines.push('');
    });
    return lines.join('\n');
  };

  const exportToMarkdown = (data = null) => {
    const day = data || dayData;
    if (!day) return;
    const { tasks, diary, date, hijriDate, prayerTimes, studyNotes, mood } = day;
    const lines = [];
    const d = new Date(date);
    const locale = lang === 'ar' ? 'ar-SA' : 'en-US';
    const title = d.toLocaleDateString(locale, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

    // Gather stats
    const allTasks = tasks || [];
    const total = allTasks.length;
    const completedTasksList = allTasks.filter(t => t.status === 'completed' || t.completed);
    const notCompletedTasksList = allTasks.filter(t => t.status === 'not_completed');
    const pendingTasksList = allTasks.filter(t => !t.status || t.status === 'pending' || (!t.completed && t.status !== 'not_completed'));

    const completed = completedTasksList.length;
    const notCompleted = notCompletedTasksList.length;
    const pending = pendingTasksList.length;
    const overallPct = total > 0 ? Math.round((completed / total) * 100) : 0;

    const fixed = allTasks.filter(t => t.type === 'fixed');
    const fixedDone = fixed.filter(t => t.status === 'completed' || t.completed).length;
    const fixedPct = fixed.length > 0 ? Math.round((fixedDone / fixed.length) * 100) : 100;
    const personal = allTasks.filter(t => t.type !== 'fixed');
    const personalDone = personal.filter(t => t.status === 'completed' || t.completed).length;
    const personalPct = personal.length > 0 ? Math.round((personalDone / personal.length) * 100) : 100;

    const todayTrack = prayerTracking[date] || {};
    const prayerCounts = { completed: 0, not_completed: 0, pending: 0 };
    PRAYER_KEYS.forEach(pk => { const s = todayTrack[pk] || 'pending'; prayerCounts[s]++; });
    const onTime = prayerCounts.completed;

    const allHabitsThisDate = habits.filter(h => h.entries?.[date] !== undefined);
    const completedHabits = allHabitsThisDate.filter(h => h.entries?.[date]?.completed).length;
    const totalHabitsToday = allHabitsThisDate.length;
    const habitsPct = totalHabitsToday > 0 ? Math.round((completedHabits / totalHabitsToday) * 100) : 0;

    const notes = studyNotes || [];
    const streak = computeStreak();

    // Sleep & drinks
    const dateSessions = sleepTracking[date] || [];
    const totalSleepHours = dateSessions.reduce((sum, s) => sum + calcSleepHours(s.start, s.end), 0);
    const sleepScore = Math.min(Math.round((totalSleepHours / 8) * 100), 100);

    const dateDrinks = drinksTracking[date] || [];
    const totalDrinksCount = dateDrinks.reduce((sum, d) => sum + d.count, 0);

    const prayerPct = Math.round((onTime / 5) * 100);
    const streakScore = Math.min(streak * 10, 100);
    const compositeScore = Math.round(
      (overallPct * 0.25) + (habitsPct * 0.20) + (prayerPct * 0.30) + (sleepScore * 0.15) + (streakScore * 0.10)
    );
    const scoreLabel = compositeScore >= 85 ? t('pulse.scoreExcellent')
      : compositeScore >= 65 ? t('pulse.scoreGood')
      : compositeScore >= 45 ? t('pulse.scoreFair')
      : t('pulse.scoreNeedsWork');

    const prayerOrder = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'];

    const formatDur = (mins) => {
      if (!mins || mins <= 0) return '';
      const h = Math.floor(mins / 60);
      const m = mins % 60;
      return h > 0 ? `${h}h${m > 0 ? m + 'm' : ''}` : `${m}m`;
    };

    const statusLabel = (s) => t(s === 'pending' ? 'tasks.statusPending' : (s === 'completed' ? 'tasks.statusCompleted' : 'tasks.statusNotCompleted'));

    // ---- Build ----
    lines.push(`# ${title}`);
    lines.push('');
    if (hijriDate) lines.push(`> ${hijriDate}`);
    lines.push('');
    lines.push('---');
    lines.push('');

    // Daily Overview
    lines.push('## ' + t('export.dailyOverview'));
    lines.push('');
    lines.push('**' + t('export.dayAtGlance') + '**');
    lines.push('');
    lines.push(`- **${t('export.tasks')}**: ${completed}/${total} (${overallPct}%) — ${completed} ${t('tasks.statusCompleted')}, ${notCompleted} ${t('tasks.statusNotCompleted')}, ${pending} ${t('tasks.statusPending')}`);
    lines.push(`- **${t('export.fixedTasks')}**: ${fixedPct}% | **${t('export.personalTasks')}**: ${personalPct}%`);
    lines.push(`- **${t('export.prayersOnTime')}**: ${onTime}/5 (${prayerPct}%)`);
    if (totalHabitsToday > 0) lines.push(`- **${t('habits.title')}**: ${completedHabits}/${totalHabitsToday} (${habitsPct}%)`);
    if (dateSessions.length > 0) lines.push(`- **${t('sleep.title')}**: ${totalSleepHours} ${t('sleep.hours')}`);
    if (dateDrinks.length > 0) lines.push(`- **${t('drinks.title')}**: ${totalDrinksCount}×`);
    lines.push(`- **${t('pulse.productivityScore')}**: ${compositeScore}/100 (${scoreLabel})`);
    lines.push(`- **${t('export.streak')}**: ${streak} ${t('streak.days')}`);
    if (mood) {
      lines.push(`- **${t('mood.title')}**: ${t('mood.' + mood)}`);
    }
    lines.push('');

    // Settings / App Info
    lines.push('---');
    lines.push('');
    lines.push('## ' + (lang === 'ar' ? 'التطبيق والإعدادات' : 'App & Settings'));
    lines.push('');
    lines.push('- **' + (lang === 'ar' ? 'التطبيق' : 'App') + '**: Tarteeb Muslim Daily Planner');
    lines.push('- **' + (lang === 'ar' ? 'التاريخ' : 'Date') + '**: ' + title);
    if (hijriDate) lines.push('- **' + (lang === 'ar' ? 'التاريخ الهجري' : 'Hijri Date') + '**: ' + hijriDate);
    lines.push('- **' + (lang === 'ar' ? 'اللغة' : 'Language') + '**: ' + (lang === 'ar' ? 'العربية' : 'English'));
    lines.push('- **' + (lang === 'ar' ? 'السمة' : 'Theme') + '**: ' + (theme === 'dark' ? (lang === 'ar' ? 'داكن' : 'Dark') : (lang === 'ar' ? 'فاتح' : 'Light')));
    lines.push('- **' + (lang === 'ar' ? 'صيغة الوقت' : 'Time Format') + '**: ' + (getUse12h() ? '12h' : '24h'));
    if (locationConfig.city && locationConfig.country) {
      lines.push('- **' + (lang === 'ar' ? 'الموقع' : 'Location') + '**: ' + locationConfig.city + ', ' + locationConfig.country);
    } else if (locationConfig.latitude && locationConfig.longitude) {
      lines.push('- **' + (lang === 'ar' ? 'الإحداثيات' : 'Coordinates') + '**: ' + locationConfig.latitude + ', ' + locationConfig.longitude);
    }
    lines.push('');

    // Prayer Times
    lines.push('---');
    lines.push('');
    lines.push('## ' + t('export.prayerTimes'));
    lines.push('');
    prayerOrder.forEach(pk => {
      const time = prayerTimes?.[pk] || '—';
      const status = todayTrack[pk] || 'pending';
      const label = statusLabel(status);
      const prayerLabel = t('prayer.' + pk);
      lines.push(`- **${prayerLabel}**: ${time} — ${label}`);
    });
    lines.push('');

    // Adhkar
    lines.push('---');
    lines.push('');
    lines.push('## ' + t('adhkar.title'));
    lines.push('');
    const adhkarM = todayTrack['adhkar_morning'] || 'pending';
    const adhkarE = todayTrack['adhkar_evening'] || 'pending';
    lines.push(`- **${t('adhkar.morning')}**: ${statusLabel(adhkarM)}`);
    lines.push(`- **${t('adhkar.evening')}**: ${statusLabel(adhkarE)}`);
    lines.push('');

    // Tasks
    lines.push('---');
    lines.push('');
    lines.push('## ' + t('export.tasks'));
    lines.push('');

    if (completedTasksList.length > 0) {
      lines.push('### ' + t('tasks.statusCompleted') + ' (' + completed + ')');
      lines.push('');
      completedTasksList.forEach(task => {
        const time = getTaskDisplayTime(task, prayerTimes);
        const end = task.type === 'personal' || task.type === 'user'
          ? ` – ${formatMinutesToTime(getTaskStartMinutes(task, prayerTimes) + (Number(task.duration) || 15))}`
          : '';
        const periodTag = task.period ? ` \`[${t('period.' + task.period)}]\`` : '';
        const durationTag = task.duration ? ` _(${formatDur(Number(task.duration))})_` : '';
        const recurringTag = task.isRecurring ? ' _(Recurring)_' : '';
        lines.push(`- [x] **${translateTaskName(task.name)}** — ${time}${end}${periodTag}${durationTag}${recurringTag}`);
        if (task.details) lines.push(`  - ${task.details}`);
      });
      lines.push('');
    }

    if (notCompletedTasksList.length > 0) {
      lines.push('### ' + t('tasks.statusNotCompleted') + ' (' + notCompleted + ')');
      lines.push('');
      notCompletedTasksList.forEach(task => {
        const time = getTaskDisplayTime(task, prayerTimes);
        const end = task.type === 'personal' || task.type === 'user'
          ? ` – ${formatMinutesToTime(getTaskStartMinutes(task, prayerTimes) + (Number(task.duration) || 15))}`
          : '';
        const periodTag = task.period ? ` \`[${t('period.' + task.period)}]\`` : '';
        const durationTag = task.duration ? ` _(${formatDur(Number(task.duration))})_` : '';
        const recurringTag = task.isRecurring ? ' _(Recurring)_' : '';
        lines.push(`- ~~**${translateTaskName(task.name)}**~~ — ${time}${end}${periodTag}${durationTag}${recurringTag}`);
        if (task.details) lines.push(`  - ${task.details}`);
      });
      lines.push('');
    }

    if (pendingTasksList.length > 0) {
      lines.push('### ' + t('tasks.statusPending') + ' (' + pending + ')');
      lines.push('');
      pendingTasksList.forEach(task => {
        const time = getTaskDisplayTime(task, prayerTimes);
        const end = task.type === 'personal' || task.type === 'user'
          ? ` – ${formatMinutesToTime(getTaskStartMinutes(task, prayerTimes) + (Number(task.duration) || 15))}`
          : '';
        const periodTag = task.period ? ` \`[${t('period.' + task.period)}]\`` : '';
        const durationTag = task.duration ? ` _(${formatDur(Number(task.duration))})_` : '';
        const recurringTag = task.isRecurring ? ' _(Recurring)_' : '';
        lines.push(`- [ ] **${translateTaskName(task.name)}** — ${time}${end}${periodTag}${durationTag}${recurringTag}`);
        if (task.details) lines.push(`  - ${task.details}`);
      });
      lines.push('');
    }

    // Task breakdown by period
    if (total > 0) {
      const periodStats = getPlannerPeriodOrder().map(pk => {
        const pt = allTasks.filter(t => t.period === pk);
        if (pt.length === 0) return null;
        const d = pt.filter(t => t.status === 'completed' || t.completed).length;
        return { pk, name: t('period.' + pk), range: (PERIODS_META[pk]?.range || ''), done: d, total: pt.length, pct: Math.round((d / pt.length) * 100) };
      }).filter(Boolean);

      if (periodStats.length > 0) {
        lines.push('### ' + t('export.taskBreakdown'));
        lines.push('');
        periodStats.forEach(ps => {
          const bar = '█'.repeat(Math.round(ps.pct / 10)) + '░'.repeat(10 - Math.round(ps.pct / 10));
          lines.push(`- **${ps.name}** ${ps.range ? '(' + ps.range + ')' : ''}: ${ps.done}/${ps.total} — ${bar} ${ps.pct}%`);
        });
        lines.push('');
      }
    }

    // Study Notes
    if (notes.length > 0) {
      lines.push('---');
      lines.push('');
      lines.push('## ' + t('journal.studyNotes'));
      lines.push('');
      getPlannerPeriodOrder().forEach(pk => {
        const pn = notes.filter(n => n.period === pk).sort((a, b) => (a.time || '').localeCompare(b.time || ''));
        if (pn.length === 0) return;
        const meta = PERIODS_META[pk];
        lines.push('### ' + t('period.' + pk) + ' — ' + (meta?.range || ''));
        lines.push('');
        pn.forEach(n => {
          const tl = n.time ? '`' + n.time + '` ' : '';
          lines.push('- ' + tl + n.text);
        });
        lines.push('');
      });
    }

    // Habits
    if (allHabitsThisDate.length > 0) {
      lines.push('---');
      lines.push('');
      lines.push('## ' + t('habits.title'));
      lines.push('');
      lines.push('**' + t('export.todaysHabits') + '**');
      lines.push('');
      allHabitsThisDate.forEach(h => {
        const done = h.entries?.[date]?.completed;
        lines.push('- **' + (done ? '' : '~~') + h.name + (done ? '' : '~~') + '**' + (done ? ' — ' + t('tasks.statusCompleted') : ' — ' + t('tasks.statusNotCompleted')));
      });
      lines.push('');
      lines.push('_' + completedHabits + '/' + totalHabitsToday + ' ' + t('export.habitsDone') + '_');
      lines.push('');
    }

    // All habits (including ones not tracked today)
    const untrackedHabits = habits.filter(h => !h.entries?.[date]);
    if (untrackedHabits.length > 0) {
      lines.push('**' + (lang === 'ar' ? 'عادات لم تسجل اليوم' : 'Habits Not Logged Today') + ' (' + untrackedHabits.length + ')**');
      lines.push('');
      untrackedHabits.forEach(h => {
        lines.push('- **' + h.name + '** — ' + (lang === 'ar' ? 'لم تسجل' : 'Not logged'));
      });
      lines.push('');
    }

    // Sleep Data
    if (dateSessions.length > 0) {
      lines.push('---');
      lines.push('');
      lines.push('## ' + t('sleep.title'));
      lines.push('');
      dateSessions.forEach((s, i) => {
        lines.push(`- **${t('sleep.session')} #${i + 1}**: ${s.start} → ${s.end} (${calcSleepHours(s.start, s.end)} ${t('sleep.hours')})`);
      });
      lines.push('');
      lines.push('**' + t('sleep.totalSleep') + '**: ' + totalSleepHours + ' ' + t('sleep.hours'));
      lines.push('');
    } else {
      lines.push('---');
      lines.push('');
      lines.push('## ' + t('sleep.title'));
      lines.push('');
      lines.push('_' + t('sleep.noSessions') + '_');
      lines.push('');
    }

    // Drinks Data
    if (dateDrinks.length > 0) {
      lines.push('---');
      lines.push('');
      lines.push('## ' + t('drinks.title'));
      lines.push('');
      dateDrinks.forEach(d => {
        lines.push(`- **${d.name || t('drinks.drink')}**: ${d.count}×`);
      });
      lines.push('');
      lines.push('**' + t('drinks.total') + '**: ' + totalDrinksCount + '×');
      lines.push('');
    } else {
      lines.push('---');
      lines.push('');
      lines.push('## ' + t('drinks.title'));
      lines.push('');
      lines.push('_' + t('drinks.noDrinks') + '_');
      lines.push('');
    }

    // Journal
    if (diary) {
      lines.push('---');
      lines.push('');
      lines.push('## ' + t('journal.title'));
      lines.push('');
      lines.push('**' + t('export.dailyReflection') + '**');
      lines.push('');
      diary.split('\n').forEach(l => lines.push(l));
      lines.push('');
    }

    // Summary
    lines.push('---');
    lines.push('');
    lines.push('## ' + t('export.summary'));
    lines.push('');
    lines.push('- **' + t('export.tasksCompleted') + '**: ' + completed + '/' + total + ' (' + overallPct + '%)');
    lines.push('- **' + t('tasks.statusNotCompleted') + '**: ' + notCompleted + '/' + total);
    lines.push('- **' + t('tasks.statusPending') + '**: ' + pending + '/' + total);
    lines.push('- **' + t('export.fixedTasks') + '**: ' + fixedPct + '%');
    lines.push('- **' + t('export.personalTasks') + '**: ' + personalPct + '%');
    lines.push('- **' + t('export.prayersOnTime') + '**: ' + onTime + '/5 (' + prayerPct + '%)');
    if (totalHabitsToday > 0) lines.push('- **' + t('export.habitsDone') + '**: ' + completedHabits + '/' + totalHabitsToday + ' (' + habitsPct + '%)');
    lines.push('- **' + t('pulse.productivityScore') + '**: ' + compositeScore + '/100 (' + scoreLabel + ')');
    if (notes.length > 0) lines.push('- **' + t('journal.studyNotes') + '**: ' + notes.length + ' ' + (lang === 'ar' ? 'ملاحظة' : 'notes'));
    if (dateSessions.length > 0) lines.push('- **' + t('sleep.totalSleep') + '**: ' + totalSleepHours + ' ' + t('sleep.hours'));
    if (dateDrinks.length > 0) lines.push('- **' + t('drinks.total') + '**: ' + totalDrinksCount + '×');
    lines.push('- **' + t('export.streak') + '**: ' + streak + ' ' + t('streak.days'));
    if (mood) {
      lines.push('- **' + t('mood.title') + '**: ' + t('mood.' + mood));
    }
    lines.push('');
    lines.push('---');
    lines.push('_' + t('export.exportedFrom') + '_');
    lines.push('');

    const blob = new Blob([lines.join('\n')], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${date}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast(t('export.success'), { label: t('dialog.ok'), action: () => {} }, 86400000);
  };

  const handleDiaryChange = (e) => {
    setDiaryDraft(e.target.value);
    setDiarySaved(false);
  };

  const handleDiarySave = () => {
    if (!dayData) return;
    updateDayData({ ...dayData, diary: diaryDraft });
    setDiarySaved(true);
  };

  const saveLocationConfig = (cfg) => {
    localStorage.setItem('tarteeb_location_config', JSON.stringify(cfg));
    setLocationConfig(cfg);
  };

  const handleSettingsSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setApiError(null);
    try {
      saveLocationConfig(settingsForm);
      const cache = getPrayerCache();
      const prev = formatDateLocal(addDays(new Date(activeDate), -1));
      const next = formatDateLocal(addDays(new Date(activeDate), 1));
      delete cache[prev]; delete cache[activeDate]; delete cache[next];
      savePrayerCache(cache);
      await ensurePrayerTimesCached(activeDate, settingsForm);
      const comp = getCompiledPrayersForPlannerDate(activeDate);
      if (dayData) {
        updateDayData({ ...dayData, prayerTimes: { fajr: comp.fajr, dhuhr: comp.dhuhr, asr: comp.asr, maghrib: comp.maghrib, isha: comp.isha }, hijriDate: comp.hijriDate });
      }
      showAlert(t('alert.settingsSaved'));
    } catch (err) {
      addError(err.message || 'Settings save failed', 'settings');
      setApiError(t('alert.apiError'));
    } finally {
      setLoading(false);
    }
  };

  const handleManualTimesSubmit = (e) => {
    e.preventDefault();
    const cache = getPrayerCache();
    cache[activeDate] = { ...manualTimesForm, hijriDate: getPrayerTimesForDate(activeDate).hijriDate || '' };
    savePrayerCache(cache);
    const compiled = getCompiledPrayersForPlannerDate(activeDate);
    if (dayData) {
      updateDayData({ ...dayData, prayerTimes: compiled });
    }
    showAlert(t('alert.manualApplied'));
  };

  const formatHumanDate = (dateStr) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    const locale = lang === 'ar' ? 'ar-SA' : 'en-US';
    return d.toLocaleDateString(locale, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  };

  const showAlert = (message) => new Promise((resolve) => {
    setDialog({ type: 'alert', message, resolve });
  });

  const showConfirm = (message) => new Promise((resolve) => {
    setDialog({ type: 'confirm', message, resolve });
  });

  const closeDialog = (result) => {
    if (dialog?.resolve) dialog.resolve(result);
    setDialog(null);
  };

  const validateTaskForm = (form, existingTasks, editingId = null) => {
    if (!dayData?.prayerTimes) return t('error.prayerTimesNotLoaded');
    const prayers = dayData.prayerTimes;
    const duration = Number(form.duration) || 0;
    const blockStart = getPeriodStartMinutes(form.period, prayers);
    const blockEnd = getPeriodEndMinutes(form.period, prayers);
    const blockDuration = blockEnd - blockStart;
    const start = scheduledTimeToPlannerMinutes(form.scheduledTime, form.period, prayers);
    const end = start + duration;

    if (duration <= 0) return t('error.durationZero');
    if (duration > blockDuration) return t('error.durationExceeds');
    if (start < blockStart || start >= blockEnd) return t('error.startOutside');
    if (end > blockEnd) return t('error.endOutside');

    const conflictingTask = existingTasks.some(t => {
      const normalized = normalizeFixedTask(t, prayers);
      if (normalized.id === editingId || normalized.period !== form.period) return false;
      const existingStart = getTaskStartMinutes(normalized, prayers);
      const existingEnd = existingStart + (Number(normalized.duration) || 15) + TASK_GAP;
      return start < existingEnd && end > existingStart;
    });

    if (conflictingTask) return t('error.conflict');
    return '';
  };

  // ---- Rendering helpers ----
  const renderFullDayView = () => {
    const prayers = dayData.prayerTimes;
    const dayStart = getPlannerDayStartMinutes(prayers);
    const dayEnd = getPlannerDayEndMinutes(prayers);
    const padTop = 15;
    const padBottom = 15;
    const visualStart = dayStart - padTop;
    const visualEnd = dayEnd + padBottom;
    const visualDuration = visualEnd - visualStart;
    const timelineHeight = Math.max(2800, Math.min(8000, visualDuration * 4));
    const toPercent = (minutes) => ((minutes - visualStart) / visualDuration) * 100;
    const nowMinutes = getCurrentPlannerMinutes(currentTime, activeDate);
    const nowInRange = nowMinutes >= visualStart && nowMinutes <= visualEnd;
    const nowTop = nowInRange ? toPercent(nowMinutes) : -100;
    const sortedTasks = sortTasksForPlannerDay(dayData.tasks, prayers);
    const markers = getPrayerMarkersForPlannerDay(prayers).map(m => ({
      key: m.key, prayer: m.label, time: m.time, minutes: m.minutes
    }));
    const morningStart = getPeriodStartMinutes('morning', prayers);
    const periodBands = [
      { key: 'night-band', label: t('band.night'), start: dayStart, end: morningStart },
      { key: 'day-band', label: t('band.day'), start: morningStart, end: dayEnd }
    ];
    const formatTimelineTick = (minutes, exact = false) => {
      const normalized = ((minutes % 1440) + 1440) % 1440;
      const hour = Math.floor(normalized / 60);
      const minute = normalized % 60;
      if (getUse12h()) {
        const period = hour < 12 ? t('time.am') : t('time.pm');
        const h12 = hour % 12 || 12;
        const time = exact || minute !== 0 ? `${h12}:${String(minute).padStart(2, '0')}` : `${h12}`;
        return { time, period };
      }
      return { time: exact || minute !== 0 ? `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}` : `${hour}`, period: '' };
    };
    const hourTicks = [
      { key: 'start', ...formatTimelineTick(dayStart, true), minutes: dayStart },
      ...Array.from(
        { length: Math.max(0, Math.floor(dayEnd / 60) - Math.ceil(dayStart / 60) + 1) },
        (_, index) => {
          const minutes = (Math.ceil(dayStart / 60) + index) * 60;
          return { key: `hour-${minutes}`, ...formatTimelineTick(minutes), minutes };
        }
      ).filter(tick => tick.minutes > dayStart && tick.minutes < dayEnd),
      { key: 'end', ...formatTimelineTick(dayEnd, true), minutes: dayEnd }
    ];

    return (
      <section className="full-day-view">
        <article className="continuous-day-card">
          <div className="continuous-timeline" style={{ '--timeline-height': `${timelineHeight}px` }}>
            <div className="day-verse day-verse-top">
              <p className="day-verse-text">
                ﴿ فَإِذَا عَزَمْتَ فَتَوَكَّلْ عَلَى اللَّهِ ۚ إِنَّ اللَّهَ يُحِبُّ الْمُتَوَكِّلِينَ ﴾
              </p>
              <div className="day-verse-divider" />
              <p className="day-verse-reflection">
                يعني خطّط وقرّر اللي هتعمله، وبعدها ابدأ على طول من غير تردد، وسيب نتيجتك على ربنا وانت مطمّن.
              </p>
            </div>

            <div className="timeline-time-column">
              {hourTicks.map(tick => (
                <span key={tick.key} className="timeline-tick" style={{ top: `${toPercent(tick.minutes)}%` }}>
                  <span className="timeline-tick-time">{tick.time}</span>
                  {tick.period && <span className="timeline-tick-period">{tick.period}</span>}
                </span>
              ))}
            </div>

            <div className="timeline-board">
              {nowInRange && (
                <div className="timeline-now-line" style={{ top: `${nowTop}%` }} />
              )}
              {periodBands.map(band => (
                <div
                  key={band.key}
                  className={`timeline-period-band ${band.key}`}
                  style={{
                    top: `${toPercent(band.start)}%`,
                    height: `${toPercent(band.end) - toPercent(band.start)}%`
                  }}
                >
                  <span>{band.label}</span>
                </div>
              ))}

              {hourTicks.map(tick => (
                <div key={tick.key} className="timeline-hour-line" style={{ top: `${toPercent(tick.minutes)}%` }} />
              ))}

              {markers.map(marker => {
                const pk = marker.prayer.toLowerCase();
                const pStatus = getPrayerStatus(activeDate, pk);
                let initial = '';
                if (lang === 'ar') {
                  const arInitials = { Fajr: 'ف', Dhuhr: 'ظ', Asr: 'ع', Maghrib: 'م', Isha: 'ع' };
                  initial = arInitials[marker.prayer] || marker.prayer.charAt(0);
                } else {
                  initial = marker.prayer === 'Dhuhr' ? 'Z' : marker.prayer.charAt(0);
                }
                return (
                  <div
                    key={marker.key}
                    className={`timeline-prayer-marker status-${pStatus}`}
                    style={{ top: `${toPercent(marker.minutes)}%` }}
                    onClick={() => cyclePrayerStatus(activeDate, pk)}
                    aria-label={`${t('prayer.' + pk)} ${t('prayer.boundary')} — ${t(pStatus === 'pending' ? 'tasks.statusPending' : (pStatus === 'completed' ? 'tasks.statusCompleted' : 'tasks.statusNotCompleted'))}`}
                    title={`${t('prayer.' + pk)}: ${t(pStatus === 'pending' ? 'tasks.statusPending' : (pStatus === 'completed' ? 'tasks.statusCompleted' : 'tasks.statusNotCompleted'))}`}
                  >
                    {initial}
                  </div>
                );
              })}

              {sortedTasks.map((task) => {
                const taskStart = getTaskStartMinutes(task, prayers);
                const blockEnd = getPeriodEndMinutes(task.period, prayers);
                const duration = Math.max(5, Math.min(Number(task.duration) || 15, blockEnd - taskStart));
                const top = toPercent(taskStart);
                const heightPct = (duration / visualDuration) * 100;

                const isAdhkar = task.name.includes('Adhkar');
                const taskEnd = taskStart + duration;
                return (
                    <div
                    key={task.id}
                    className={`timeline-task-card task-${task.type}${isAdhkar ? ' task-adhkar' : ''} ${task.completed ? 'completed' : ''}`}
                    style={{ top: `${top}%`, height: `${heightPct}%` }}
                    onClick={() => toggleTaskCompletion(task.id)}
                    onContextMenu={e => { e.preventDefault(); if (task.type !== 'fixed') openTaskModal('edit', task); }}
                  >
                    <div className="timeline-task-bar" />
                    <div className="timeline-task-body">
                      <span className="timeline-task-time">
                        {getTaskDisplayTime(task, prayers)}–{formatMinutesToTime(taskEnd)}
                        <span className="timeline-task-duration-badge">{translateDuration(duration)}</span>
                      </span>
                      <span
                        className="timeline-task-name"
                        onClick={e => { e.stopPropagation(); if (task.type !== 'fixed') openTaskModal('edit', task); }}
                      >
                        {translateTaskName(task.name)}
                      </span>
                      {task.type !== 'fixed' && (
                        <div className="timeline-task-actions">
                          <button
                            className="timeline-task-btn edit"
                            onClick={e => { e.stopPropagation(); openTaskModal('edit', task); }}
                            title={t('task.edit')}
                          >
                            <Edit2 size={11} />
                          </button>
                          <button
                            className="timeline-task-btn delete"
                            onClick={e => { e.stopPropagation(); deleteTask(task.id); }}
                            title={t('task.deleteAria')}
                          >
                            <Trash2 size={11} />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="day-verse">
              <p className="day-verse-text">
                ﴿ حاسِبُوا أَنْفُسَكُمْ قَبْلَ أَنْ تُحَاسَبُوا، وَزِنُوهَا قَبْلَ أَنْ تُوزَنُوا ﴾
              </p>
              <div className="day-verse-divider" />
              <p className="day-verse-reflection">
                قبل أن تنام، راجع يومك: ما الذي أحسنت فيه؟ وما الذي يحتاج إلى إصلاح غدًا؟
              </p>
            </div>
          </div>
        </article>
      </section>
    );
  };

  // ---- Contact Developer ----
  const renderContactPage = () => {
    const handleContactSend = () => {
      const msg = contactMessage.trim();
      if (!msg) {
        showToast(t('contact.empty'), { label: t('dialog.ok'), action: () => {} }, 3000);
        return;
      }
      setContactSending(true);
      const phone = '201143044699';
      const encoded = encodeURIComponent(msg);
      const url = `https://wa.me/${phone}?text=${encoded}`;
      window.open(url, '_blank');
      setTimeout(() => {
        setContactSending(false);
        setContactMessage('');
        showToast(t('contact.success'), { label: t('dialog.ok'), action: () => {} }, 4000);
      }, 1500);
    };

    return (
      <div className="contact-page">
        <div className="new-tasks-header-wrap">
          <div className="new-tasks-header">
            <div style={{display: 'flex', alignItems: 'center', gap: '16px'}}>
              <Send size={32} className="new-tasks-title-icon" />
              <div>
                <h2 className="new-tasks-title">{t('contact.title')}</h2>
                <p className="new-tasks-subtitle">{t('contact.subtitle')}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="contact-card">
          <div className="contact-intro-box">
            <Heart size={18} className="contact-intro-icon" />
            <p className="contact-intro-text">{t('contact.intro')}</p>
          </div>

          <div className="contact-form">
            <textarea
              className="contact-textarea"
              placeholder={''}
              value={contactMessage}
              onChange={e => setContactMessage(e.target.value)}
              rows={5}
              dir={getLanguage() === 'ar' ? 'rtl' : 'ltr'}
            />
            <button
              className="btn btn-primary contact-send-btn"
              onClick={handleContactSend}
              disabled={contactSending}
            >
              {contactSending ? (
                <><RefreshCw size={16} className="animate-spin" /> {t('contact.sending')}</>
              ) : (
                <><Send size={16} /> {t('contact.send')}</>
              )}
            </button>
          </div>

          <div className="contact-footer">
            <span className="contact-response-time">{t('contact.response')}</span>
          </div>
        </div>
      </div>
    );
  };

  // ---- Pulse Dashboard (Professional Resume-Style) ----
  const renderPulseDashboard = () => {
    const todayStr = activeDate;
    const streak = computeStreak();

    if (!dayData) {
      return (
        <div className="new-pulse-page">
          <div className="new-tasks-header-wrap">
            <div className="new-tasks-header">
              <div style={{display: 'flex', alignItems: 'center', gap: '16px'}}>
                <Activity size={32} className="new-tasks-title-icon" />
                <div>
                  <h2 className="new-tasks-title">{t('pulse.title')}</h2>
                  <p className="new-tasks-subtitle">{t('pulse.subtitle')}</p>
                </div>
              </div>
            </div>
          </div>
          <div className="empty-state">
            <TrendingUp size={32} />
            <span className="empty-state-title">{t('pulse.noData')}</span>
          </div>
        </div>
      );
    }

    // ---- Data computation ----
    const allTasks = dayData.tasks || [];
    const totalTasks = allTasks.length;
    const completedTasks = allTasks.filter(t => t.status === 'completed' || t.completed).length;
    const notCompletedTasks = allTasks.filter(t => t.status === 'not_completed').length;
    const pendingTasks = allTasks.filter(t => !t.status || t.status === 'pending' || (!t.completed && t.status !== 'not_completed')).length;
    const overallPct = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

    const prayerTaskCounts = { completed: 0, not_completed: 0, pending: 0 };
    const prayerTaskStatuses = {};
    PRAYER_KEYS.forEach(pk => {
      const taskName = PRAYER_TO_TASK_NAME[pk];
      const task = allTasks.find(t => t.name === taskName);
      const status = task ? (task.status || (task.completed ? 'completed' : 'pending')) : 'pending';
      prayerTaskStatuses[pk] = status;
      prayerTaskCounts[status] = (prayerTaskCounts[status] || 0) + 1;
    });
    const onTimePrayers = prayerTaskCounts.completed;

    const todayHabits = habits.filter(h => {
      const entry = h.entries?.[todayStr];
      return entry !== undefined;
    });
    const totalHabits = todayHabits.length;
    const completedHabits = todayHabits.filter(h => h.entries?.[todayStr]?.completed).length;
    const pendingHabits = totalHabits - completedHabits;
    const habitsPct = totalHabits > 0 ? Math.round((completedHabits / totalHabits) * 100) : 0;

    const notes = dayData.studyNotes || [];
    const hasNotes = notes.length > 0;

    const tasksByPeriod = {};
    getPlannerPeriodOrder().forEach(pk => {
      const periodTasks = allTasks.filter(t => t.period === pk);
      if (periodTasks.length > 0) {
        const done = periodTasks.filter(t => t.status === 'completed' || t.completed).length;
        tasksByPeriod[pk] = { tasks: periodTasks, total: periodTasks.length, done };
      }
    });

    const prayerPct = Math.round((onTimePrayers / 5) * 100);
    const sleepHours = todayTotalHours;
    const sleepScore = Math.min(Math.round((sleepHours / 8) * 100), 100);
    const streakScore = Math.min(streak * 10, 100);

    // Composite score (weighted)
    const compositeScore = Math.round(
      (overallPct * 0.25) + (habitsPct * 0.20) + (prayerPct * 0.30) + (sleepScore * 0.15) + (streakScore * 0.10)
    );
    const scoreLabel = compositeScore >= 85 ? t('pulse.scoreExcellent')
      : compositeScore >= 65 ? t('pulse.scoreGood')
      : compositeScore >= 45 ? t('pulse.scoreFair')
      : t('pulse.scoreNeedsWork');

    // Yesterday comparison
    let yesterdayComparison = null;
    if (prevDayData) {
      const yTasks = prevDayData.tasks || [];
      const yCompleted = yTasks.filter(t => t.status === 'completed' || t.completed).length;
      const yTotal = yTasks.length;
      const yPct = yTotal > 0 ? Math.round((yCompleted / yTotal) * 100) : 0;
      const taskDiff = completedTasks - yCompleted;
      const pctDiff = overallPct - yPct;
      yesterdayComparison = { yCompleted, yTotal, yPct, taskDiff, pctDiff };
    }

    const STATUS_COLORS = { completed: 'var(--color-emerald)', not_completed: 'var(--color-danger)', pending: 'var(--text-tertiary)' };

    // ---- SVG Progress Ring component ----
    const ProgressRing = ({ pct, size = 72, strokeWidth = 5, color, bgColor = 'var(--bg-primary)' }) => {
      const r = (size - strokeWidth) / 2;
      const circumference = 2 * Math.PI * r;
      const offset = circumference - (Math.min(pct, 100) / 100) * circumference;
      const center = size / 2;
      return (
        <svg width={size} height={size} className="pulse-ring-svg">
          <circle cx={center} cy={center} r={r} fill="none" stroke={bgColor} strokeWidth={strokeWidth} />
          <circle cx={center} cy={center} r={r} fill="none" stroke={color} strokeWidth={strokeWidth}
            strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round"
            transform={`rotate(-90 ${center} ${center})`} className="pulse-ring-fill" />
        </svg>
      );
    };

    // ---- Score Detail Row ----
    const ScoreRow = ({ label, pct, pts, color }) => (
      <div className="pulse-score-row">
        <div className="pulse-score-row-label">
          <span className="pulse-score-dot" style={{ background: color }} />
          <span>{label}</span>
        </div>
        <div className="pulse-score-row-bar-wrap">
          <div className="pulse-score-row-bar" style={{ width: `${pct}%`, background: color }} />
        </div>
        <span className="pulse-score-row-pts">{pts}</span>
      </div>
    );

    return (
      <div className="new-pulse-page">
        {/* Header */}
        <div className="new-tasks-header-wrap">
          <div className="new-tasks-header">
            <div style={{display: 'flex', alignItems: 'center', gap: '16px'}}>
              <Activity size={32} className="new-tasks-title-icon" />
              <div>
                <h2 className="new-tasks-title">{t('pulse.title')}</h2>
                <p className="new-tasks-subtitle">{t('pulse.subtitle')}</p>
              </div>
            </div>
            <div className="new-pulse-date">
              <span className="date-gregorian">{formatHumanDate(todayStr)}</span>
              {dayData.hijriDate && <span className="date-hijri">{dayData.hijriDate}</span>}
            </div>
          </div>
        </div>

        {/* Top Overview Cards with Progress Rings */}
        <div className="new-pulse-overview-grid">
          <div className="new-pulse-card overview-tasks">
            <div className="pulse-ring-card-inner">
              <ProgressRing pct={overallPct} color="var(--color-teal)" />
              <div className="overview-data">
                <h3>{t('pulse.tasksDone')}</h3>
                <div className="overview-value">{completedTasks}<span>/{totalTasks}</span></div>
                <div className="overview-sub">
                  <span className="sub-tag tag-pending">{pendingTasks} {t('tasks.statusPending')}</span>
                  <span className="sub-tag tag-missed">{notCompletedTasks} {t('tasks.statusNotCompleted')}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="new-pulse-card overview-habits">
            <div className="pulse-ring-card-inner">
              <ProgressRing pct={habitsPct} color="#3b82f6" />
              <div className="overview-data">
                <h3>{t('pulse.habitsToday')}</h3>
                <div className="overview-value">{completedHabits}<span>/{totalHabits}</span></div>
                <div className="overview-sub">
                  <span className="sub-tag tag-pending">{pendingHabits} {t('tasks.statusPending')}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="new-pulse-card overview-prayers">
            <div className="pulse-ring-card-inner">
              <ProgressRing pct={prayerPct} color="var(--color-emerald)" />
              <div className="overview-data">
                <h3>{t('pulse.prayerStatus')}</h3>
                <div className="overview-value">{onTimePrayers}<span>/5</span></div>
                <div className="overview-sub pulse-metric-dots">
                  {PRAYER_KEYS.map(pk => {
                    const status = prayerTaskStatuses[pk] || 'pending';
                    return <span key={pk} className="pulse-dot" style={{ background: STATUS_COLORS[status] }} title={t('prayer.' + pk)} />;
                  })}
                </div>
              </div>
            </div>
          </div>

          <div className="new-pulse-card overview-streak">
            <div className="pulse-ring-card-inner">
              <ProgressRing pct={streakScore} color="var(--color-gold)" />
              <div className="overview-data">
                <h3>{t('streak.title')}</h3>
                <div className="overview-value">{streak}<span>{t('streak.days')}</span></div>
                <div className="overview-sub">
                  <span className="sub-tag tag-streak">{overallPct}% {t('pulse.completionRate')}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Main Dashboard Content - Two Column */}
        <div className="new-pulse-content-grid">
          {/* Left Column */}
          <div className="new-pulse-column-left">
            {/* Task Breakdown */}
            <div className="new-pulse-card detail-tasks">
              <div className="new-pulse-card-header">
                <BarChart3 size={18} />
                <h4>{t('pulse.taskBreakdown')}</h4>
              </div>
              <div className="task-status-bars">
                <div className="status-bar-row">
                  <span className="status-label">{t('tasks.statusCompleted')}</span>
                  <div className="status-track"><div className="status-fill completed" style={{width: totalTasks ? `${(completedTasks/totalTasks)*100}%` : '0%'}} /></div>
                  <span className="status-count">{completedTasks}</span>
                </div>
                <div className="status-bar-row">
                  <span className="status-label">{t('tasks.statusPending')}</span>
                  <div className="status-track"><div className="status-fill pending" style={{width: totalTasks ? `${(pendingTasks/totalTasks)*100}%` : '0%'}} /></div>
                  <span className="status-count">{pendingTasks}</span>
                </div>
                <div className="status-bar-row">
                  <span className="status-label">{t('tasks.statusNotCompleted')}</span>
                  <div className="status-track"><div className="status-fill not-completed" style={{width: totalTasks ? `${(notCompletedTasks/totalTasks)*100}%` : '0%'}} /></div>
                  <span className="status-count">{notCompletedTasks}</span>
                </div>
              </div>
              <div className="pulse-period-breakdown new-style">
                {getPlannerPeriodOrder().filter(pk => tasksByPeriod[pk]).map(pk => {
                  const block = tasksByPeriod[pk];
                  const pct = block.total > 0 ? Math.round((block.done / block.total) * 100) : 0;
                  return (
                    <div key={pk} className="pulse-period-row">
                      <div className="pulse-period-info">
                        <span className="pulse-period-name">{t('period.' + pk)}</span>
                        <span className="pulse-period-count">{block.done}/{block.total}</span>
                      </div>
                      <div className="pulse-period-bar-wrap">
                        <div className="pulse-period-bar" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Yesterday Comparison Card */}
            <div className="new-pulse-card detail-comparison">
              <div className="new-pulse-card-header">
                <TrendingUp size={18} />
                <h4>{t('pulse.vsYesterday')}</h4>
              </div>
              <div className="pulse-comparison-content">
                {yesterdayComparison ? (
                  <>
                    <div className="pulse-compare-row">
                      <span className="pulse-compare-label">{t('pulse.tasksDone')}</span>
                      <div className="pulse-compare-values">
                        <span className="pulse-compare-today">{completedTasks}</span>
                        <span className="pulse-compare-sep">/</span>
                        <span className="pulse-compare-yesterday">{yesterdayComparison.yCompleted}</span>
                      </div>
                      <span className={`pulse-compare-diff ${yesterdayComparison.taskDiff >= 0 ? 'up' : 'down'}`}>
                        {yesterdayComparison.taskDiff >= 0 ? '▲' : '▼'} {Math.abs(yesterdayComparison.taskDiff)}
                      </span>
                    </div>
                    <div className="pulse-compare-row">
                      <span className="pulse-compare-label">{t('pulse.completionRate')}</span>
                      <div className="pulse-compare-values">
                        <span className="pulse-compare-today">{overallPct}%</span>
                        <span className="pulse-compare-sep">/</span>
                        <span className="pulse-compare-yesterday">{yesterdayComparison.yPct}%</span>
                      </div>
                      <span className={`pulse-compare-diff ${yesterdayComparison.pctDiff >= 0 ? 'up' : 'down'}`}>
                        {yesterdayComparison.pctDiff >= 0 ? '▲' : '▼'} {Math.abs(yesterdayComparison.pctDiff)}%
                      </span>
                    </div>
                    <div className="pulse-compare-bar-group">
                      <div className="pulse-compare-bar-item">
                        <span className="pulse-compare-bar-label">{t('pulse.today')}</span>
                        <div className="pulse-compare-bar-track">
                          <div className="pulse-compare-bar-fill today" style={{ width: `${overallPct}%` }} />
                        </div>
                      </div>
                      <div className="pulse-compare-bar-item">
                        <span className="pulse-compare-bar-label">{t('pulse.yesterday')}</span>
                        <div className="pulse-compare-bar-track">
                          <div className="pulse-compare-bar-fill yesterday" style={{ width: `${yesterdayComparison.yPct}%` }} />
                        </div>
                      </div>
                    </div>
                  </>
                ) : (
                  <span className="pulse-empty-habits">{t('pulse.noComparison')}</span>
                )}
              </div>
            </div>

            {/* Sleep & Drinks */}
            <div className="new-pulse-card detail-prayers">
              <div className="new-pulse-card-header">
                <Moon size={18} />
                <h4>{t('sleep.title')} &amp; {t('drinks.title')}</h4>
              </div>
              <div className="pulse-sleep-drinks-grid">
                <div className="pulse-sd-box">
                  <span className="pulse-sd-icon"><Moon size={16} /></span>
                  <div>
                    <span className="pulse-sd-label">{t('sleep.totalSleep')}</span>
                    <span className="pulse-sd-value">{sleepHours > 0 ? `${sleepHours}h` : '--'}</span>
                  </div>
                  <div className="pulse-sd-bar-mini">
                    <div className="pulse-sd-bar-fill" style={{ width: `${sleepScore}%`, background: 'linear-gradient(90deg, #6366f1, #8b5cf6)' }} />
                  </div>
                </div>
                <div className="pulse-sd-box">
                  <span className="pulse-sd-icon"><Coffee size={16} /></span>
                  <div>
                    <span className="pulse-sd-label">{t('drinks.total')}</span>
                    <span className="pulse-sd-value">{todayDrinks.reduce((s, d) => s + d.count, 0)}×</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column */}
          <div className="new-pulse-column-right">
            {/* Productivity Score Card */}
            <div className="new-pulse-card detail-score">
              <div className="new-pulse-card-header">
                <Award size={18} />
                <h4>{t('pulse.productivityScore')}</h4>
              </div>
              <div className="pulse-score-main">
                <div className="pulse-score-gauge">
                  <ProgressRing pct={compositeScore} size={120} strokeWidth={8}
                    color={compositeScore >= 85 ? 'var(--color-emerald)' : compositeScore >= 65 ? 'var(--color-gold)' : compositeScore >= 45 ? '#f59e0b' : 'var(--color-danger)'} />
                  <div className="pulse-score-gauge-text">
                    <span className="pulse-score-big">{compositeScore}</span>
                    <span className="pulse-score-label">{scoreLabel}</span>
                  </div>
                </div>
                <div className="pulse-score-details">
                  <ScoreRow label={t('pulse.scoreTasks')} pct={overallPct} pts={`${overallPct}%`} color="var(--color-teal)" />
                  <ScoreRow label={t('pulse.scoreHabits')} pct={habitsPct} pts={`${habitsPct}%`} color="#3b82f6" />
                  <ScoreRow label={t('pulse.scorePrayers')} pct={prayerPct} pts={`${prayerPct}%`} color="var(--color-emerald)" />
                  <ScoreRow label={t('pulse.scoreSleep')} pct={sleepScore} pts={`${sleepScore}%`} color="#6366f1" />
                  <ScoreRow label={t('pulse.scoreStreak')} pct={streakScore} pts={`${streakScore}%`} color="var(--color-gold)" />
                </div>
              </div>
            </div>

            {/* Habits List */}
            <div className="new-pulse-card detail-habits">
              <div className="new-pulse-card-header">
                <Target size={18} />
                <h4>{t('pulse.habitsToday')}</h4>
              </div>
              <div className="new-pulse-habits-list">
                {todayHabits.map(h => {
                  const entry = h.entries?.[todayStr];
                  const done = entry?.completed || false;
                  return (
                    <div key={h.id} className={`new-pulse-habit-item ${done ? 'done' : 'pending'}`}>
                      {done ? <Check size={14} className="icon-done" /> : <Minus size={14} className="icon-pending" />}
                      <span>{h.name}</span>
                    </div>
                  );
                })}
                {todayHabits.length === 0 && (
                  <span className="pulse-empty-habits">{t('pulse.noHabits')}</span>
                )}
              </div>
            </div>

            {/* Prayer Status */}
            <div className="new-pulse-card detail-prayers">
              <div className="new-pulse-card-header">
                <Clock size={18} />
                <h4>{t('pulse.prayerStatus')}</h4>
              </div>
              <div className="new-pulse-prayer-grid">
                {PRAYER_KEYS.map(pk => {
                  const status = prayerTaskStatuses[pk] || 'pending';
                  const time = dayData.prayerTimes?.[pk] || '--:--';
                  return (
                    <div key={pk} className={`new-pulse-prayer-box status-${status}`}>
                      <div className="prayer-info">
                        <span className="prayer-name">{t('prayer.' + pk)}</span>
                        <span className="prayer-time">{time}</span>
                      </div>
                      <span className="prayer-status-text">
                        <span className="pulse-status-dot" style={{ background: STATUS_COLORS[status] }} />
                        {t(status === 'pending' ? 'tasks.statusPending' : (status === 'completed' ? 'tasks.statusCompleted' : 'tasks.statusNotCompleted'))}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Adhkar */}
            <div className="new-pulse-card detail-prayers">
              <div className="new-pulse-card-header">
                <BookOpen size={18} />
                <h4>{t('adhkar.title')}</h4>
              </div>
              <div className="new-pulse-prayer-grid">
                {['morning', 'evening'].map(key => {
                  const status = (prayerTracking[todayStr] || {})[`adhkar_${key}`] || 'pending';
                  return (
                    <div key={key} className={`new-pulse-prayer-box status-${status}`}>
                      <div className="prayer-info">
                        <span className="prayer-name">{t('adhkar.' + key)}</span>
                      </div>
                      <span className="prayer-status-text">
                        <span className="pulse-status-dot" style={{ background: STATUS_COLORS[status] }} />
                        {t(status === 'pending' ? 'tasks.statusPending' : (status === 'completed' ? 'tasks.statusCompleted' : 'tasks.statusNotCompleted'))}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Notes */}
        {hasNotes && (
          <div className="new-pulse-card detail-notes">
            <div className="new-pulse-card-header">
              <BookOpen size={18} />
              <h4>{t('pulse.studyNotes')}</h4>
            </div>
            <div className="pulse-notes-list new-style">
              {notes.map(note => (
                <div key={note.id} className="pulse-note-item new-style">
                  <span className="pulse-note-period">{t('period.' + note.period)}</span>
                  <p className="pulse-note-text">{note.text}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  // ---- Sidebar navigation links ----
  const sidebarLinks = [
    { id: 'home', label: t('nav.home'), icon: Sparkles },
    { id: 'journal', label: t('nav.journal'), icon: BookOpen },
    { id: 'tasks', label: t('nav.tasks'), icon: List },
    { id: 'habits', label: t('nav.habits'), icon: Target },
    { id: 'sleep', label: t('nav.sleep'), icon: Moon },
    { id: 'drinks', label: t('nav.drinks'), icon: Coffee },
    { id: 'prayers', label: t('nav.prayers'), icon: Clock },
    { id: 'pulse', label: t('nav.pulse'), icon: Activity },
    { id: 'settings', label: t('nav.settings'), icon: Settings },
    { id: 'guide', label: t('nav.guide'), icon: HelpCircle },
    { id: 'contact', label: t('nav.contact'), icon: Send },
  ];

  // ---- Main render ----
  return (
    <div className="app-container">
      {/* Header */}
      <header className="app-header">
          <div className="brand-section" onClick={() => setCurrentPage('home')} style={{ cursor: 'pointer' }}>
            <h1 className="brand-title">
              <Sparkles size={22} className="brand-icon" />
              <span className="brand-latin">{t('brand.title')}</span>
            </h1>
          </div>
        <div className="header-actions">
          {dayData && (
            <button className="btn btn-download-header" onClick={() => exportToMarkdown()} title={t('header.exportTitle')}>
              <Download size={15} />
              <span>{t('header.downloadCurrentDay')}</span>
            </button>
          )}
          {installable && (
            <button className="btn btn-install-header" onClick={handleInstall} title={t('nav.install')}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                {/* Phone outline */}
                <rect x="5" y="2" width="14" height="20" rx="2" ry="2" />
                <line x1="12" y1="18" x2="12.01" y2="18" />
                {/* Download arrow */}
                <line x1="12" y1="7" x2="12" y2="13" />
                <polyline points="9 10 12 13 15 10" />
              </svg>
              <span>{t('nav.install')}</span>
            </button>
          )}
          <button className="btn btn-menu-mobile" onClick={() => setSidebarOpen(true)} aria-label={t('nav.openSidebar')}>
            <Menu size={18} />
          </button>
        </div>
      </header>

      {/* Full‑screen layout with left sidebar */}
      {sidebarOpen && <div className="sidebar-overlay" onClick={() => setSidebarOpen(false)} />}
      <div className="main-layout full-screen">
        {/* Left Sidebar */}
        <aside className={`full-sidebar ${sidebarOpen ? 'sidebar-open' : ''}`}>
          <button className="sidebar-close-btn" onClick={() => setSidebarOpen(false)} aria-label={t('nav.closeSidebar')}>
            <X size={20} />
          </button>

          {/* Profile card */}
          <div className="sidebar-profile">
            <div className="sidebar-profile-avatar">
              <Sparkles size={20} />
            </div>
            <div className="sidebar-profile-body">
              <span className="sidebar-profile-title">{t('brand.title')}</span>
              <span className="sidebar-profile-sub">{t('brand.subtitle')}</span>
            </div>
          </div>

          {/* Date + prayer info */}
          {dayData && (
            <div className="sidebar-info">
              <div className="sidebar-info-row">
                <CalendarDays size={14} className="sidebar-info-icon" />
                <span className="sidebar-info-date">{formatHumanDate(dayData.date)}</span>
              </div>
              {dayData.hijriDate && (
                <div className="sidebar-info-row sidebar-info-hijri">
                  <span>{dayData.hijriDate}</span>
                </div>
              )}
              {timelineStatus?.nextPrayerName && (
                <div className="sidebar-info-row sidebar-info-prayer">
                  <Clock size={13} className="sidebar-info-icon" />
                  <span>{timelineStatus.timeToNextPrayer} {t('time.until')} {t('prayer.' + timelineStatus.nextPrayerName.toLowerCase())}</span>
                </div>
              )}
            </div>
          )}

          {/* Streak */}
          {computeStreak() > 0 && (
            <div className="sidebar-streak" title={t('streak.title')}>
              <Flame size={16} className="sidebar-streak-icon" />
              <span className="sidebar-streak-value">{computeStreak()}</span>
              <span className="sidebar-streak-label">{t('streak.days')}</span>
            </div>
          )}

          {/* Navigation */}
          <div className="sidebar-nav-header">{t('nav.navigation')}</div>
          <nav className="sidebar-nav">
            {sidebarLinks.map(link => (
              <button
                key={link.id}
                className={`sidebar-link ${currentPage === link.id ? 'active' : ''}`}
                onClick={() => { setCurrentPage(link.id); setSidebarOpen(false); window.scrollTo(0, 0); }}
              >
                <span className="sidebar-link-icon"><link.icon size={17} /></span>
                <span className="sidebar-link-label">{link.label}</span>
              </button>
            ))}
          </nav>

          {/* Export buttons in nav style */}
          {dayData && (
            <div className="sidebar-export-nav">
              <button className="sidebar-link sidebar-export-link" onClick={() => exportToMarkdown()}>
                <span className="sidebar-link-icon"><Download size={17} /></span>
                <span className="sidebar-link-label">{t('header.exportCurrent')}</span>
              </button>
              {prevDayData && (
                <button className="sidebar-link sidebar-export-link" onClick={() => exportToMarkdown(prevDayData)}>
                  <span className="sidebar-link-icon"><Download size={17} /></span>
                  <span className="sidebar-link-label">{t('header.exportPrevious')}</span>
                </button>
              )}
            </div>
          )}

          {/* Quick actions */}
          <div className="sidebar-actions">
            <button className="sidebar-action-btn" onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')} title={t('settings.theme')}>
              {theme === 'light' ? <Moon size={15} /> : <Sun size={15} />}
            </button>
            <button className="sidebar-action-btn" onClick={() => setLang(lang === 'en' ? 'ar' : 'en')} title={t('settings.language')}>
              <span className="sidebar-action-lang">{lang === 'en' ? 'AR' : 'EN'}</span>
            </button>
            <button className="sidebar-action-btn" onClick={() => setFontSize(s => {
              const idx = FONT_SIZES.indexOf(s);
              return FONT_SIZES[(idx + 1) % FONT_SIZES.length];
            })} title={t('settings.fontSize')}>
              <Type size={15} />
            </button>
            <button className="sidebar-action-btn" onClick={toggleFullscreen} title={t('nav.fullscreen')}>
              {document.fullscreenElement ? <Minimize size={15} /> : <Maximize size={15} />}
            </button>
            <button className="sidebar-action-btn sidebar-action-reload" onClick={() => window.location.reload()} title={t('nav.refresh')}>
              <RefreshCw size={14} />
            </button>
          </div>

          {/* Footer */}
          <div className="sidebar-footer">
            {t('footer.developedBy')} <a href="https://nagdista.com" target="_blank" rel="noopener noreferrer">Nagdista</a>
            {errorLog.length > 0 && (
              <button className="sidebar-error-btn" onClick={() => setErrorModalOpen(true)} title={t('footer.viewErrors')}>
                <AlertCircle size={11} /> {errorLog.length}
              </button>
            )}
          </div>
        </aside>

          {/* Main Content Area */}
          <main className="content-area">
            {loading && (
              <div style={{ textAlign: 'center', padding: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', color: 'var(--color-emerald)' }}>
                <RefreshCw className="animate-spin" size={16} />
                <span style={{ fontSize: '0.85rem' }}>{t('header.loading')}</span>
              </div>
            )}

            {/* Conditional Pages */}
            {currentPage === 'home' && dayData && renderFullDayView()}


            {currentPage === 'tasks' && dayData && (
              <div className="tasks-page new-tasks-page">
                <div className="new-tasks-header-wrap">
                  <div className="new-tasks-header">
                    <div>
                      <h2 className="new-tasks-title">{t('tasks.title')}</h2>
                      <p className="new-tasks-subtitle">{t('tasks.overall')}: {dayData.stats.completedTasks}/{dayData.stats.totalTasks} {t('tasks.completed').toLowerCase()}</p>
                    </div>
                    <div className="new-tasks-progress-ring">
                      <List size={32} className="new-tasks-title-icon" />
                    </div>
                  </div>
                </div>

                <div className="tasks-search-wrap new-search-wrap">
                  <Search size={16} className="tasks-search-icon" />
                  <input
                    className="tasks-search-input"
                    type="text"
                    placeholder={t('tasks.searchPlaceholder')}
                    value={taskSearch}
                    onChange={e => setTaskSearch(e.target.value)}
                  />
                  {taskSearch && (
                    <button className="tasks-search-clear" onClick={() => setTaskSearch('')}>
                      <X size={16} />
                    </button>
                  )}
                </div>

                <div className="new-tasks-sections">
                  <div className="new-period-section">
                    <div className="new-period-task-list">
                      {(() => {
                        const allTasks = taskSearch
                          ? dayData.tasks.filter(t =>
                              t.name.toLowerCase().includes(taskSearch.toLowerCase()) ||
                              (t.details || '').toLowerCase().includes(taskSearch.toLowerCase())
                            )
                          : dayData.tasks;
                        return allTasks.map(task => {
                          const taskStart = getTaskStartMinutes(task, dayData.prayerTimes);
                          const taskEnd = taskStart + (Number(task.duration) || 15);
                          const currentStatus = task.status || (task.completed ? 'completed' : 'pending');
                          
                          return (
                            <div key={task.id} className={`t-card status-${currentStatus}`}>
                              <span className={`t-dot ${currentStatus}`} />
                              <div className="t-body">
                                <div className="t-row">
                                  <h4 className="t-title">{translateTaskName(task.name)}</h4>
                                  <div className="t-actions">
                                    <button
                                      className={`t-btn ${currentStatus === 'pending' ? 'active' : ''}`}
                                      onClick={() => setTaskStatus(task.id, 'pending')}
                                      title={t('tasks.statusPending')}
                                    >
                                      <Clock size={12} />
                                    </button>
                                    <button
                                      className={`t-btn ${currentStatus === 'completed' ? 'active' : ''}`}
                                      onClick={() => setTaskStatus(task.id, 'completed')}
                                      title={t('tasks.statusCompleted')}
                                    >
                                      <Check size={12} />
                                    </button>
                                    <button
                                      className={`t-btn ${currentStatus === 'not_completed' ? 'active' : ''}`}
                                      onClick={() => setTaskStatus(task.id, 'not_completed')}
                                      title={t('tasks.statusNotCompleted')}
                                    >
                                      <X size={12} />
                                    </button>
                                  </div>
                                </div>
                                {task.details && (
                                  <p className="t-desc">{task.details}</p>
                                )}
                                <span className="t-meta">{translateDuration(Number(task.duration) || 15)}</span>
                              </div>
                            </div>
                          );
                        });
                      })()}
                    </div>
                  </div>
                </div>
                
                {taskSearch && dayData.tasks.filter(t =>
                  t.name.toLowerCase().includes(taskSearch.toLowerCase()) ||
                  (t.details || '').toLowerCase().includes(taskSearch.toLowerCase())
                ).length === 0 && (
                  <div className="tasks-empty-search">
                    <Search size={24} />
                    <span>{t('tasks.noTasksMatch')}</span>
                  </div>
                )}
              </div>
            )}

            {currentPage === 'pulse' && renderPulseDashboard()}

            {currentPage === 'journal' && dayData && (
              <div className="journal-page">
                <div className="new-tasks-header-wrap">
                  <div className="new-tasks-header">
                    <div>
                      <h2 className="new-tasks-title">{t('journal.title')}</h2>
                      <p className="new-tasks-subtitle">{formatHumanDate(dayData.date)}{dayData.hijriDate ? ` · ${dayData.hijriDate}` : ''}</p>
                    </div>
                    <div className="new-tasks-progress-ring">
                      <PenLine size={32} className="new-tasks-title-icon" />
                    </div>
                  </div>
                </div>

                <div className="note-composer-card">
                  <div className="note-composer-body">
                    <textarea
                      className="note-composer-input"
                      value={studyText}
                      onChange={e => setStudyText(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); addStudyNote(); } }}
                      rows={4}
                      style={{ resize: 'none' }}
                      dir="auto"
                    />
                  </div>

                    <div className="note-composer-footer">
                    <div className="note-composer-footer-left">
                      <div className="note-period-chips">
                        {getPlannerPeriodOrder().map(key => (
                          <button
                            key={key}
                            className={`note-period-chip ${studyPeriod === key ? 'active' : ''}`}
                            onClick={() => setStudyPeriod(key)}
                          >
                            {t('period.' + key)}
                          </button>
                        ))}
                      </div>
                      {studyText.length > 0 && (
                        <span className="note-composer-char-count">{studyText.length}</span>
                      )}
                    </div>
                    <button
                      className="note-composer-submit"
                      onClick={addStudyNote}
                      disabled={!studyText.trim()}
                    >
                      <Plus size={15} />
                      <span>{t('journal.addNote')}</span>
                    </button>
                  </div>
                </div>

                <div className="journal-section-divider">
                  <span>{t('journal.allNotes')}{(dayData.studyNotes || []).length > 0 ? ` (${(dayData.studyNotes || []).length})` : ''}</span>
                </div>

                <div className="journal-study-notes">
                  {(() => {
                    const activePeriod = timelineStatus?.activePeriod;
                    const allNotes = dayData.studyNotes || [];
                    if (allNotes.length === 0) {
                      return (
                        <div className="empty-state">
                          <div className="empty-state-icon"><BookOpen size={24} /></div>
                          <span className="empty-state-title">{t('journal.noNotes')}</span>
                        </div>
                      );
                    }
                    return getPlannerPeriodOrder().map(periodKey => {
                      const notes = getNotesForPeriod(periodKey);
                      if (notes.length === 0) return null;
                      const isActive = activePeriod === periodKey;
                      return (
                        <div key={periodKey} className={`study-group ${isActive ? 'active' : ''}`}>
                          <div className="study-group-header">
                            <span className="study-group-badge">{t('period.' + periodKey)}</span>
                            <span className="study-group-range">{t('period.' + periodKey + 'Range')}</span>
                            <span className="study-group-count">{notes.length}</span>
                          </div>
                          <div className="study-group-notes">
                            {notes.map(note => (
                              <div key={note.id} className={`study-note-card${note.locked ? ' locked' : ''}`}>
                                {editingNoteId === note.id ? (
                                  <div className="study-note-edit-area">
                                    <textarea
                                      className="note-composer-input note-edit-input"
                                      value={editText}
                                      onChange={e => setEditText(e.target.value)}
                                      rows={3}
                                      style={{ resize: 'none' }}
                                      dir="auto"
                                    />
                                    <div className="study-note-edit-actions">
                                      <button type="button" className="btn btn-sm" onClick={cancelEditNote}>{t('journal.cancel')}</button>
                                      <button type="button" className="btn btn-sm btn-primary" onClick={saveEditNote} disabled={!editText.trim()}>{t('journal.save')}</button>
                                    </div>
                                  </div>
                                ) : (
                                  <>
                                    <div className="study-note-text">{note.text}</div>
                                    {note.editedAt && (
                                      <div className="study-note-edited-info">
                                        {note.previousText && (
                                          <div className="study-note-previous">{note.previousText}</div>
                                        )}
                                        <span className="study-note-edited-badge">{t('journal.edited')}</span>
                                      </div>
                                    )}
                                  </>
                                )}
                                <div className="study-note-footer">
                                  <span className="study-note-time">
                                    {note.time}
                                    {note.editedAt && (
                                      <span className="study-note-edited-time"> · {t('journal.edited')}</span>
                                    )}
                                  </span>
                                  <div className="study-note-actions">
                                    <button type="button" className="btn-task-action" onClick={() => startEditNote(note.id)} aria-label={t('journal.edit')}>
                                      <Edit2 size={12} />
                                    </button>
                                    <button type="button" className={`btn-task-action${note.locked ? ' locked' : ''}`} onClick={() => toggleLockNote(note.id)} aria-label={note.locked ? 'Unlock note' : 'Lock note'}>
                                      {note.locked ? <Lock size={12} /> : <Unlock size={12} />}
                                    </button>
                                    {!note.locked && (
                                      <button type="button" className="btn-task-action delete" onClick={() => deleteStudyNote(note.id)} aria-label={t('task.deleteAria')}>
                                        <Trash2 size={12} />
                                      </button>
                                    )}
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    });
                  })()}
                </div>
              </div>
            )}

            {currentPage === 'guide' && (
              <div className="guide-page">
                <div className="new-tasks-header-wrap">
                  <div className="new-tasks-header">
                    <div style={{display: 'flex', alignItems: 'center', gap: '16px'}}>
                      <Sparkles size={32} className="new-tasks-title-icon" />
                      <div>
                        <h2 className="new-tasks-title">{t('guide.title')}</h2>
                        <p className="new-tasks-subtitle">{t('guide.subtitle')}</p>
                      </div>
                    </div>
                    <div className="guide-steps-badge">
                      <Zap size={12} />
                      <span>15 {t('guide.steps')}</span>
                    </div>
                  </div>
                </div>

                <div className="guide-sections">

                  {/* What is Tarteeb */}
                  <div className="guide-card" style={{ '--card-accent': 'var(--color-emerald)' }}>
                    <div className="guide-card-step">01</div>
                    <div className="guide-card-icon-wrap"><Sparkles size={22} /></div>
                    <div className="guide-card-content">
                      <h3 className="guide-card-title">{t('guide.whatIs')}</h3>
                      <p className="guide-card-desc">{t('guide.whatIsDesc')}</p>
                    </div>
                  </div>

                  {/* Getting Started */}
                  <div className="guide-card" style={{ '--card-accent': 'var(--color-teal)' }}>
                    <div className="guide-card-step">02</div>
                    <div className="guide-card-icon-wrap"><Settings size={22} /></div>
                    <div className="guide-card-content">
                      <h3 className="guide-card-title">{t('guide.gettingStarted')}</h3>
                      <p className="guide-card-desc">{t('guide.gettingStartedDesc')}</p>
                    </div>
                  </div>

                  {/* Home Timeline */}
                  <div className="guide-card" style={{ '--card-accent': 'var(--color-emerald)' }}>
                    <div className="guide-card-step">03</div>
                    <div className="guide-card-icon-wrap"><Clock size={22} /></div>
                    <div className="guide-card-content">
                      <h3 className="guide-card-title">{t('guide.timeline')}</h3>
                      <p className="guide-card-desc">{t('guide.timelineDesc')}</p>
                    </div>
                  </div>

                  {/* Add Task */}
                  <div className="guide-card" style={{ '--card-accent': 'var(--color-gold)' }}>
                    <div className="guide-card-step">04</div>
                    <div className="guide-card-icon-wrap"><Plus size={22} /></div>
                    <div className="guide-card-content">
                      <h3 className="guide-card-title">{t('guide.addTask')}</h3>
                      <p className="guide-card-desc">{t('guide.addTaskDesc')}</p>
                    </div>
                  </div>

                  {/* Tasks Page */}
                  <div className="guide-card" style={{ '--card-accent': 'var(--color-emerald)' }}>
                    <div className="guide-card-step">05</div>
                    <div className="guide-card-icon-wrap"><List size={22} /></div>
                    <div className="guide-card-content">
                      <h3 className="guide-card-title">{t('guide.tasksPage')}</h3>
                      <p className="guide-card-desc">{t('guide.tasksPageDesc')}</p>
                    </div>
                  </div>

                  {/* Journal */}
                  <div className="guide-card" style={{ '--card-accent': 'var(--color-gold)' }}>
                    <div className="guide-card-step">06</div>
                    <div className="guide-card-icon-wrap"><BookOpen size={22} /></div>
                    <div className="guide-card-content">
                      <h3 className="guide-card-title">{t('guide.journal')}</h3>
                      <p className="guide-card-desc">{t('guide.journalDesc')}</p>
                    </div>
                  </div>

                  {/* Habits */}
                  <div className="guide-card" style={{ '--card-accent': 'var(--color-emerald)' }}>
                    <div className="guide-card-step">07</div>
                    <div className="guide-card-icon-wrap"><Target size={22} /></div>
                    <div className="guide-card-content">
                      <h3 className="guide-card-title">{t('guide.habits')}</h3>
                      <p className="guide-card-desc">{t('guide.habitsDesc')}</p>
                    </div>
                  </div>

                  {/* Sleep */}
                  <div className="guide-card" style={{ '--card-accent': 'var(--color-gold)' }}>
                    <div className="guide-card-step">08</div>
                    <div className="guide-card-icon-wrap"><Moon size={22} /></div>
                    <div className="guide-card-content">
                      <h3 className="guide-card-title">{t('guide.sleep')}</h3>
                      <p className="guide-card-desc">{t('guide.sleepDesc')}</p>
                    </div>
                  </div>

                  {/* Drinks */}
                  <div className="guide-card" style={{ '--card-accent': 'var(--color-teal)' }}>
                    <div className="guide-card-step">09</div>
                    <div className="guide-card-icon-wrap"><Coffee size={22} /></div>
                    <div className="guide-card-content">
                      <h3 className="guide-card-title">{t('guide.drinks')}</h3>
                      <p className="guide-card-desc">{t('guide.drinksDesc')}</p>
                    </div>
                  </div>

                  {/* Prayers */}
                  <div className="guide-card" style={{ '--card-accent': 'var(--color-emerald)' }}>
                    <div className="guide-card-step">10</div>
                    <div className="guide-card-icon-wrap"><Clock size={22} /></div>
                    <div className="guide-card-content">
                      <h3 className="guide-card-title">{t('guide.prayers')}</h3>
                      <p className="guide-card-desc">{t('guide.prayersDesc')}</p>
                    </div>
                  </div>

                  {/* Statistics */}
                  <div className="guide-card" style={{ '--card-accent': 'var(--color-gold)' }}>
                    <div className="guide-card-step">11</div>
                    <div className="guide-card-icon-wrap"><Activity size={22} /></div>
                    <div className="guide-card-content">
                      <h3 className="guide-card-title">{t('guide.history')}</h3>
                      <p className="guide-card-desc">{t('guide.historyDesc')}</p>
                    </div>
                  </div>

                  {/* Settings */}
                  <div className="guide-card" style={{ '--card-accent': 'var(--color-teal)' }}>
                    <div className="guide-card-step">12</div>
                    <div className="guide-card-icon-wrap"><Settings size={22} /></div>
                    <div className="guide-card-content">
                      <h3 className="guide-card-title">{t('guide.settings')}</h3>
                      <p className="guide-card-desc">{t('guide.settingsDesc')}</p>
                    </div>
                  </div>

                  {/* Export */}
                  <div className="guide-card" style={{ '--card-accent': 'var(--color-emerald)' }}>
                    <div className="guide-card-step">13</div>
                    <div className="guide-card-icon-wrap"><Download size={22} /></div>
                    <div className="guide-card-content">
                      <h3 className="guide-card-title">{t('guide.export')}</h3>
                      <p className="guide-card-desc">{t('guide.exportDesc')}</p>
                    </div>
                  </div>

                  {/* Theme & Language */}
                  <div className="guide-card" style={{ '--card-accent': 'var(--color-gold)' }}>
                    <div className="guide-card-step">14</div>
                    <div className="guide-card-icon-wrap"><Sun size={22} /></div>
                    <div className="guide-card-content">
                      <h3 className="guide-card-title">{t('guide.theme')}</h3>
                      <p className="guide-card-desc">{t('guide.themeDesc')}</p>
                    </div>
                  </div>

                  {/* Keyboard Shortcuts */}
                  <div className="guide-card" style={{ '--card-accent': 'var(--color-teal)' }}>
                    <div className="guide-card-step">15</div>
                    <div className="guide-card-icon-wrap"><Zap size={22} /></div>
                    <div className="guide-card-content">
                      <h3 className="guide-card-title">{t('guide.shortcuts')}</h3>
                      <p className="guide-card-desc">{t('guide.shortcutsDesc')}</p>
                    </div>
                  </div>

                  {/* Pro Tips */}
                  <div className="guide-card guide-card-tips" style={{ '--card-accent': 'var(--color-gold)' }}>
                    <div className="guide-card-icon-wrap"><Heart size={22} /></div>
                    <div className="guide-card-content">
                      <h3 className="guide-card-title">{t('guide.tips')}</h3>
                      <p className="guide-card-desc">{t('guide.tipsDesc')}</p>
                    </div>
                  </div>

                </div>
              </div>
            )}

            {currentPage === 'contact' && renderContactPage()}

            {currentPage === 'habits' && (
              <div className="habits-page">
                <div className="new-tasks-header-wrap">
                  <div className="new-tasks-header">
                    <div>
                      <h2 className="new-tasks-title">{t('habits.title')}</h2>
                      <p className="new-tasks-subtitle">{t('habits.stats')}</p>
                    </div>
                    <button className="btn btn-primary" onClick={() => { setHabitForm({ name: '' }); setHabitModal({ open: true, mode: 'add', habit: null }); }}>
                      <Plus size={16} /> {t('habits.add')}
                    </button>
                  </div>
                </div>
                {habits.length === 0 ? (
                  <div className="empty-state">
                    <div className="empty-state-icon"><Target size={24} /></div>
                    <span className="empty-state-title">{t('habits.noHabits')}</span>
                  </div>
                ) : (
                  <div className="habits-list">
                    {habits.map((habit, index) => {
                      const today = formatDateLocal(new Date());
                      const todayEntry = (habit.entries || {})[today];
                      const isDone = todayEntry?.completed || false;
                      return (
                        <div key={habit.id} className="habit-card">
                          <div className="habit-main">
                            <button
                              type="button"
                              className={`habit-check ${isDone ? 'checked' : ''}`}
                              onClick={() => toggleHabit(habit.id)}
                            >
                              {isDone && <Check size={16} />}
                            </button>
                            <div className="habit-info">
                              <span className="habit-name" onClick={() => { setHabitForm({ name: habit.name }); setHabitModal({ open: true, mode: 'edit', habit }); }}>
                                {habit.name}
                              </span>
                            </div>
                            <div className="habit-actions">
                              <span className="habit-reorder">
                                <button type="button" className="btn-task-action" onClick={() => moveHabit(index, -1)} disabled={index === 0} title={t('habits.moveUp')}>
                                  <ChevronUp size={13} />
                                </button>
                                <button type="button" className="btn-task-action" onClick={() => moveHabit(index, 1)} disabled={index === habits.length - 1} title={t('habits.moveDown')}>
                                  <ChevronDown size={13} />
                                </button>
                              </span>
                              <button type="button" className="btn-task-action" onClick={() => { setHabitForm({ name: habit.name }); setHabitModal({ open: true, mode: 'edit', habit }); }} title={t('habits.edit')}>
                                <Edit2 size={13} />
                              </button>
                              <button type="button" className="btn-task-action delete" onClick={() => deleteHabit(habit.id)} title={t('habits.delete')}>
                                <Trash2 size={13} />
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {currentPage === 'sleep' && (
              <div className="sleep-page">
                <div className="new-tasks-header-wrap">
                  <div className="new-tasks-header">
                    <div>
                      <h2 className="new-tasks-title">{t('sleep.title')}</h2>
                      <p className="new-tasks-subtitle">
                        {todaySessions.length > 0
                          ? t('sleep.totalSleep') + ': ' + todayTotalHours + ' ' + t('sleep.hours')
                          : ''}
                      </p>
                    </div>
                    <button className="btn btn-primary" onClick={addSleepSession}>
                      <Plus size={16} /> {t('sleep.addSession')}
                    </button>
                  </div>
                </div>
                {todaySessions.length === 0 ? (
                  <div className="empty-state">
                    <div className="empty-state-icon"><Moon size={24} /></div>
                    <span className="empty-state-title">{t('sleep.noSessions')}</span>
                  </div>
                ) : (
                  <div className="sleep-sessions-list">
                    {todaySessions.map((session, idx) => {
                      const hours = calcSleepHours(session.start, session.end);
                      return (
                        <div key={session.id} className="sleep-session-card">
                          <div className="sleep-session-main">
                            <div className="sleep-session-info">
                              <div className="sleep-session-fields">
                                <div className="form-group">
                                  <label className="form-label">{t('sleep.startTime')}</label>
                                  <input
                                    type="time"
                                    className="form-input sleep-time-input"
                                    value={session.start}
                                    onChange={e => updateSleepSession(session.id, 'start', e.target.value)}
                                  />
                                </div>
                                <div className="form-group">
                                  <label className="form-label">{t('sleep.endTime')}</label>
                                  <input
                                    type="time"
                                    className="form-input sleep-time-input"
                                    value={session.end}
                                    onChange={e => updateSleepSession(session.id, 'end', e.target.value)}
                                  />
                                </div>
                              </div>
                              <span className="sleep-session-hours">
                                <Moon size={14} /> {hours} {t('sleep.hours')}
                              </span>
                            </div>
                            <span className="sleep-session-badge">#{idx + 1}</span>
                            <button
                              type="button"
                              className="btn-task-action delete"
                              onClick={() => deleteSleepSession(session.id)}
                              title={t('sleep.delete')}
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                    <div className="sleep-total-card">
                      <span>{t('sleep.totalSleep')}</span>
                      <strong>{todayTotalHours} {t('sleep.hours')}</strong>
                    </div>
                  </div>
                )}
              </div>
            )}

            {currentPage === 'drinks' && (
              <div className="drinks-page">
                <div className="new-tasks-header-wrap">
                  <div className="new-tasks-header">
                    <div>
                      <h2 className="new-tasks-title">{t('drinks.title')}</h2>
                      <p className="new-tasks-subtitle">
                        {todayDrinks.length > 0
                          ? t('drinks.total') + ': ' + todayDrinks.reduce((s, d) => s + d.count, 0)
                          : ''}
                      </p>
                    </div>
                    <button className="btn btn-primary" onClick={addDrink}>
                      <Plus size={16} /> {t('drinks.add')}
                    </button>
                  </div>
                </div>
                {todayDrinks.length === 0 ? (
                  <div className="empty-state">
                    <div className="empty-state-icon"><Coffee size={24} /></div>
                    <span className="empty-state-title">{t('drinks.noDrinks')}</span>
                  </div>
                ) : (
                  <div className="drinks-list-new">
                    {todayDrinks.map(drink => (
                      <div key={drink.id} className="d-card">
                        <div className="d-card-top">
                          <div className="d-card-info">
                            <input
                              type="text"
                              className="d-card-name"
                              value={drink.name}
                              onChange={e => updateDrink(drink.id, 'name', e.target.value)}
                              placeholder={t('drinks.name')}
                            />
                          </div>
                          <div className="d-card-actions">
                            <button
                              className="d-count-btn"
                              onClick={() => updateDrink(drink.id, 'count', Math.max(0, drink.count - 1))}
                            >
                              <Minus size={12} />
                            </button>
                            <span className="d-count-val">{drink.count}</span>
                            <button
                              className="d-count-btn"
                              onClick={() => updateDrink(drink.id, 'count', drink.count + 1)}
                            >
                              <Plus size={12} />
                            </button>
                            <span className="d-card-divider" />
                            <button
                              className="d-del-btn"
                              onClick={() => deleteDrink(drink.id)}
                              title={t('drinks.delete')}
                            >
                              <Trash2 size={12} />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                    <div className="d-total">
                      <span>{t('drinks.total')}</span>
                      <strong>{todayDrinks.reduce((s, d) => s + d.count, 0)}</strong>
                    </div>
                  </div>
                )}
              </div>
            )}

            {currentPage === 'prayers' && dayData && (
              <div className="prayers-page">
                <div className="new-tasks-header-wrap">
                  <div className="new-tasks-header">
                    <div style={{display: 'flex', alignItems: 'center', gap: '16px'}}>
                      <Clock size={32} className="new-tasks-title-icon" />
                      <div>
                        <h2 className="new-tasks-title">{t('prayerTimes.title')}</h2>
                        <p className="new-tasks-subtitle">{t('prayerTimes.subtitle')}</p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="prayers-list">
                  {['maghrib', 'isha', 'fajr', 'dhuhr', 'asr'].map((key) => {
                    const timeStr = dayData.prayerTimes[key];
                    const timeLabel = timeStr ? formatMinutesToTime(parseTimeToMinutes(timeStr)) : '--:--';
                    return (
                      <div key={key} className="prayer-time-row">
                        <span className="prayer-time-name">{t('prayer.' + key)}</span>
                        <span className="prayer-time-value">{timeLabel}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {currentPage === 'settings' && (
              <div className="settings-page">
                <div className="new-tasks-header-wrap">
                  <div className="new-tasks-header">
                    <div>
                      <h2 className="new-tasks-title">{t('settings.title')}</h2>
                      <p className="new-tasks-subtitle">{t('settings.subtitle')}</p>
                    </div>
                  </div>
                </div>
                <div className="settings-section-label">{t('settings.appearance')}</div>

                {/* Font Size */}
                <div className="settings-card">
                  <div className="settings-card-header">
                    <span className="settings-card-icon-wrap"><Type size={20} /></span>
                    <div>
                      <h3 className="settings-card-title">{t('settings.fontSize')}</h3>
                      <p className="settings-card-desc">{t('settings.fontSizeDesc')}</p>
                    </div>
                  </div>
                  <div className="settings-card-body">
                    <div className="font-size-control">
                      <button className="btn btn-icon font-size-btn" onClick={() => setFontSize(s => {
                        const idx = FONT_SIZES.indexOf(s);
                        return FONT_SIZES[Math.max(0, idx - 1)];
                      })} disabled={fontSize === 'small'}><Minus size={18} /></button>
                      <div className="font-size-display">
                        <span className="font-size-label">{t('settings.fontSize_' + fontSize)}</span>
                        <span className="font-size-preview">{t('settings.fontSizePreview')}</span>
                      </div>
                      <button className="btn btn-icon font-size-btn" onClick={() => setFontSize(s => {
                        const idx = FONT_SIZES.indexOf(s);
                        return FONT_SIZES[Math.min(FONT_SIZES.length - 1, idx + 1)];
                      })} disabled={fontSize === 'xlarge'}><Plus size={18} /></button>
                    </div>
                  </div>
                </div>

                {/* Day Start Mode */}
                <div className="settings-card">
                  <div className="settings-card-header">
                    <span className="settings-card-icon-wrap"><CalendarDays size={20} /></span>
                    <div>
                      <h3 className="settings-card-title">{t('settings.dayStart')}</h3>
                      <p className="settings-card-desc">{t('settings.dayStartDesc')}</p>
                    </div>
                  </div>
                  <div className="settings-card-body">
                    <div className="time-format-control">
                      <button className={`time-format-btn ${dayStartMode === DAY_START_MODES.MAGHRIB ? 'active' : ''}`} onClick={() => { setDayStartModeState(DAY_START_MODES.MAGHRIB); setDayStartMode(DAY_START_MODES.MAGHRIB); }}>
                        <span className="time-format-sample">{t('prayer.maghrib')}</span>
                        <span className="time-format-label">{t('settings.maghribStart')}</span>
                      </button>
                      <button className={`time-format-btn ${dayStartMode === DAY_START_MODES.MIDNIGHT ? 'active' : ''}`} onClick={() => { setDayStartModeState(DAY_START_MODES.MIDNIGHT); setDayStartMode(DAY_START_MODES.MIDNIGHT); }}>
                        <span className="time-format-sample">12:00 {t('time.am')}</span>
                        <span className="time-format-label">{t('settings.midnight')}</span>
                      </button>
                    </div>
                  </div>
                </div>

                {/* Time Format */}
                <div className="settings-card">
                  <div className="settings-card-header">
                    <span className="settings-card-icon-wrap"><Clock size={20} /></span>
                    <div>
                      <h3 className="settings-card-title">{t('settings.timeFormat')}</h3>
                      <p className="settings-card-desc">{t('settings.timeFormatDesc')}</p>
                    </div>
                  </div>
                  <div className="settings-card-body">
                    <div className="time-format-control">
                      <button className={`time-format-btn ${!use12h ? 'active' : ''}`} onClick={() => { setUse12hState(false); setUse12h(false); }}>
                        <span className="time-format-sample">23:59</span>
                        <span className="time-format-label">{t('settings.format24h')}</span>
                      </button>
                      <button className={`time-format-btn ${use12h ? 'active' : ''}`} onClick={() => { setUse12hState(true); setUse12h(true); }}>
                        <span className="time-format-sample">11:59 {t('time.pm')}</span>
                        <span className="time-format-label">{t('settings.format12h')}</span>
                      </button>
                    </div>
                  </div>
                </div>

                {/* Theme */}
                <div className="settings-card">
                  <div className="settings-card-header">
                    <span className="settings-card-icon-wrap">{theme === 'light' ? <Moon size={20} /> : <Sun size={20} />}</span>
                    <div>
                      <h3 className="settings-card-title">{t('settings.theme')}</h3>
                      <p className="settings-card-desc">{t('settings.themeDesc')}</p>
                    </div>
                  </div>
                  <div className="settings-card-body">
                    <div className="time-format-control">
                      <button className={`time-format-btn ${theme === 'light' ? 'active' : ''}`} onClick={() => setTheme('light')}>
                        <Sun size={22} />
                        <span className="time-format-label">{t('settings.light')}</span>
                      </button>
                      <button className={`time-format-btn ${theme === 'dark' ? 'active' : ''}`} onClick={() => setTheme('dark')}>
                        <Moon size={22} />
                        <span className="time-format-label">{t('settings.dark')}</span>
                      </button>
                    </div>
                  </div>
                </div>

                {/* Language */}
                <div className="settings-card">
                  <div className="settings-card-header">
                    <span className="settings-card-icon-wrap"><span style={{ fontSize: '1.1rem', fontWeight: 700 }}>{lang === 'en' ? 'EN' : 'AR'}</span></span>
                    <div>
                      <h3 className="settings-card-title">{t('settings.language')}</h3>
                      <p className="settings-card-desc">{t('settings.languageDesc')}</p>
                    </div>
                  </div>
                  <div className="settings-card-body">
                    <div className="time-format-control">
                      <button className={`time-format-btn ${lang === 'en' ? 'active' : ''}`} onClick={() => setLang('en')}>
                        <span className="time-format-sample" style={{ fontSize: '1rem', fontWeight: 700 }}>EN</span>
                        <span className="time-format-label">{t('settings.english')}</span>
                      </button>
                      <button className={`time-format-btn ${lang === 'ar' ? 'active' : ''}`} onClick={() => setLang('ar')}>
                        <span className="time-format-sample" style={{ fontSize: '1rem', fontWeight: 700 }}>AR</span>
                        <span className="time-format-label">{t('settings.arabic')}</span>
                      </button>
                    </div>
                  </div>
                </div>

                <div className="settings-section-label">{t('settings.prayerTimes')}</div>

                {/* Location Settings */}
                <div className="settings-card location-card">
                  <div className="settings-card-header">
                    <span className="settings-card-icon-wrap"><MapPin size={20} /></span>
                    <div>
                      <h3 className="settings-card-title">{t('settings.locationTitle')}</h3>
                      <p className="settings-card-desc">{t('settings.locationDesc')}</p>
                    </div>
                  </div>
                  {apiError && (
                    <div className="settings-error">
                      <AlertCircle size={14} /> {apiError}
                    </div>
                  )}
                  <div className="settings-card-body">
                    <form onSubmit={handleSettingsSubmit}>
                      <label className="settings-toggle">
                        <input type="checkbox" checked={settingsForm.enabled} onChange={e => setSettingsForm(prev => ({ ...prev, enabled: e.target.checked }))} />
                        <span className="settings-toggle-label">{t('settings.useApi')}</span>
                      </label>
                      {settingsForm.enabled && (
                        <div className="settings-fieldset">
                          <div className="settings-radio-group">
                            <span className="settings-radio-label">{t('settings.mode')}</span>
                            <div className="settings-radio-options">
                              <label className="settings-radio">
                                <input type="radio" name="locMode" checked={settingsForm.type === 'city'} onChange={() => setSettingsForm(prev => ({ ...prev, type: 'city' }))} />
                                <span>{t('settings.city')}</span>
                              </label>
                              <label className="settings-radio">
                                <input type="radio" name="locMode" checked={settingsForm.type === 'coords'} onChange={() => setSettingsForm(prev => ({ ...prev, type: 'coords' }))} />
                                <span>{t('settings.coords')}</span>
                              </label>
                            </div>
                          </div>
                          {settingsForm.type === 'city' ? (
                            <div className="form-row-stacked">
                              <div className="form-group">
                                <label className="form-label">{t('settings.countryLabel')}</label>
                                <select className="form-select" value={settingsForm.country} onChange={e => {
                                  const country = e.target.value;
                                  const cities = countries[country] || [];
                                  setSettingsForm(prev => ({
                                    ...prev,
                                    country,
                                    city: cities.includes(prev.city) ? prev.city : cities[0] || ''
                                  }));
                                }} required>
                                  <option value="">{t('settings.selectCountry')}</option>
                                  {Object.keys(countries).sort().map(c => (
                                    <option key={c} value={c}>{c}</option>
                                  ))}
                                </select>
                              </div>
                              <div className="form-group">
                                <label className="form-label">{t('settings.cityLabel')}</label>
                                <select className="form-select" value={settingsForm.city} onChange={e => setSettingsForm(prev => ({ ...prev, city: e.target.value }))} required>
                                  <option value="">{t('settings.selectCity')}</option>
                                  {(countries[settingsForm.country] || []).map(c => (
                                    <option key={c} value={c}>{c}</option>
                                  ))}
                                </select>
                              </div>
                            </div>
                          ) : (
                            <div className="form-row-stacked">
                              <div className="form-group"><label className="form-label">{t('settings.latLabel')}</label><input className="form-input" type="number" step="0.0001" value={settingsForm.latitude} onChange={e => setSettingsForm(prev => ({ ...prev, latitude: e.target.value }))} required/></div>
                              <div className="form-group"><label className="form-label">{t('settings.lngLabel')}</label><input className="form-input" type="number" step="0.0001" value={settingsForm.longitude} onChange={e => setSettingsForm(prev => ({ ...prev, longitude: e.target.value }))} required/></div>
                            </div>
                          )}
                          <button type="submit" className="btn btn-primary" disabled={loading}>{t('settings.saveSettings')}</button>
                        </div>
                      )}
                    </form>
                  </div>
                </div>

                {/* Manual Overrides */}
                <div className="settings-card manual-card">
                  <div className="settings-card-header">
                    <span className="settings-card-icon-wrap"><Clock size={20} /></span>
                    <div>
                      <h3 className="settings-card-title">{t('settings.manualTitle')}</h3>
                      <p className="settings-card-desc">{t('settings.manualDesc')}</p>
                    </div>
                  </div>
                  <div className="settings-card-body">
                    <form onSubmit={handleManualTimesSubmit}>
                      <div className="settings-times-grid">
                        {['fajr','dhuhr','asr','maghrib','isha'].map(p => (
                          <div key={p} className="form-group">
                            <label className="form-label">{t('settings.' + p)}</label>
                            <input className="form-input" type="text" value={manualTimesForm[p]} onChange={e => setManualTimesForm(prev => ({ ...prev, [p]: e.target.value }))} required />
                            <span className="manual-time-hint">{t('prayer.' + p)}</span>
                          </div>
                        ))}
                      </div>
                      <button type="submit" className="btn btn-primary">{t('settings.apply')}</button>
                    </form>
                  </div>
                </div>

                {/* Backup & Restore */}
                <div className="settings-card backup-card">
                  <div className="settings-card-header">
                    <span className="settings-card-icon-wrap"><Download size={20} /></span>
                    <div>
                      <h3 className="settings-card-title">{t('settings.backupTitle')}</h3>
                      <p className="settings-card-desc">{t('settings.backupDesc')}</p>
                    </div>
                  </div>
                  <div className="settings-card-body">
                    <div className="backup-actions">
                      <button className="btn btn-primary" onClick={() => {
                        const keys = Object.keys(localStorage).filter(k => k.startsWith('tarteeb_'));
                        const data = {};
                        keys.forEach(k => { data[k] = localStorage.getItem(k); });
                        data._exportedAt = new Date().toISOString();
                        data._version = '1.0';
                        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = `tarteeb_backup_${formatDateLocal(new Date())}.json`;
                        document.body.appendChild(a);
                        a.click();
                        document.body.removeChild(a);
                        URL.revokeObjectURL(url);
                      }}>
                        <Download size={16} /> {t('settings.exportData')}
                      </button>
                      <button className="btn" onClick={() => document.getElementById('backup-import-input').click()}>
                        <Upload size={16} /> {t('settings.importData')}
                      </button>
                      <input id="backup-import-input" className="backup-import-hidden" type="file" accept=".json" onChange={e => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        const reader = new FileReader();
                        reader.onload = (ev) => {
                          try {
                            const data = JSON.parse(ev.target.result);
                            const keys = Object.keys(data).filter(k => k.startsWith('tarteeb_'));
                            if (keys.length === 0) throw new Error('Invalid');
                            keys.forEach(k => localStorage.setItem(k, data[k]));
                            showAlert(t('settings.importSuccess')).then(() => window.location.reload());
                          } catch {
                            showAlert(t('settings.importError'));
                          }
                        };
                        reader.readAsText(file);
                        e.target.value = '';
                      }} />
                    </div>
                    <div className="backup-data-types">
                      <div className="backup-data-types-label">{t('settings.dataTypes')}</div>
                      <div className="backup-data-types-list">
                        <span className="backup-data-type-tag"><Check size={11} /> {t('settings.prayers')}</span>
                        <span className="backup-data-type-tag"><Check size={11} /> {t('settings.tasks')}</span>
                        <span className="backup-data-type-tag"><Check size={11} /> {t('habits.title')}</span>
                        <span className="backup-data-type-tag"><Check size={11} /> {t('adhkar.title')}</span>
                        <span className="backup-data-type-tag"><Check size={11} /> {t('journal.title')}</span>
                        <span className="backup-data-type-tag"><Check size={11} /> {t('nav.sleep')}</span>
                        <span className="backup-data-type-tag"><Check size={11} /> {t('nav.drinks')}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Notifications */}
                <div className="settings-card">
                  <div className="settings-card-header">
                    <span className="settings-card-icon-wrap"><Bell size={20} /></span>
                    <div>
                      <h3 className="settings-card-title">{t('settings.notifTitle')}</h3>
                      <p className="settings-card-desc">{t('settings.notifDesc')}</p>
                    </div>
                  </div>
                  <div className="settings-card-body">
                    <button className="btn" onClick={() => setShowNotifStatus(true)}>
                      <Bell size={16} /> {t('settings.notifCheckStatus')}
                    </button>
                  </div>
                </div>

                {/* Clear Cache */}
                <div className="settings-card">
                  <div className="settings-card-header">
                    <span className="settings-card-icon-wrap"><RefreshCw size={20} /></span>
                    <div>
                      <h3 className="settings-card-title">{t('settings.clearCacheTitle')}</h3>
                      <p className="settings-card-desc">{t('settings.clearCacheDesc')}</p>
                    </div>
                  </div>
                  <div className="settings-card-body">
                    <button className="btn btn-danger" onClick={async () => {
                      const confirmed = await showConfirm(t('settings.clearCacheConfirm'));
                      if (!confirmed) return;
                      Object.keys(localStorage)
                        .filter(k => k.startsWith('tarteeb_'))
                        .forEach(k => localStorage.removeItem(k));
                      localStorage.removeItem('tarteeb_welcome_dismissed');
                      setShowWelcome(true);
                    }}>
                      <Trash2 size={16} /> {t('settings.clearCache')}
                    </button>
                  </div>
                </div>
              </div>
            )}

          </main>

        {/* Floating Action Button */}
        {currentPage === 'home' && dayData && (
          <button className="fab-add-task" onClick={() => openTaskModal('add')} title={t('task.add')}>
            <Plus size={22} />
          </button>
        )}
        </div>

      {/* Toast notifications */}
      {toast && (
        <div className="toast-overlay" key={toast.key}>
          <div className="toast-bar">
            <span className="toast-message">{toast.message}</span>
            <div className="toast-actions">
              {toast.action && (
                <button className="btn btn-toast" onClick={() => { dismissToast(); toast.action.action(); }}>
                  {toast.action.label}
                </button>
              )}
              <button className="btn btn-toast btn-toast-dismiss" onClick={dismissToast}>
                <X size={14} />
              </button>
            </div>
          </div>
        </div>
      )}

      {taskModal.open && (() => {
        const prayers = dayData?.prayerTimes;

        // Helper: get available start slots normalized to 0..1439
        const getStartSlots = () => {
          if (!prayers) return [];
          const nowMin = taskModal.mode === 'add' ? getCurrentPlannerMinutes(currentTime, activeDate) : null;
          return getAvailableStartSlots(taskForm.period, dayData.tasks, prayers, taskModal.task?.id, nowMin)
            .map(m => m % 1440);
        };

        // Helper: get available end slots (>= start + TASK_GAP) normalized to 0..1439
        const getEndSlots = (startTimeStr) => {
          if (!prayers) return [];
          const startAbsolute = scheduledTimeToPlannerMinutes(startTimeStr, taskForm.period, prayers);
          return getAvailableEndSlots(taskForm.period, dayData.tasks, prayers, startAbsolute, taskModal.task?.id)
            .map(m => m % 1440);
        };

        const startSlots = getStartSlots();
        const endSlots = getEndSlots(taskForm.scheduledTime);

        // Unique sorted hours from slots
        const startHours = [...new Set(startSlots.map(m => Math.floor(m / 60)))].sort((a, b) => a - b);
        const endHours = [...new Set(endSlots.map(m => Math.floor(m / 60)))].sort((a, b) => a - b);

        // Current start h/m
        const curStartMin = parseTimeToMinutes(taskForm.scheduledTime);
        const curStartH = Math.floor(curStartMin / 60) % 24;
        const curStartM = curStartMin % 60;
        const selStartH = startHours.includes(curStartH) ? curStartH : (startHours[0] ?? 0);
        const startMinsForHour = startSlots.filter(m => Math.floor(m / 60) === selStartH).map(m => m % 60).sort((a, b) => a - b);
        const selStartM = startMinsForHour.includes(curStartM) ? curStartM : (startMinsForHour[0] ?? 0);

        // Current end h/m
        const curEndMin = parseTimeToMinutes(taskForm.endTime);
        const curEndH = Math.floor(curEndMin / 60) % 24;
        const curEndM = curEndMin % 60;
        const selEndH = endHours.includes(curEndH) ? curEndH : (endHours[0] ?? 0);
        const endMinsForHour = endSlots.filter(m => Math.floor(m / 60) === selEndH).map(m => m % 60).sort((a, b) => a - b);
        const selEndM = endMinsForHour.includes(curEndM) ? curEndM : (endMinsForHour[0] ?? 0);

        // Live duration
        const startAbsolute = prayers ? scheduledTimeToPlannerMinutes(taskForm.scheduledTime, taskForm.period, prayers) : 0;
        const endAbsolute = prayers ? scheduledTimeToPlannerMinutes(taskForm.endTime, taskForm.period, prayers) : 0;
        const liveDuration = endAbsolute - startAbsolute;

        const use12 = getUse12h();
        const fmtH = (h) => use12 ? String(h % 12 || 12) : String(h).padStart(2, '0');
        const ampm = (h) => h < 12 ? t('time.am') : t('time.pm');

        const handlePeriodChange = (period) => {
          if (!prayers) return;
          const nowMin = taskModal.mode === 'add' ? getCurrentPlannerMinutes(currentTime, activeDate) : null;
          const newStartSlots = getAvailableStartSlots(period, dayData.tasks, prayers, taskModal.task?.id, nowMin).map(m => m % 1440);
          const firstStart = newStartSlots.length > 0 ? newStartSlots[0] : getPeriodStartMinutes(period, prayers) % 1440;
          const startStr = String(Math.floor(firstStart / 60)).padStart(2, '0') + ':' + String(firstStart % 60).padStart(2, '0');
          const newEndSlots = getAvailableEndSlots(period, dayData.tasks, prayers,
            scheduledTimeToPlannerMinutes(startStr, period, prayers), taskModal.task?.id).map(m => m % 1440);
          const firstEnd = newEndSlots.length > 0 ? newEndSlots[0] : firstStart + 15;
          const endStr = String(Math.floor((firstEnd % 1440) / 60)).padStart(2, '0') + ':' + String(firstEnd % 60).padStart(2, '0');
          setTaskForm(prev => ({ ...prev, period, scheduledTime: startStr, endTime: endStr }));
        };

        const handleStartHourChange = (h) => {
          const newStartSlots = getStartSlots();
          const minsForH = newStartSlots.filter(m => Math.floor(m / 60) === h).map(m => m % 60).sort((a, b) => a - b);
          const m = minsForH.includes(selStartM) ? selStartM : (minsForH[0] ?? 0);
          const startStr = String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
          const newEndSlots = getEndSlots(startStr);
          const firstEnd = newEndSlots.length > 0 ? newEndSlots[0] : ((h * 60 + m + 15) % 1440);
          const endStr = String(Math.floor(firstEnd / 60)).padStart(2, '0') + ':' + String(firstEnd % 60).padStart(2, '0');
          setTaskForm(prev => ({ ...prev, scheduledTime: startStr, endTime: endStr }));
        };

        const handleStartMinChange = (m) => {
          const startStr = String(selStartH).padStart(2, '0') + ':' + String(m).padStart(2, '0');
          const newEndSlots = getEndSlots(startStr);
          const firstEnd = newEndSlots.length > 0 ? newEndSlots[0] : ((selStartH * 60 + m + 15) % 1440);
          const endStr = String(Math.floor(firstEnd / 60)).padStart(2, '0') + ':' + String(firstEnd % 60).padStart(2, '0');
          setTaskForm(prev => ({ ...prev, scheduledTime: startStr, endTime: endStr }));
        };

        const handleEndHourChange = (h) => {
          const minsForH = endSlots.filter(m => Math.floor(m / 60) === h).map(m => m % 60).sort((a, b) => a - b);
          const m = minsForH.includes(selEndM) ? selEndM : (minsForH[0] ?? 0);
          setTaskForm(prev => ({ ...prev, endTime: String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0') }));
        };

        const handleEndMinChange = (m) => {
          setTaskForm(prev => ({ ...prev, endTime: String(selEndH).padStart(2, '0') + ':' + String(m).padStart(2, '0') }));
        };

        return (
          <div className="modal-overlay">
            <div className="modal-content task-modal-content">
              <div className="modal-header">
                <span className="modal-title">{taskModal.mode === 'add' ? t('modal.addTitle') : t('modal.editTitle')}</span>
                <button className="btn-task-action" onClick={() => setTaskModal(prev => ({ ...prev, open: false }))}><X size={18} /></button>
              </div>
              <form onSubmit={handleTaskSubmit}>
                <div className="modal-body">

                  {/* Task name */}
                  <div className="form-group">
                    <label className="form-label">{t('modal.taskName')}</label>
                    <input className="form-input" type="text" dir="auto" value={taskForm.name}
                      onChange={e => setTaskForm(prev => ({ ...prev, name: e.target.value }))} required autoFocus />
                  </div>

                  {/* Period */}
                  <div className="form-group">
                    <label className="form-label">{t('modal.timeOfDay')}</label>
                    <select className="form-select" value={taskForm.period} onChange={e => handlePeriodChange(e.target.value)}>
                      {getPlannerPeriodOrder().map(key => (
                        <option key={key} value={key}>{t('period.' + key)} — {t('period.' + key + 'Range')}</option>
                      ))}
                    </select>
                  </div>

                  {/* Start + End time pickers */}
                  <div className="form-row">
                    {/* Start time */}
                    <div className="form-group">
                      <label className="form-label">{t('modal.startTime')}</label>
                      {startSlots.length === 0 ? (
                        <div className="form-input tm-disabled">{t('modal.noSlots') || 'No slots'}</div>
                      ) : (
                        <div className="tm-picker">
                          <select className="tm-select" value={selStartH} onChange={e => handleStartHourChange(Number(e.target.value))}>
                            {startHours.map(h => (
                              <option key={h} value={h}>{fmtH(h)}</option>
                            ))}
                          </select>
                          <span className="tm-colon">:</span>
                          <select className="tm-select" value={selStartM} onChange={e => handleStartMinChange(Number(e.target.value))}>
                            {startMinsForHour.map(m => (
                              <option key={m} value={m}>{String(m).padStart(2, '0')}</option>
                            ))}
                          </select>
                          {use12 && <span className="tm-ampm">{ampm(selStartH)}</span>}
                        </div>
                      )}
                    </div>

                    {/* End time */}
                    <div className="form-group">
                      <label className="form-label">{t('modal.endTime')}</label>
                      {endSlots.length === 0 ? (
                        <div className="form-input tm-disabled">{t('modal.noSlots') || 'No slots'}</div>
                      ) : (
                        <div className="tm-picker">
                          <select className="tm-select" value={selEndH} onChange={e => handleEndHourChange(Number(e.target.value))}>
                            {endHours.map(h => (
                              <option key={h} value={h}>{fmtH(h)}</option>
                            ))}
                          </select>
                          <span className="tm-colon">:</span>
                          <select className="tm-select" value={selEndM} onChange={e => handleEndMinChange(Number(e.target.value))}>
                            {endMinsForHour.map(m => (
                              <option key={m} value={m}>{String(m).padStart(2, '0')}</option>
                            ))}
                          </select>
                          {use12 && <span className="tm-ampm">{ampm(selEndH)}</span>}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Live duration badge */}
                  {liveDuration > 0 && (
                    <div className="tm-duration-row">
                      <span className="tm-duration-badge">
                        {translateDuration(liveDuration)}
                      </span>
                    </div>
                  )}

                  {/* Recurring toggle */}
                  <div className="form-group tm-recurring-row">
                    <label className="tm-recurring-label">
                      <input type="checkbox" checked={taskForm.isRecurring}
                        onChange={e => setTaskForm(prev => ({ ...prev, isRecurring: e.target.checked }))} />
                      <span>{t('modal.recurring') || 'Recurring task'}</span>
                    </label>
                  </div>

                </div>
                <div className="modal-footer">
                  <button type="button" className="btn" onClick={() => setTaskModal(prev => ({ ...prev, open: false }))}>{t('modal.cancel')}</button>
                  <button type="submit" className="btn btn-primary">{taskModal.mode === 'add' ? t('modal.create') : t('modal.save')}</button>
                </div>
              </form>
            </div>
          </div>
        );
      })()}

      {/* Habit Modal */}
      {habitModal.open && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <span className="modal-title">{habitModal.mode === 'add' ? t('habits.add') : t('habits.edit')}</span>
              <button className="btn-task-action" onClick={() => setHabitModal(prev => ({ ...prev, open: false }))}><X size={18} /></button>
            </div>
            <form onSubmit={e => {
              e.preventDefault();
              if (!habitForm.name.trim()) return;
              if (habitModal.mode === 'add') addHabit(habitForm.name);
              else setHabits(prev => prev.map(h => h.id === habitModal.habit.id ? { ...h, name: habitForm.name.trim() } : h));
              setHabitModal({ open: false, mode: 'add', habit: null });
            }}>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label">{t('habits.name')}</label>
                  <input className="form-input" type="text" value={habitForm.name} onChange={e => setHabitForm(prev => ({ ...prev, name: e.target.value }))} required autoFocus />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn" onClick={() => setHabitModal(prev => ({ ...prev, open: false }))}>{t('habits.cancel')}</button>
                <button type="submit" className="btn btn-primary">{habitModal.mode === 'add' ? t('habits.create') : t('habits.save')}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Welcome Modal */}
      {showWelcome && (
        <div className="dialog-overlay">
          <div className="welcome-modal" onClick={e => e.stopPropagation()}>
            <div className="welcome-modal-icon">
              <Sparkles size={28} />
            </div>
            <h2 className="welcome-modal-title">{t('welcome.title')}</h2>
            <p className="welcome-modal-desc">{t('welcome.desc')}</p>
            <div className="welcome-modal-links">
              <button className="welcome-modal-link" onClick={() => { setCurrentPage('settings'); dismissWelcome(); }}>
                <Settings size={16} /> {t('welcome.settings')}
              </button>
              <button className="welcome-modal-link" onClick={() => { setCurrentPage('guide'); dismissWelcome(); }}>
                <HelpCircle size={16} /> {t('welcome.guide')}
              </button>
            </div>
            <button className="btn btn-primary welcome-modal-ok" onClick={dismissWelcome}>
              {t('welcome.ok')}
            </button>
          </div>
        </div>
      )}

      {/* Notification Prompt */}
      {showNotifPrompt && !showWelcome && (
        <div className="dialog-overlay">
          <div className="welcome-modal" onClick={e => e.stopPropagation()}>
            <div className="welcome-modal-icon">
              <Bell size={28} />
            </div>
            <h2 className="welcome-modal-title">{t('notif.promptTitle')}</h2>
            <p className="welcome-modal-desc">{t('notif.promptDesc')}</p>
            <div className="welcome-modal-links" style={{ marginTop: 12 }}>
              <button className="welcome-modal-link" onClick={() => { setCurrentPage('settings'); dismissNotifPrompt(); }}>
                <Settings size={16} /> {t('notif.goToSettings')}
              </button>
            </div>
            <div className="welcome-modal-actions">
              <button className="btn" onClick={dismissNotifPrompt} style={{ flex: 1 }}>
                {t('notif.later')}
              </button>
              <button className="btn btn-primary" onClick={enableNotifications} style={{ flex: 1 }}>
                {t('notif.enable')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Notification Status Modal */}
      {showNotifStatus && (
        <div className="dialog-overlay" onClick={() => setShowNotifStatus(false)}>
          <div className="dialog-content" onClick={e => e.stopPropagation()}>
            {typeof Notification !== 'undefined' && Notification.permission === 'granted' ? (
              <>
                <div className="notif-status-modal-icon enabled">
                  <Bell size={28} />
                </div>
                <h3 className="notif-status-title">{t('settings.notifEnabledTitle')}</h3>
                <p className="dialog-message">{t('settings.notifEnabledDesc')}</p>
              </>
            ) : (
              <>
                <div className="notif-status-modal-icon disabled">
                  <Bell size={28} />
                </div>
                <h3 className="notif-status-title">{t('settings.notifDisabledTitle')}</h3>
                <p className="dialog-message">{t('settings.notifDisabledDesc')}</p>
                <div className="dialog-actions" style={{ marginTop: 16 }}>
                  <button className="btn" onClick={() => setShowNotifStatus(false)}>
                    {t('dialog.cancel')}
                  </button>
                  <button className="btn btn-primary" onClick={() => { enableNotifications(); setShowNotifStatus(false); }}>
                    <Bell size={16} /> {t('settings.notifEnable')}
                  </button>
                </div>
              </>
            )}
            {typeof Notification !== 'undefined' && Notification.permission === 'granted' && (
              <div className="dialog-actions" style={{ marginTop: 16 }}>
                <button className="btn btn-primary" onClick={() => setShowNotifStatus(false)}>
                  {t('dialog.ok')}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Prayer Time Notification */}
      {prayerNotif && (
        <div className="dialog-overlay">
          <div className="prayer-notif" onClick={e => e.stopPropagation()}>
            <div className="prayer-notif-icon">ﷲ</div>
            <h2 className="prayer-notif-title">{t('prayerNotif.title')}</h2>
            <p className="prayer-notif-text">{t('prayerNotif.text')}</p>
            <button className="btn btn-primary prayer-notif-ok" onClick={dismissPrayerNotif}>
              {t('prayerNotif.ok')}
            </button>
          </div>
        </div>
      )}

      {/* Custom Dialog */}
      {dialog && (
        <div className="dialog-overlay" onClick={() => { if (dialog.type === 'alert') closeDialog(); }}>
          <div className="dialog-content" onClick={e => e.stopPropagation()}>
            <p className="dialog-message">{dialog.message}</p>
            <div className="dialog-actions">
              {dialog.type === 'confirm' && (
                <button className="btn" onClick={() => closeDialog(false)}>{t('dialog.cancel')}</button>
              )}
              <button className="btn btn-primary" onClick={() => closeDialog(dialog.type === 'confirm')}>
                {dialog.type === 'confirm' ? t('dialog.confirm') : t('dialog.ok')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Error Log Modal */}
      {errorModalOpen && (
        <div className="modal-overlay" onClick={() => setErrorModalOpen(false)}>
          <div className="modal-content error-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">{t('footer.errorLog')}</span>
              <button className="btn btn-icon" onClick={() => setErrorModalOpen(false)}><X size={18} /></button>
            </div>
            <div className="modal-body error-modal-body">
              {errorLog.length === 0 ? (
                <p className="empty-state-title">{t('footer.noErrors')}</p>
              ) : (
                errorLog.map(err => (
                  <div key={err.id} className="error-log-entry">
                    <span className="error-log-time">{err.time}</span>
                    <span className="error-log-source">{err.source}</span>
                    <span className="error-log-msg">{err.message}</span>
                  </div>
                ))
              )}
            </div>
            <div className="modal-footer">
              <button className="btn" onClick={() => { setErrorLog([]); setErrorModalOpen(false); }}>{t('footer.clearErrors')}</button>
              <button className="btn btn-primary" onClick={() => setErrorModalOpen(false)}>{t('dialog.ok')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )}
export default App;
