import { useState, useEffect, useRef } from 'react';
import {
  Check, Plus, Minus, Edit2, Trash2, Settings, Moon, Sun,
  BookOpen, Clock, Sparkles, MapPin, X, AlertCircle,
  ChevronUp, ChevronDown, RefreshCw, Download, HelpCircle, List, Type, Menu, Target,
  Smartphone, Lock, Unlock, Upload, Search, Zap, Activity,
  TrendingUp, BarChart3, Flame, CalendarDays, PenLine, Heart, Coffee
} from 'lucide-react';
import confetti from 'canvas-confetti';
import {
  formatDateLocal, addDays, getPrayerTimesForDate,
  getLogicalPlannerDate, getCompiledPrayersForPlannerDate,
  ensurePrayerTimesCached, FIXED_TASKS_TEMPLATES,
  calculateTimelineStatus, PERIODS_META, savePrayerCache, getPrayerCache,
  getPeriodStartMinutes, getPeriodEndMinutes, formatDurationHours,
  PLANNER_PERIOD_ORDER, getDefaultTimeForPeriod, getCurrentPlannerMinutes,
   getTaskDisplayTime, sortTasksForPlannerDay, scheduledTimeToPlannerMinutes,
  formatMinutesToTime, setUse12h, getUse12h, parseTimeToMinutes
} from './utils/prayerService';

import { t, setLanguage, getLanguage, translateTaskName } from './i18n';

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

  // ---- Location Config ----
  const [locationConfig, setLocationConfig] = useState(() => {
    const saved = localStorage.getItem('tarteeb_location_config');
    const defaults = { enabled: true, type: 'city', city: 'Cairo', country: 'Egypt', latitude: '30.0444', longitude: '31.2357' };
    return saved ? { ...defaults, ...JSON.parse(saved), enabled: true } : defaults;
  });

  // ---- Planner Date & Data ----
  const [activeDate, setActiveDate] = useState(() => getLogicalPlannerDate(new Date()));
  const [dayData, setDayData] = useState(null);

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
    setPrayerTracking(prev => {
      const current = prev[dateStr]?.[prayerKey] || 'pending';
      const idx = PRAYER_STATUSES.indexOf(current);
      const next = PRAYER_STATUSES[(idx + 1) % PRAYER_STATUSES.length];
      return { ...prev, [dateStr]: { ...(prev[dateStr] || {}), [prayerKey]: next } };
    });
  };

  // ---- Mood Tracker ----
  const MOODS = ['happy', 'grateful', 'peaceful', 'energetic', 'tired', 'stressed', 'anxious', 'sad'];
  const MOOD_EMOJIS = { happy: '😊', grateful: '🤲', peaceful: '🕊️', energetic: '⚡', tired: '😴', stressed: '😰', anxious: '😟', sad: '😢' };

  // ---- Task search ----
  const [taskSearch, setTaskSearch] = useState('');

  // ---- Toast notifications ----
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);
  const showToast = (message, action = null, duration = 4000) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ message, action, key: Date.now() });
    toastTimer.current = setTimeout(() => {
      setToast(null);
      toastTimer.current = null;
    }, duration);
  };
  const dismissToast = () => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(null);
    toastTimer.current = null;
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

  // ---- Auto-cleanup old data (older than previous day) ----
  useEffect(() => {
    const today = formatDateLocal(new Date());
    const yesterday = formatDateLocal(addDays(new Date(), -1));
    const keepKeys = new Set([`tarteeb_day_${today}`, `tarteeb_day_${yesterday}`]);
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('tarteeb_day_') && !keepKeys.has(key)) {
        localStorage.removeItem(key);
      }
    }
    const saved = localStorage.getItem(`tarteeb_day_${yesterday}`);
    if (saved) {
      const parsed = JSON.parse(saved);
      setPrevDayData(prev => {
        if (JSON.stringify(prev) === JSON.stringify(parsed)) return prev;
        return parsed;
      });
    }
  }, []);


  const dismissWelcome = () => {
    localStorage.setItem('tarteeb_welcome_dismissed', 'true');
    setShowWelcome(false);
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

  // ---- Keyboard Shortcuts ----
  useEffect(() => {
    function handleKeyDown(e) {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;
      if (taskModal.open || habitModal.open || dialog || showWelcome || prayerNotif) {
        if (e.key === 'Escape') {
          if (taskModal.open) setTaskModal(prev => ({ ...prev, open: false }));
          else if (habitModal.open) setHabitModal(prev => ({ ...prev, open: false }));
          else if (dialog && dialog.type === 'alert') closeDialog();
          else if (showWelcome) dismissWelcome();
          else if (prayerNotif) dismissPrayerNotif();
        }
        return;
      }
      if (e.key === 'h') setCurrentPage('home');
      else if (e.key === 't') setCurrentPage('tasks');
      else if (e.key === 'j') setCurrentPage('journal');
      else if (e.key === 'g') setCurrentPage('guide');
      else if (e.key === 's') setCurrentPage('settings');
      else if (e.key === 'b') setCurrentPage('habits');
      else if (e.key === 'l') setCurrentPage('sleep');
      else if (e.key === 'd') setCurrentPage('drinks');
      else if (e.key === 'p') setCurrentPage('prayers');
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
      }
      if (!prayerNotif) {
        lastActivePeriod.current = status.activePeriod;
      }
    }
  }, [currentTime, dayData, activeDate, prayerNotif]);

  // ---- Auto-scroll to current time line (once) ----
  const hasScrolledRef = useRef(false);
  useEffect(() => {
    if (currentPage !== 'home' || !dayData || hasScrolledRef.current) return;
    hasScrolledRef.current = true;
    requestAnimationFrame(() => {
      const container = document.querySelector('.content-area');
      const el = document.querySelector('.timeline-now-line');
      if (el && container) {
        const containerRect = container.getBoundingClientRect();
        const elRect = el.getBoundingClientRect();
        container.scrollTop = elRect.top - containerRect.top + container.scrollTop - containerRect.height / 2;
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
    const task = dayData?.tasks.find(t => t.id === id);
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
    PLANNER_PERIOD_ORDER.forEach(periodKey => {
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

    const todayHabits = habits.filter(h => h.entries?.[date] !== undefined);
    const completedHabits = todayHabits.filter(h => h.entries?.[date]?.completed).length;
    const notes = studyNotes || [];
    const streak = computeStreak();

    const statusEmoji = { completed: '✅', not_completed: '❌', pending: '—' };
    const prayerOrder = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'];

    // ---- Build ----
    lines.push(`# 📅 ${title}`);
    lines.push('');
    if (hijriDate) lines.push(`> ${hijriDate}`);
    lines.push('');
    lines.push('---');
    lines.push('');

    // Daily Overview
    lines.push('## 🌅 ' + t('export.dailyOverview'));
    lines.push('');
    lines.push('> [!abstract]+ ' + t('export.dayAtGlance'));
    lines.push(`> - **${t('export.tasks')}**: ${completed}/${total} (${overallPct}%) - [${completed} ✅ | ${notCompleted} ❌ | ${pending} ⏳]`);
    lines.push(`> - **${t('export.fixedTasks')}**: ${fixedPct}% | **${t('export.personalTasks')}**: ${personalPct}%`);
    lines.push(`> - **${t('export.prayersOnTime')}**: ${onTime}/5`);
    lines.push(`> - **${t('export.streak')}**: ${streak} ${lang === 'ar' ? 'أيام' : 'days'}`);
    if (mood) {
      const emoji = MOOD_EMOJIS[mood] || '';
      const moodLabel = t('mood.' + mood);
      lines.push(`> - **${t('mood.title')}**: ${emoji} ${moodLabel}`);
    }
    lines.push('');

    // Prayer Times
    lines.push('---');
    lines.push('');
    lines.push('## 🕌 ' + t('export.prayerTimes'));
    lines.push('');
    lines.push('| ' + t('export.prayer') + ' | ' + t('export.time') + ' | ' + t('export.status') + ' |');
    lines.push('|' + (lang === 'ar' ? ':----|:----:|:----:' : '--------|:----:|--------') + '|');
    prayerOrder.forEach(pk => {
      const time = prayerTimes?.[pk] || '—';
      const status = todayTrack[pk] || 'pending';
      const emoji = statusEmoji[status] || '—';
      const label = t(status === 'pending' ? 'tasks.statusPending' : (status === 'completed' ? 'tasks.statusCompleted' : 'tasks.statusNotCompleted'));
      const prayerLabel = t('prayer.' + pk);
      lines.push(`| ${prayerLabel} | ${time} | ${emoji} ${label} |`);
    });
    lines.push('');

    // Adhkar
    lines.push('---');
    lines.push('');
    lines.push('## 📿 ' + t('adhkar.title'));
    lines.push('');
    const adhkarM = todayTrack['adhkar_morning'] || 'pending';
    const adhkarE = todayTrack['adhkar_evening'] || 'pending';
    const adhkarM_label = t(adhkarM === 'pending' ? 'tasks.statusPending' : (adhkarM === 'completed' ? 'tasks.statusCompleted' : 'tasks.statusNotCompleted'));
    const adhkarE_label = t(adhkarE === 'pending' ? 'tasks.statusPending' : (adhkarE === 'completed' ? 'tasks.statusCompleted' : 'tasks.statusNotCompleted'));
    lines.push(`> - **${t('adhkar.morning')}**: ${statusEmoji[adhkarM]} ${adhkarM_label}`);
    lines.push(`> - **${t('adhkar.evening')}**: ${statusEmoji[adhkarE]} ${adhkarE_label}`);
    lines.push('');

    // Tasks
    lines.push('---');
    lines.push('');
    lines.push('## ✅ ' + t('export.tasks'));
    lines.push('');

    if (completedTasksList.length > 0) {
      lines.push('> [!success]- ' + t('tasks.statusCompleted'));
      lines.push('>');
      completedTasksList.forEach(t => {
        const time = getTaskDisplayTime(t, prayerTimes);
        const end = t.type === 'personal' || t.type === 'user'
          ? ` – ${formatMinutesToTime(getTaskStartMinutes(t, prayerTimes) + (Number(t.duration) || 15))}`
          : '';
        lines.push(`> - [x] **${translateTaskName(t.name)}** — ${time}${end}`);
        if (t.details) lines.push(`>   - ${t.details}`);
      });
      lines.push('');
    }

    if (notCompletedTasksList.length > 0) {
      lines.push('> [!fail]- ' + t('tasks.statusNotCompleted'));
      lines.push('>');
      notCompletedTasksList.forEach(t => {
        const time = getTaskDisplayTime(t, prayerTimes);
        const end = t.type === 'personal' || t.type === 'user'
          ? ` – ${formatMinutesToTime(getTaskStartMinutes(t, prayerTimes) + (Number(t.duration) || 15))}`
          : '';
        lines.push(`> - [x] ~~**${translateTaskName(t.name)}**~~ — ${time}${end} (❌)`);
        if (t.details) lines.push(`>   - ${t.details}`);
      });
      lines.push('');
    }

    if (pendingTasksList.length > 0) {
      lines.push('> [!todo]- ' + t('tasks.statusPending'));
      lines.push('>');
      pendingTasksList.forEach(t => {
        const time = getTaskDisplayTime(t, prayerTimes);
        const end = t.type === 'personal' || t.type === 'user'
          ? ` – ${formatMinutesToTime(getTaskStartMinutes(t, prayerTimes) + (Number(t.duration) || 15))}`
          : '';
        lines.push(`> - [ ] **${translateTaskName(t.name)}** — ${time}${end}`);
        if (t.details) lines.push(`>   - ${t.details}`);
      });
      lines.push('');
    }

    // Task breakdown by period
    if (total > 0) {
      const periodStats = PLANNER_PERIOD_ORDER.map(pk => {
        const pt = allTasks.filter(t => t.period === pk);
        if (pt.length === 0) return null;
        const d = pt.filter(t => t.status === 'completed' || t.completed).length;
        return { pk, name: t('period.' + pk), range: (PERIODS_META[pk]?.range || ''), done: d, total: pt.length, pct: Math.round((d / pt.length) * 100) };
      }).filter(Boolean);

      if (periodStats.length > 0) {
        lines.push('> [!summary]- ' + t('export.taskBreakdown'));
        lines.push('>');
        lines.push('> | ' + t('export.period') + ' | ' + t('export.doneTotal') + ' | ' + t('export.progress') + ' |');
        lines.push('> |' + (lang === 'ar' ? ':----|:----------:|:--------:' : '--------|:----------:|:--------:') + '|');
        periodStats.forEach(ps => {
          const bar = '█'.repeat(Math.round(ps.pct / 10)) + '░'.repeat(10 - Math.round(ps.pct / 10));
          lines.push(`> | ${ps.name} | ${ps.done}/${ps.total} | ${bar} ${ps.pct}% |`);
        });
        lines.push('');
      }
    }

    // Study Notes
    if (notes.length > 0) {
      lines.push('---');
      lines.push('');
      lines.push('## 📝 ' + t('journal.studyNotes'));
      lines.push('');
      PLANNER_PERIOD_ORDER.forEach(pk => {
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
    if (todayHabits.length > 0) {
      lines.push('---');
      lines.push('');
      lines.push('## 🏆 ' + t('habits.title'));
      lines.push('');
      lines.push('> [!example]+ ' + t('export.todaysHabits'));
      lines.push('>');
      todayHabits.forEach(h => {
        const done = h.entries?.[date]?.completed;
        lines.push('> - ' + (done ? '✅' : '❌') + ' **' + h.name + '**');
      });
      if (completedHabits > 0) {
        lines.push('>');
        lines.push('> _' + completedHabits + '/' + todayHabits.length + ' ' + t('export.habitsDone') + '_');
      }
      lines.push('');
    }

    // Sleep Data
    const dateSessions = sleepTracking[date] || [];
    if (dateSessions.length > 0) {
      const totalSleepHours = dateSessions.reduce((sum, s) => sum + calcSleepHours(s.start, s.end), 0);
      lines.push('---');
      lines.push('');
      lines.push('## 🌙 ' + t('sleep.title'));
      lines.push('');
      lines.push('| ' + t('sleep.session') + ' | ' + t('sleep.startTime') + ' | ' + t('sleep.endTime') + ' | ' + t('sleep.hours') + ' |');
      lines.push('|' + (lang === 'ar' ? ':----|:----:|:----:|:----:' : '--------|:----:|:----:|:----:') + '|');
      dateSessions.forEach((s, i) => {
        lines.push(`| #${i + 1} | ${s.start} | ${s.end} | ${calcSleepHours(s.start, s.end)} |`);
      });
      lines.push('| **' + t('sleep.totalSleep') + '** | | | **' + totalSleepHours + ' ' + t('sleep.hours') + '** |');
      lines.push('');
    }

    // Drinks Data
    const dateDrinks = drinksTracking[date] || [];
    if (dateDrinks.length > 0) {
      const totalDrinks = dateDrinks.reduce((sum, d) => sum + d.count, 0);
      lines.push('---');
      lines.push('');
      lines.push('## 🥤 ' + t('drinks.title'));
      lines.push('');
      lines.push('| ' + t('drinks.drink') + ' | ' + t('drinks.count') + ' |');
      lines.push('|' + (lang === 'ar' ? ':----|:---:' : '--------|---:') + '|');
      dateDrinks.forEach(d => {
        lines.push(`| ${d.name || t('drinks.drink')} | ${d.count} |`);
      });
      lines.push('| **' + t('drinks.total') + '** | **' + totalDrinks + '** |');
      lines.push('');
    }

    // Journal
    if (diary) {
      lines.push('---');
      lines.push('');
      lines.push('## 📓 ' + (lang === 'ar' ? 'المذكرات' : 'Journal'));
      lines.push('');
      lines.push('> [!quote] ' + t('export.dailyReflection'));
      lines.push('>');
      diary.split('\n').forEach(l => lines.push('> ' + l));
      lines.push('');
    }

    // Summary
    lines.push('---');
    lines.push('');
    lines.push('## 📊 ' + t('export.summary'));
    lines.push('');
    lines.push('| ' + t('export.metric') + ' | ' + t('export.value') + ' |');
    lines.push('|' + (lang === 'ar' ? ':----|:-----:' : '--------|:-----:') + '|');
    lines.push('| ' + t('export.tasksCompleted') + ' | ' + completed + '/' + total + ' (' + overallPct + '%) |');
    lines.push('| ' + t('tasks.statusNotCompleted') + ' | ' + notCompleted + '/' + total + ' |');
    lines.push('| ' + t('tasks.statusPending') + ' | ' + pending + '/' + total + ' |');
    lines.push('| ' + t('export.fixedTasks') + ' | ' + fixedPct + '% |');
    lines.push('| ' + t('export.personalTasks') + ' | ' + personalPct + '% |');
    lines.push('| ' + t('export.prayersOnTime') + ' | ' + onTime + '/5 |');
    if (todayHabits.length > 0) lines.push('| ' + t('export.habitsDone') + ' | ' + completedHabits + '/' + todayHabits.length + ' |');
    if (notes.length > 0) lines.push('| ' + t('journal.studyNotes') + ' | ' + notes.length + ' |');
    const sleepSessionsSum = sleepTracking[date] || [];
    if (sleepSessionsSum.length > 0) {
      const totalSleepHours = sleepSessionsSum.reduce((sum, s) => sum + calcSleepHours(s.start, s.end), 0);
      lines.push('| ' + t('sleep.totalSleep') + ' | ' + totalSleepHours + ' ' + t('sleep.hours') + ' |');
    }
    const dateDrinksSum = drinksTracking[date] || [];
    if (dateDrinksSum.length > 0) {
      const totalDrinksSum = dateDrinksSum.reduce((sum, d) => sum + d.count, 0);
      lines.push('| ' + t('drinks.total') + ' | ' + totalDrinksSum + ' |');
    }
    lines.push('| ' + t('export.streak') + ' | ' + streak + ' ' + (lang === 'ar' ? 'أيام' : 'days') + ' |');
    if (mood) {
      lines.push('| ' + t('mood.title') + ' | ' + (MOOD_EMOJIS[mood] || '') + ' ' + t('mood.' + mood) + ' |');
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
    const dayStart = getPeriodStartMinutes('evening', prayers);
    const dayEnd = getPeriodEndMinutes('late_afternoon', prayers);
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
    const markers = [
      { key: 'maghrib_start', prayer: 'Maghrib', time: prayers.maghrib, minutes: dayStart },
      { key: 'isha', prayer: 'Isha', time: prayers.isha, minutes: getPeriodStartMinutes('night', prayers) },
      { key: 'fajr', prayer: 'Fajr', time: prayers.fajr, minutes: getPeriodStartMinutes('morning', prayers) },
      { key: 'dhuhr', prayer: 'Dhuhr', time: prayers.dhuhr, minutes: getPeriodStartMinutes('afternoon', prayers) },
      { key: 'asr', prayer: 'Asr', time: prayers.asr, minutes: getPeriodStartMinutes('late_afternoon', prayers) },
      { key: 'maghrib_end', prayer: 'Maghrib', time: prayers.maghrib, minutes: dayEnd }
    ];
    const periodBands = [
      { key: 'night-band', label: t('band.night'), start: dayStart, end: getPeriodStartMinutes('morning', prayers) },
      { key: 'day-band', label: t('band.day'), start: getPeriodStartMinutes('morning', prayers), end: dayEnd }
    ];
    const formatTimelineTick = (minutes, exact = false) => {
      const normalized = ((minutes % 1440) + 1440) % 1440;
      const hour = Math.floor(normalized / 60);
      const minute = normalized % 60;
      if (getUse12h()) {
        const period = hour < 12 ? t('time.am') : t('time.pm');
        const h12 = hour % 12 || 12;
        const time = exact || minute !== 0 ? `${h12}:${String(minute).padStart(2, '0')}` : `${h12}`;
        return `${time} ${period}`;
      }
      return exact || minute !== 0 ? `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}` : `${hour}`;
    };
    const hourTicks = [
      { key: 'start', label: formatTimelineTick(dayStart, true), minutes: dayStart },
      ...Array.from(
        { length: Math.max(0, Math.floor(dayEnd / 60) - Math.ceil(dayStart / 60) + 1) },
        (_, index) => {
          const minutes = (Math.ceil(dayStart / 60) + index) * 60;
          return { key: `hour-${minutes}`, label: formatTimelineTick(minutes), minutes };
        }
      ).filter(tick => tick.minutes > dayStart && tick.minutes < dayEnd),
      { key: 'end', label: formatTimelineTick(dayEnd, true), minutes: dayEnd }
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
                <span key={tick.key} style={{ top: `${toPercent(tick.minutes)}%` }}>
                  {tick.label}
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
                    className="timeline-prayer-marker"
                    style={{ top: `${toPercent(marker.minutes)}%` }}
                    aria-label={`${t('prayer.' + marker.prayer.toLowerCase())} ${t('prayer.boundary')}`}
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
                        <span className="timeline-task-duration-badge">{duration}m</span>
                      </span>
                      <span
                        className="timeline-task-name"
                        onClick={e => { e.stopPropagation(); if (task.type !== 'fixed') openTaskModal('edit', task); }}
                      >
                        {translateTaskName(task.name)}
                      </span>
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

  // ---- Pulse Dashboard (Today-Focused) ----
  const renderPulseDashboard = () => {
    const todayStr = activeDate;
    const streak = computeStreak();

    if (!dayData) {
      return (
        <div className="new-pulse-page">
          <div className="new-pulse-header-wrap">
            <div className="new-pulse-header-main">
              <Activity size={28} className="new-pulse-icon" />
              <div>
                <h2 className="new-pulse-title">{t('pulse.title')}</h2>
                <p className="new-pulse-subtitle">{t('pulse.subtitle')}</p>
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

    const notes = dayData.studyNotes || [];
    const hasNotes = notes.length > 0;

    // Group tasks by period for breakdown
    const tasksByPeriod = {};
    PLANNER_PERIOD_ORDER.forEach(pk => {
      const periodTasks = allTasks.filter(t => t.period === pk);
      if (periodTasks.length > 0) {
        const done = periodTasks.filter(t => t.status === 'completed' || t.completed).length;
        tasksByPeriod[pk] = { tasks: periodTasks, total: periodTasks.length, done };
      }
    });

    const STATUS_COLORS = { completed: 'var(--color-emerald)', not_completed: 'var(--color-danger)', pending: 'var(--text-tertiary)' };

    return (
      <div className="new-pulse-page">
        {/* Header */}
        <div className="new-pulse-header-wrap">
          <div className="new-pulse-header-main">
            <Activity size={28} className="new-pulse-icon" />
            <div>
              <h2 className="new-pulse-title">{t('pulse.title')}</h2>
              <p className="new-pulse-subtitle">{t('pulse.subtitle')}</p>
            </div>
          </div>
          <div className="new-pulse-date">
            <span className="date-gregorian">{formatHumanDate(todayStr)}</span>
            {dayData.hijriDate && <span className="date-hijri">{dayData.hijriDate}</span>}
          </div>
        </div>

        {/* Top Overview Cards */}
        <div className="new-pulse-overview-grid">
          {/* Tasks Overview */}
          <div className="new-pulse-card overview-tasks">
             <div className="overview-icon"><List size={20} /></div>
             <div className="overview-data">
               <h3>{t('pulse.tasksDone')}</h3>
               <div className="overview-value">{completedTasks} <span>/ {totalTasks}</span></div>
               <div className="overview-sub">
                 <span className="sub-tag tag-pending">{pendingTasks} {t('tasks.statusPending')}</span>
                 <span className="sub-tag tag-missed">{notCompletedTasks} {t('tasks.statusNotCompleted')}</span>
               </div>
             </div>
          </div>
          
          {/* Habits Overview */}
          <div className="new-pulse-card overview-habits">
             <div className="overview-icon"><Target size={20} /></div>
             <div className="overview-data">
               <h3>{t('pulse.habitsToday')}</h3>
               <div className="overview-value">{completedHabits} <span>/ {totalHabits}</span></div>
               <div className="overview-sub">
                 <span className="sub-tag tag-pending">{pendingHabits} {t('tasks.statusPending')}</span>
               </div>
             </div>
          </div>

          {/* Prayers Overview */}
          <div className="new-pulse-card overview-prayers">
             <div className="overview-icon"><Clock size={20} /></div>
             <div className="overview-data">
                <h3>{t('pulse.prayerStatus')}</h3>
                <div className="overview-value">{onTimePrayers} <span>/ 5</span></div>
                <div className="overview-sub pulse-metric-dots">
                  {PRAYER_KEYS.map(pk => {
                    const status = prayerTaskStatuses[pk] || 'pending';
                    return <span key={pk} className="pulse-dot" style={{ background: STATUS_COLORS[status] }} title={t('prayer.' + pk)} />
                  })}
                </div>
             </div>
          </div>

          {/* Streak Overview */}
          <div className="new-pulse-card overview-streak">
             <div className="overview-icon"><Flame size={20} /></div>
             <div className="overview-data">
               <h3>{t('streak.title')}</h3>
               <div className="overview-value">{streak} <span>{t('streak.days')}</span></div>
               <div className="overview-sub">
                 <span className="sub-tag tag-streak">{overallPct}% {t('pulse.completionRate')}</span>
               </div>
             </div>
          </div>
        </div>

        <div className="new-pulse-content-grid">
          {/* Detailed Task Analysis */}
          <div className="new-pulse-card detail-tasks">
            <div className="new-pulse-card-header">
              <BarChart3 size={18} />
              <h4>{t('pulse.taskBreakdown')}</h4>
            </div>
            
            <div className="task-status-bars">
              <div className="status-bar-row">
                <span className="status-label">{t('tasks.statusCompleted')}</span>
                <div className="status-track"><div className="status-fill completed" style={{width: totalTasks ? `${(completedTasks/totalTasks)*100}%` : '0%'}}></div></div>
                <span className="status-count">{completedTasks}</span>
              </div>
              <div className="status-bar-row">
                <span className="status-label">{t('tasks.statusPending')}</span>
                <div className="status-track"><div className="status-fill pending" style={{width: totalTasks ? `${(pendingTasks/totalTasks)*100}%` : '0%'}}></div></div>
                <span className="status-count">{pendingTasks}</span>
              </div>
              <div className="status-bar-row">
                <span className="status-label">{t('tasks.statusNotCompleted')}</span>
                <div className="status-track"><div className="status-fill not-completed" style={{width: totalTasks ? `${(notCompletedTasks/totalTasks)*100}%` : '0%'}}></div></div>
                <span className="status-count">{notCompletedTasks}</span>
              </div>
            </div>

            <div className="pulse-period-breakdown new-style">
              {PLANNER_PERIOD_ORDER.filter(pk => tasksByPeriod[pk]).map(pk => {
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

          <div className="new-pulse-column-right">
             {/* Habits List View-Only */}
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

              {/* Sleep Card */}
              <div className="new-pulse-card detail-prayers">
                <div className="new-pulse-card-header">
                  <Moon size={18} />
                  <h4>{t('sleep.title')}</h4>
                </div>
                <div className="new-pulse-prayer-grid">
                  {todaySessions.length === 0 ? (
                    <span className="pulse-empty-habits">{t('sleep.noSessions')}</span>
                  ) : (
                    todaySessions.map((s, i) => (
                      <div key={s.id} className="new-pulse-prayer-box status-completed">
                        <div className="prayer-info">
                          <span className="prayer-name">{t('sleep.session')} #{i + 1}</span>
                          <span className="prayer-time">{s.start} – {s.end}</span>
                        </div>
                        <span className="prayer-status-text">
                          {calcSleepHours(s.start, s.end)} {t('sleep.hours')}
                        </span>
                      </div>
                    ))
                  )}
                  {todaySessions.length > 0 && (
                    <div className="new-pulse-prayer-box status-completed" style={{ gridColumn: '1 / -1' }}>
                      <div className="prayer-info">
                        <span className="prayer-name">{t('sleep.totalSleep')}</span>
                      </div>
                      <span className="prayer-status-text">
                        <strong>{todayTotalHours} {t('sleep.hours')}</strong>
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Drinks Card */}
              <div className="new-pulse-card detail-prayers">
                <div className="new-pulse-card-header">
                  <Coffee size={18} />
                  <h4>{t('drinks.title')}</h4>
                </div>
                <div className="new-pulse-prayer-grid">
                  {todayDrinks.length === 0 ? (
                    <span className="pulse-empty-habits">{t('drinks.noDrinks')}</span>
                  ) : (
                    todayDrinks.map(d => (
                      <div key={d.id} className="new-pulse-prayer-box status-completed">
                        <div className="prayer-info">
                          <span className="prayer-name">{d.name || t('drinks.drink')}</span>
                        </div>
                        <span className="prayer-status-text">
                          {d.count}×
                        </span>
                      </div>
                    ))
                  )}
                  {todayDrinks.length > 0 && (
                    <div className="new-pulse-prayer-box status-completed" style={{ gridColumn: '1 / -1' }}>
                      <div className="prayer-info">
                        <span className="prayer-name">{t('drinks.total')}</span>
                      </div>
                      <span className="prayer-status-text">
                        <strong>{todayDrinks.reduce((s, d) => s + d.count, 0)}</strong>
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Prayers View-Only Grid */}
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

              {/* Adhkar View-Only */}
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
 
         {/* Notes (if any) */}
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
    { id: 'prayers', label: t('nav.prayers'), icon: Clock },
    { id: 'tasks', label: t('nav.tasks'), icon: List },
    { id: 'habits', label: t('nav.habits'), icon: Target },
    { id: 'sleep', label: t('nav.sleep'), icon: Moon },
    { id: 'drinks', label: t('nav.drinks'), icon: Coffee },
    { id: 'pulse', label: t('nav.pulse'), icon: Activity },
    { id: 'journal', label: t('nav.journal'), icon: BookOpen },
    { id: 'guide', label: t('nav.guide'), icon: HelpCircle },
    { id: 'settings', label: t('nav.settings'), icon: Settings }
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
                onClick={() => { setCurrentPage(link.id); setSidebarOpen(false); }}
              >
                <span className="sidebar-link-icon"><link.icon size={17} /></span>
                <span className="sidebar-link-label">{link.label}</span>
              </button>
            ))}
          </nav>

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
          </div>

          {/* Export */}
          {dayData && (
            <div className="sidebar-export">
              <button className="sidebar-export-btn" onClick={() => exportToMarkdown()} title={t('header.exportTitle')}>
                <Download size={13} /> {t('header.exportCurrent')}
              </button>
              {prevDayData && (
                <button className="sidebar-export-btn sidebar-export-btn-prev" onClick={() => exportToMarkdown(prevDayData)} title={t('header.exportTitle')}>
                  <Download size={13} /> {t('header.exportPrevious')}
                </button>
              )}
            </div>
          )}

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
                  {PLANNER_PERIOD_ORDER.map(periodKey => {
                    const periodTasks = dayData.tasks.filter(t => t.period === periodKey && (
                      !taskSearch ||
                      t.name.toLowerCase().includes(taskSearch.toLowerCase()) ||
                      (t.details || '').toLowerCase().includes(taskSearch.toLowerCase())
                    ));
                    if (!periodTasks.length) return null;
                    
                    const done = periodTasks.filter(t => t.completed).length;
                    const pct = Math.round((done / periodTasks.length) * 100);
                    
                    return (
                      <div key={periodKey} className="new-period-section">
                        <div className="new-period-header">
                          <div className="new-period-title">
                            <span className="new-period-dot"></span>
                            <h3>{t('period.' + periodKey)}</h3>
                          </div>
                          <div className="new-period-stats">
                            <div className="new-period-progress-bar"><div style={{ width: `${pct}%` }}></div></div>
                            <span className="new-period-count">{done}/{periodTasks.length}</span>
                          </div>
                        </div>

                        <div className="new-period-task-list">
                          {periodTasks.map(task => {
                            const taskStart = getTaskStartMinutes(task, dayData.prayerTimes);
                            const taskEnd = taskStart + (Number(task.duration) || 15);
                            const currentStatus = task.status || (task.completed ? 'completed' : 'pending');
                            
                            return (
                              <div key={task.id} className={`new-task-card status-${currentStatus}`}>
                                <div className="new-task-main">
                                  <div className="new-task-content">
                                    <h4 className="new-task-title">{translateTaskName(task.name)}</h4>
                                    <div className="new-task-meta">
                                      <span className="new-task-duration">{translateDuration(Number(task.duration) || 15)}</span>
                                    </div>
                                    {task.details && (
                                      <p className="new-task-desc">{task.details}</p>
                                    )}
                                  </div>
                                  
                                  {task.type !== 'fixed' && (
                                    <div className="new-task-menu">
                                      <button onClick={() => openTaskModal('edit', task)} title={t('task.edit')}><Edit2 size={14} /></button>
                                      <button className="delete" onClick={() => deleteTask(task.id)} title={t('task.deleteAria')}><Trash2 size={14} /></button>
                                    </div>
                                  )}
                                </div>
                                
                                <div className="new-task-status-row">
                                  <button 
                                    className={`new-status-btn btn-pending ${currentStatus === 'pending' ? 'active' : ''}`}
                                    onClick={() => setTaskStatus(task.id, 'pending')}
                                  >
                                    {t('tasks.statusPending')}
                                  </button>
                                  <button 
                                    className={`new-status-btn btn-not-completed ${currentStatus === 'not_completed' ? 'active' : ''}`}
                                    onClick={() => setTaskStatus(task.id, 'not_completed')}
                                  >
                                    <X size={14} /> {t('tasks.statusNotCompleted')}
                                  </button>
                                  <button 
                                    className={`new-status-btn btn-completed ${currentStatus === 'completed' ? 'active' : ''}`}
                                    onClick={() => setTaskStatus(task.id, 'completed')}
                                  >
                                    <Check size={14} /> {t('tasks.statusCompleted')}
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
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
                      placeholder={t('journal.studyPlaceholder')}
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
                      <div className="note-composer-period-wrap">
                        <Clock size={13} className="note-composer-clock-icon" />
                        <select
                          className="note-composer-period-select"
                          value={studyPeriod}
                          onChange={e => setStudyPeriod(e.target.value)}
                        >
                          {PLANNER_PERIOD_ORDER.map(key => (
                            <option key={key} value={key}>
                              {t('period.' + key)} — {t('period.' + key + 'Range')}
                            </option>
                          ))}
                        </select>
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
                    return PLANNER_PERIOD_ORDER.map(periodKey => {
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
                                <div className="study-note-text">{note.text}</div>
                                <div className="study-note-footer">
                                  <span className="study-note-time">{note.time}</span>
                                  <div className="study-note-actions">
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
                    <div>
                      <h2 className="new-tasks-title">{t('guide.title')}</h2>
                      <p className="new-tasks-subtitle">{t('guide.subtitle')}</p>
                    </div>
                    <div className="guide-steps-badge">
                      <span>8 {t('guide.steps')}</span>
                    </div>
                  </div>
                </div>
                <div className="guide-sections">
                  <div className="guide-card" style={{ '--card-accent': 'var(--color-emerald)' }}>
                    <div className="guide-card-step">01</div>
                    <div className="guide-card-icon-wrap"><Sparkles size={22} /></div>
                    <div className="guide-card-content">
                      <h3 className="guide-card-title">{t('guide.whatIs')}</h3>
                      <p className="guide-card-desc">{t('guide.whatIsDesc')}</p>
                    </div>
                  </div>
                  <div className="guide-card" style={{ '--card-accent': 'var(--color-teal)' }}>
                    <div className="guide-card-step">02</div>
                    <div className="guide-card-icon-wrap"><Clock size={22} /></div>
                    <div className="guide-card-content">
                      <h3 className="guide-card-title">{t('guide.timeline')}</h3>
                      <p className="guide-card-desc">{t('guide.timelineDesc')}</p>
                    </div>
                  </div>
                  <div className="guide-card" style={{ '--card-accent': 'var(--color-gold)' }}>
                    <div className="guide-card-step">03</div>
                    <div className="guide-card-icon-wrap"><Plus size={22} /></div>
                    <div className="guide-card-content">
                      <h3 className="guide-card-title">{t('guide.addTask')}</h3>
                      <p className="guide-card-desc">{t('guide.addTaskDesc')}</p>
                    </div>
                  </div>
                  <div className="guide-card" style={{ '--card-accent': 'var(--color-emerald)' }}>
                    <div className="guide-card-step">04</div>
                    <div className="guide-card-icon-wrap"><BookOpen size={22} /></div>
                    <div className="guide-card-content">
                      <h3 className="guide-card-title">{t('guide.journal')}</h3>
                      <p className="guide-card-desc">{t('guide.journalDesc')}</p>
                    </div>
                  </div>
                  <div className="guide-card" style={{ '--card-accent': 'var(--color-gold)' }}>
                    <div className="guide-card-step">05</div>
                    <div className="guide-card-icon-wrap"><Activity size={22} /></div>
                    <div className="guide-card-content">
                      <h3 className="guide-card-title">{t('guide.history')}</h3>
                      <p className="guide-card-desc">{t('guide.historyDesc')}</p>
                    </div>
                  </div>
                  <div className="guide-card" style={{ '--card-accent': 'var(--color-gold)' }}>
                    <div className="guide-card-step">06</div>
                    <div className="guide-card-icon-wrap"><Settings size={22} /></div>
                    <div className="guide-card-content">
                      <h3 className="guide-card-title">{t('guide.settings')}</h3>
                      <p className="guide-card-desc">{t('guide.settingsDesc')}</p>
                    </div>
                  </div>
                  <div className="guide-card" style={{ '--card-accent': 'var(--color-emerald)' }}>
                    <div className="guide-card-step">07</div>
                    <div className="guide-card-icon-wrap"><Download size={22} /></div>
                    <div className="guide-card-content">
                      <h3 className="guide-card-title">{t('guide.export')}</h3>
                      <p className="guide-card-desc">{t('guide.exportDesc')}</p>
                    </div>
                  </div>
                  <div className="guide-card" style={{ '--card-accent': 'var(--color-teal)' }}>
                    <div className="guide-card-step">08</div>
                    <div className="guide-card-icon-wrap"><Sun size={22} /></div>
                    <div className="guide-card-content">
                      <h3 className="guide-card-title">{t('guide.theme')}</h3>
                      <p className="guide-card-desc">{t('guide.themeDesc')}</p>
                    </div>
                  </div>
                </div>
              </div>
            )}

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
                  <div className="drinks-list">
                    {todayDrinks.map(drink => (
                      <div key={drink.id} className="drink-card">
                        <div className="drink-main">
                          <div className="drink-info">
                            <input
                              type="text"
                              className="form-input drink-name-input"
                              value={drink.name}
                              onChange={e => updateDrink(drink.id, 'name', e.target.value)}
                              placeholder={t('drinks.name')}
                            />
                            <div className="drink-count-wrap">
                              <button
                                type="button"
                                className="btn-task-action"
                                onClick={() => updateDrink(drink.id, 'count', Math.max(0, drink.count - 1))}
                              >
                                <Minus size={13} />
                              </button>
                              <span className="drink-count-value">{drink.count}</span>
                              <button
                                type="button"
                                className="btn-task-action"
                                onClick={() => updateDrink(drink.id, 'count', drink.count + 1)}
                              >
                                <Plus size={13} />
                              </button>
                            </div>
                          </div>
                          <button
                            type="button"
                            className="btn-task-action delete"
                            onClick={() => deleteDrink(drink.id)}
                            title={t('drinks.delete')}
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>
                    ))}
                    <div className="drink-total-card">
                      <span>{t('drinks.total')}</span>
                      <strong>{todayDrinks.reduce((s, d) => s + d.count, 0)}</strong>
                    </div>
                  </div>
                )}
              </div>
            )}

            {currentPage === 'prayers' && dayData && (
              <div className="new-tasks-page">
                <div className="new-tasks-header-wrap">
                  <div className="new-tasks-header">
                    <div style={{display: 'flex', alignItems: 'center', gap: '16px'}}>
                      <Clock size={32} className="new-tasks-title-icon" />
                      <div>
                        <h2 className="new-tasks-title">{t('prayerTimes.title')}</h2>
                        <p className="new-tasks-subtitle">{t('prayerTracker.trackYour')}</p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Next Prayer Card */}
                {timelineStatus?.nextPrayerName && (() => {
                  const nextKey = timelineStatus.nextPrayerName.toLowerCase();
                  const nextTime = dayData.prayerTimes[nextKey];
                  return (
                    <div className="prayers-next-card" style={{marginBottom: '32px'}}>
                      <span className="prayers-next-label">{t('prayerTimes.nextPrayer')}</span>
                      <span className="prayers-next-name">{t('prayer.' + nextKey)}</span>
                      <span className="prayers-next-time">{nextTime ? formatMinutesToTime(parseTimeToMinutes(nextTime)) : '--:--'}</span>
                      <span className="prayers-next-countdown">
                        <Clock size={14} />
                        {timelineStatus.timeToNextPrayer} {t('time.until')} {t('prayer.' + nextKey)}
                      </span>
                    </div>
                  );
                })()}

                <div className="new-tasks-sections">
                  {/* Prayers Tracker */}
                  <div className="new-period-section">
                    <div className="new-period-header">
                      <div className="new-period-title">
                        <div className="new-period-dot" style={{background: 'var(--color-emerald)'}}></div>
                        <h3>{t('prayerTimes.title')}</h3>
                      </div>
                    </div>
                    <div className="new-period-task-list">
                      {['maghrib', 'isha', 'fajr', 'dhuhr', 'asr'].map((key) => {
                        const timeStr = dayData.prayerTimes[key];
                        const currentStatus = prayerTracking[activeDate]?.[key] || 'pending';
                        
                        const setThisPrayerStatus = (status) => {
                          setPrayerTracking(prev => ({ ...prev, [activeDate]: { ...(prev[activeDate] || {}), [key]: status } }));
                          syncPrayerToTask(key, status);
                        };

                        return (
                          <div key={key} className={`new-task-card status-${currentStatus}`}>
                            <div className="new-task-main">
                              <div className="new-task-content">
                                <h4 className="new-task-title">{t('prayer.' + key)}</h4>
                                <div className="new-task-meta">
                                  <span className="new-task-time-badge">
                                    <Clock size={12} /> {timeStr ? formatMinutesToTime(parseTimeToMinutes(timeStr)) : '--:--'}
                                  </span>
                                </div>
                              </div>
                            </div>
                            
                            <div className="new-task-status-row">
                              <button 
                                className={`new-status-btn btn-pending ${currentStatus === 'pending' ? 'active' : ''}`}
                                onClick={() => setThisPrayerStatus('pending')}
                              >
                                {t('tasks.statusPending')}
                              </button>
                              <button 
                                className={`new-status-btn btn-not-completed ${currentStatus === 'not_completed' ? 'active' : ''}`}
                                onClick={() => setThisPrayerStatus('not_completed')}
                              >
                                <X size={14} /> {t('tasks.statusNotCompleted')}
                              </button>
                              <button 
                                className={`new-status-btn btn-completed ${currentStatus === 'completed' ? 'active' : ''}`}
                                onClick={() => {
                                  setThisPrayerStatus('completed');
                                  triggerConfetti();
                                }}
                              >
                                <Check size={14} /> {t('tasks.statusCompleted')}
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Adhkar Tracker */}
                  <div className="new-period-section" style={{marginTop: '16px'}}>
                    <div className="new-period-header">
                      <div className="new-period-title">
                        <div className="new-period-dot" style={{background: 'var(--color-teal)'}}></div>
                        <h3>{t('adhkar.title')}</h3>
                      </div>
                    </div>
                    <div className="new-period-task-list">
                      {['morning', 'evening'].map((key) => {
                        const currentStatus = prayerTracking[activeDate]?.[`adhkar_${key}`] || 'pending';
                        
                        const setThisAdhkarStatus = (status) => {
                          setPrayerTracking(prev => ({ ...prev, [activeDate]: { ...(prev[activeDate] || {}), [`adhkar_${key}`]: status } }));
                          syncAdhkarToTask(`adhkar_${key}`, status);
                        };

                        return (
                          <div key={key} className={`new-task-card status-${currentStatus}`}>
                            <div className="new-task-main">
                              <div className="new-task-content">
                                <h4 className="new-task-title">{t('adhkar.' + key)}</h4>
                              </div>
                            </div>
                            
                            <div className="new-task-status-row">
                              <button 
                                className={`new-status-btn btn-pending ${currentStatus === 'pending' ? 'active' : ''}`}
                                onClick={() => setThisAdhkarStatus('pending')}
                              >
                                {t('tasks.statusPending')}
                              </button>
                              <button 
                                className={`new-status-btn btn-not-completed ${currentStatus === 'not_completed' ? 'active' : ''}`}
                                onClick={() => setThisAdhkarStatus('not_completed')}
                              >
                                <X size={14} /> {t('tasks.statusNotCompleted')}
                              </button>
                              <button 
                                className={`new-status-btn btn-completed ${currentStatus === 'completed' ? 'active' : ''}`}
                                onClick={() => {
                                  setThisAdhkarStatus('completed');
                                  triggerConfetti();
                                }}
                              >
                                <Check size={14} /> {t('tasks.statusCompleted')}
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
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
                      <button className={`time-format-btn ${!use12h ? 'active' : ''}`} onClick={() => setUse12hState(false)}>
                        <span className="time-format-sample">23:59</span>
                        <span className="time-format-label">{t('settings.format24h')}</span>
                      </button>
                      <button className={`time-format-btn ${use12h ? 'active' : ''}`} onClick={() => setUse12hState(true)}>
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
                <div className="settings-card">
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
                              <div className="form-group"><label className="form-label">{t('settings.cityLabel')}</label><input className="form-input" type="text" value={settingsForm.city} onChange={e => setSettingsForm(prev => ({ ...prev, city: e.target.value }))} required/></div>
                              <div className="form-group"><label className="form-label">{t('settings.countryLabel')}</label><input className="form-input" type="text" value={settingsForm.country} onChange={e => setSettingsForm(prev => ({ ...prev, country: e.target.value }))} required/></div>
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
                <div className="settings-card">
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
              </div>
            )}

          </main>

        {/* Floating Action Button */}
        {dayData && (
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
                      {PLANNER_PERIOD_ORDER.map(key => (
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
