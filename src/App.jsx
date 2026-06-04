import { useState, useEffect, useRef } from 'react';
import {
  Check, Plus, Minus, Edit2, Trash2, Calendar, Settings, Moon, Sun,
  BookOpen, Clock, Sparkles, MapPin, X, AlertCircle,
  ChevronUp, ChevronDown, RefreshCw, Download, HelpCircle, List, Type, Menu, Target
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
  'Morning Adhkar': { period: 'morning', offset: 15 },
  'Dhuhr Prayer': { period: 'afternoon', offset: 0 },
  'Asr Prayer': { period: 'late_afternoon', offset: 0 },
  'Evening Adhkar': { period: 'late_afternoon', offset: 0 }
};

const getFixedTaskSchedule = (task, prayers) => {
  if (task.name === 'Evening Adhkar') {
    const start = getPeriodEndMinutes('late_afternoon', prayers) - 60;
    return {
      period: 'late_afternoon',
      duration: 15,
      scheduledTime: formatMinutesToTime(start)
    };
  }
  const schedule = FIXED_TASK_SCHEDULE[task.name];
  if (!schedule) return null;
  const start = getPeriodStartMinutes(schedule.period, prayers) + schedule.offset;
  return {
    period: schedule.period,
    duration: 15,
    scheduledTime: formatMinutesToTime(start)
  };
};

const normalizeFixedTask = (task, prayers) => {
  const fixedSchedule = task.type === 'fixed' ? getFixedTaskSchedule(task, prayers) : null;
  return fixedSchedule ? { ...task, ...fixedSchedule, isRecurring: false } : task;
};

const normalizeTasksForPrayerBlocks = (tasks, prayers) => {
  const usedStartsByBlock = {};

  return sortTasksForPlannerDay(tasks.map(task => normalizeFixedTask(task, prayers)), prayers).map(task => {
    const blockStart = getPeriodStartMinutes(task.period, prayers);
    const blockEnd = getPeriodEndMinutes(task.period, prayers);
    const blockDuration = Math.max(1, blockEnd - blockStart);
    const usedStarts = usedStartsByBlock[task.period] || new Set();
    if (task.type === 'fixed') {
      const start = getTaskStartMinutes(task, prayers);
      usedStarts.add(start);
      usedStartsByBlock[task.period] = usedStarts;
      return task;
    }

    let duration = Math.max(1, Math.min(Number(task.duration) || 15, blockDuration));
    let start = getTaskStartMinutes(task, prayers);

    if (start < blockStart || start >= blockEnd || start + duration > blockEnd) {
      start = Math.min(Math.max(blockStart, start), blockEnd - duration);
    }

    while (usedStarts.has(start) && start + duration + TASK_GAP <= blockEnd) {
      start += TASK_GAP;
    }

    if (usedStarts.has(start)) {
      start = blockStart;
      while (usedStarts.has(start) && start + duration + TASK_GAP <= blockEnd) {
        start += TASK_GAP;
      }
    }

    usedStarts.add(start);
    usedStartsByBlock[task.period] = usedStarts;

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

  for (let start = Math.max(blockStart, minTime ?? blockStart); start + duration <= blockEnd; start += TASK_GAP) {
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

  for (let start = blockStart; start < blockEnd; start += TASK_GAP) {
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

  for (let end = startMinutes + TASK_GAP; end <= blockEnd; end += TASK_GAP) {
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
  const [currentPage, setCurrentPage] = useState('home'); // home | tasks | journal | history | guide | settings

  // ---- Theme ----
  const [theme, setTheme] = useState(() => localStorage.getItem('tarteeb_theme') || 'dark');

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
    return saved === 'true';
  });

  useEffect(() => {
    setUse12h(use12h);
    localStorage.setItem('tarteeb_use12h', use12h);
  }, [use12h]);

  // ---- Location Config ----
  const [locationConfig, setLocationConfig] = useState(() => {
    const saved = localStorage.getItem('tarteeb_location_config');
    if (saved) return JSON.parse(saved);
    return { enabled: true, type: 'coords', city: 'Cairo', country: 'Egypt', latitude: '30.0444', longitude: '31.2357' };
  });

  // ---- Planner Date & Data ----
  const [activeDate, setActiveDate] = useState(() => getLogicalPlannerDate(new Date()));
  const [dayData, setDayData] = useState(null);

  // ---- Mobile sidebar ----
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // ---- Real‑time Clock ----
  const [currentTime, setCurrentTime] = useState(new Date());
  const [timelineStatus, setTimelineStatus] = useState(null);

  // ---- History ----
  const [historyDates, setHistoryDates] = useState(() => {
    const saved = localStorage.getItem('tarteeb_history_dates');
    return saved ? JSON.parse(saved) : [];
  });
  const [expandedHistoryDate, setExpandedHistoryDate] = useState(null);

  // ---- Modals & Forms ----
  const [taskModal, setTaskModal] = useState({ open: false, mode: 'add', task: null });
  const [taskForm, setTaskForm] = useState({
    name: '', details: '', duration: 15, period: 'evening', scheduledTime: '19:00', endTime: '19:15', isRecurring: false
  });
  const [settingsForm, setSettingsForm] = useState({ ...locationConfig });
  const [manualTimesForm, setManualTimesForm] = useState({ fajr: '', dhuhr: '', asr: '', maghrib: '', isha: '' });
  const [diaryDraft, setDiaryDraft] = useState('');
  const [diarySaved, setDiarySaved] = useState(true);
  const [collapsedPeriods, setCollapsedPeriods] = useState({ night: true, morning: true, afternoon: true, late_afternoon: true });
  const [dialog, setDialog] = useState(null);
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
  const [expandedStats, setExpandedStats] = useState({});

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

  // ---- Auto-detect location on first visit ----
  useEffect(() => {
    if (!navigator.geolocation) return;
    const saved = localStorage.getItem('tarteeb_location_config');
    if (saved) return;
    navigator.geolocation.getCurrentPosition(pos => {
      const cfg = { enabled: true, type: 'coords', city: '', country: '', latitude: String(pos.coords.latitude), longitude: String(pos.coords.longitude) };
      setLocationConfig(cfg);
      setSettingsForm(cfg);
      localStorage.setItem('tarteeb_location_config', JSON.stringify(cfg));
    }, () => { /* fallback to defaults */ }, { timeout: 10000 });
  }, []);

  // ---- Load / Init day data ----
  useEffect(() => {
    let active = true;
    async function init() {
      setLoading(true);
      setApiError(null);
      try {
        await ensurePrayerTimesCached(activeDate, locationConfig);
      } catch (e) {
        console.error('Prayer time fetch error:', e);
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
          stats: calculateStats(initialTasks)
        };
        localStorage.setItem(storageKey, JSON.stringify(newDay));
        // update history list
        setHistoryDates(prev => {
          if (!prev.includes(activeDate)) {
            const upd = [...prev, activeDate].sort((a, b) => b.localeCompare(a));
            localStorage.setItem('tarteeb_history_dates', JSON.stringify(upd));
            return upd;
          }
          return prev;
        });
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

  // ---- Auto-scroll to current time line ----
  useEffect(() => {
    if (currentPage !== 'home' || !dayData) return;
    const id = requestAnimationFrame(() => {
      const el = document.querySelector('.timeline-now-line');
      if (el) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    });
    return () => cancelAnimationFrame(id);
  }, [currentPage, dayData]);

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
    }
  }, [currentPage, dayData]);

  const updateDayData = (updated) => {
    updated.stats = calculateStats(updated.tasks);
    localStorage.setItem(`tarteeb_day_${updated.date}`, JSON.stringify(updated));
    setDayData(updated);
  };

  const toggleTaskCompletion = (id) => {
    if (!dayData) return;
    const task = dayData.tasks.find(t => t.id === id);
    if (task && !task.completed) {
      confetti({
        particleCount: 120,
        spread: 80,
        origin: { x: 0.5, y: 0.5 },
        colors: ['#059669', '#0d9488', '#d97706', '#f59e0b', '#10b981']
      });
    }
    const updTasks = dayData.tasks.map(t => t.id === id ? { ...t, completed: !t.completed } : t);
    updateDayData({ ...dayData, tasks: updTasks });
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

  // ---- Habit Functions ----
  const getTodayStr = () => formatDateLocal(new Date());

  const calcHabitStreak = (entries) => {
    const today = getTodayStr();
    const d = new Date(today);
    let streak = 0;
    while (true) {
      const key = formatDateLocal(d);
      const entry = entries[key];
      if (entry && entry.completed) {
        streak++;
        d.setDate(d.getDate() - 1);
      } else break;
    }
    return streak;
  };

  const calcLongestStreak = (entries) => {
    const dates = Object.keys(entries).sort();
    if (!dates.length) return 0;
    let longest = 0, cur = 0;
    for (const dateStr of dates) {
      if (entries[dateStr].completed) {
        cur++;
        longest = Math.max(longest, cur);
      } else cur = 0;
    }
    return longest;
  };

  const calcHabitStats = (habit) => {
    const entries = habit.entries || {};
    const dates = Object.keys(entries).sort();
    const total = dates.length;
    const completed = dates.filter(d => entries[d].completed).length;
    return {
      total,
      completed,
      rate: total ? Math.round((completed / total) * 100) : 0,
      currentStreak: calcHabitStreak(entries),
      longestStreak: calcLongestStreak(entries)
    };
  };

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

  const deleteHabit = async (id) => {
    const confirmed = await showConfirm(t('habits.deleteConfirm'));
    if (confirmed) setHabits(prev => prev.filter(h => h.id !== id));
  };

  const exportHabitsMarkdown = () => {
    if (!habits.length) return;
    let md = `# ${t('habits.title')}\n\n`;
    habits.forEach(h => {
      const stats = calcHabitStats(h);
      md += `## ${h.name}\n`;
      md += `- ${t('habits.currentStreak')}: ${stats.currentStreak}\n`;
      md += `- ${t('habits.longestStreak')}: ${stats.longestStreak}\n`;
      md += `- ${t('habits.totalCompletions')}: ${stats.completed}/${stats.total}\n`;
      md += `- ${t('habits.completionRate')}: ${stats.rate}%\n\n`;
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

  const exportToMarkdown = () => {
    if (!dayData) return;
    const { tasks, diary, date, hijriDate, prayerTimes, stats } = dayData;
    const lines = [];
    const d = new Date(date);
    const locale = lang === 'ar' ? 'ar-SA' : 'en-US';
    const title = d.toLocaleDateString(locale, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

    lines.push(`# ${title}`);
    lines.push('');
    if (hijriDate) lines.push(`> ${hijriDate}`);
    lines.push('');
    lines.push(`## ${t('export.prayerTimes')}`);
    lines.push('');
    lines.push(`| ${t('export.prayer')} | ${t('export.time')} |`);
    lines.push(`|--------|------|`);
    ['Fajr', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'].forEach(p => {
      const key = p.toLowerCase();
      if (prayerTimes[key]) lines.push(`| ${translateTaskName(p + ' Prayer') || p} | ${prayerTimes[key]} |`);
    });
    lines.push('');
    lines.push(`## ${t('export.tasks')} — ${stats.completedTasks}/${stats.totalTasks} ${t('export.completed')}`);
    lines.push('');
    tasks.forEach(t => {
      const checkbox = t.completed ? '[x]' : '[ ]';
      const time = getTaskDisplayTime(t, prayerTimes);
      const end = t.type === 'personal' || t.type === 'user'
        ? ` – ${formatMinutesToTime(getTaskStartMinutes(t, prayerTimes) + (Number(t.duration) || 15))}`
        : '';
      lines.push(`- ${checkbox} **${translateTaskName(t.name)}** — ${time}${end}`);
      if (t.details) lines.push(`  - ${t.details}`);
    });
    if (diary) {
      lines.push('');
      lines.push(`## ${t('export.notes')}`);
      lines.push('');
      lines.push(diary);
    }
    const habitsMd = exportHabitsMarkdown();
    if (habitsMd) {
      lines.push('');
      lines.push(habitsMd);
    }
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

  const loadHistoryDate = (dateStr) => {
    setActiveDate(dateStr);
    setCurrentPage('home');
  };

  const deleteHistoryDate = async (dateStr) => {
    const confirmed = await showConfirm(t('confirm.deleteHistory'));
    if (!confirmed) return;
    localStorage.removeItem(`tarteeb_day_${dateStr}`);
    setHistoryDates(prev => {
      const upd = prev.filter(d => d !== dateStr);
      localStorage.setItem('tarteeb_history_dates', JSON.stringify(upd));
      return upd;
    });
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
      console.error(err);
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
    const padTop = 45;
    const padBottom = 45;
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
        const period = hour < 12 ? 'AM' : 'PM';
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
              {nowInRange && (
                <span className="timeline-now-time" style={{ top: `${nowTop}%` }}>
                  {formatMinutesToTime(nowMinutes)}
                </span>
              )}
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

              {markers.map(marker => (
                <div
                  key={marker.key}
                  className="timeline-prayer-marker"
                  style={{ top: `${toPercent(marker.minutes)}%` }}
                  aria-label={`${t('prayer.' + marker.prayer.toLowerCase())} ${t('prayer.boundary')}`}
                />
              ))}

              {sortedTasks.map((task) => {
                const taskStart = getTaskStartMinutes(task, prayers);
                const blockEnd = getPeriodEndMinutes(task.period, prayers);
                const duration = Math.max(5, Math.min(Number(task.duration) || 15, blockEnd - taskStart));
                const top = toPercent(taskStart);
                const heightPct = (duration / visualDuration) * 100;

                const isAdhkar = task.name.includes('Adhkar');
                const taskEnd = taskStart + duration;
                const prayerBg = (
                  task.name === 'Maghrib Prayer' || task.name === 'Isha Prayer'
                ) ? 'prayer-bg-night' : (
                  task.name === 'Fajr Prayer' || task.name === 'Dhuhr Prayer' || task.name === 'Asr Prayer'
                ) ? 'prayer-bg-day' : '';
                return (
                  <div
                    key={task.id}
                    className={`timeline-task-card task-${task.type}${isAdhkar ? ' task-adhkar' : ''} ${prayerBg} ${task.completed ? 'completed' : ''}`}
                    style={{ top: `${top}%`, height: `${heightPct}%` }}
                  >
                    <button
                      type="button"
                      className={`task-checkbox block-task-check ${task.completed ? 'checked' : ''}`}
                      onClick={() => toggleTaskCompletion(task.id)}
                      aria-label={task.completed ? t('task.markIncomplete') : t('task.markComplete')}
                    >
                      {task.completed && <Check size={12} />}
                    </button>
                      <div className="block-task-main">
                        <div className="block-task-topline">
                          <span className="block-task-time">{getTaskDisplayTime(task, prayers)}</span>
                          <span className="block-task-endtime">– {formatMinutesToTime(taskEnd)}</span>
                          <span className="block-task-name">{translateTaskName(task.name)}</span>
                          <span className="block-task-duration">{translateDuration(duration)}</span>
                        </div>
                      </div>
                    {task.type !== 'fixed' && (
                      <div className="block-task-actions">
                        <button type="button" className="btn-task-action" onClick={() => openTaskModal('edit', task)} aria-label={t('task.edit')}>
                          <Edit2 size={12} />
                        </button>
                        <button type="button" className="btn-task-action delete" onClick={() => deleteTask(task.id)} aria-label={t('task.deleteAria')}>
                          <Trash2 size={12} />
                        </button>
                      </div>
                    )}
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

  // ---- Sidebar navigation links ----
  const sidebarLinks = [
    { id: 'home', label: t('nav.home'), icon: Sparkles },
    { id: 'tasks', label: t('nav.tasks'), icon: List },
    { id: 'habits', label: t('nav.habits'), icon: Target },
    { id: 'journal', label: t('nav.journal'), icon: BookOpen },
    { id: 'history', label: t('nav.history'), icon: Calendar },
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
          <button className="btn btn-menu-mobile" onClick={() => setSidebarOpen(true)} aria-label={t('nav.openSidebar')}>
            <Menu size={18} />
          </button>
          {dayData && (
            <button className="btn btn-primary btn-add-task" onClick={() => openTaskModal('add')}>
              <Plus size={16} /> {t('header.addTask')}
            </button>
          )}
        </div>
      </header>

      {/* Full‑screen layout with left sidebar */}
      {dayData && (
        <div className="main-layout full-screen">
          {sidebarOpen && <div className="sidebar-overlay" onClick={() => setSidebarOpen(false)} />}
          {/* Left Sidebar */}
          <aside className={`full-sidebar ${sidebarOpen ? 'sidebar-open' : ''}`}>
            <button className="sidebar-close-btn" onClick={() => setSidebarOpen(false)} aria-label={t('nav.closeSidebar')}>
              <X size={20} />
            </button>
            <div className="sidebar-planner-header">
              <span className="sidebar-planner-eyebrow">{t('brand.subtitle')}</span>
              <span className="sidebar-planner-date">{formatHumanDate(dayData.date)}</span>
              {timelineStatus?.nextPrayerName && (
                <span className="sidebar-planner-countdown">
                  <Clock size={13} /> {timelineStatus.timeToNextPrayer} {t('time.until')} {t('prayer.' + timelineStatus.nextPrayerName.toLowerCase())}
                </span>
              )}
              <div className="sidebar-planner-meta">
                {dayData.hijriDate && <span>{dayData.hijriDate}</span>}
                <span>{dayData.stats.overallCompleted}{t('sidebar.complete')}</span>
              </div>
            </div>

            <div className="sidebar-prayer-strip">
              {(() => {
                const p = dayData.prayerTimes;
                const ds = getPeriodStartMinutes('evening', p);
                const boxToPeriod = { maghrib: 'evening', isha: 'night', fajr: 'morning', dhuhr: 'afternoon', asr: 'late_afternoon' };
                const boxes = [
                  { key: 'maghrib', prayer: t('prayer.maghrib'), time: formatMinutesToTime(parseTimeToMinutes(p.maghrib)), minutes: ds },
                  { key: 'isha', prayer: t('prayer.isha'), time: formatMinutesToTime(parseTimeToMinutes(p.isha)), minutes: getPeriodStartMinutes('night', p) },
                  { key: 'fajr', prayer: t('prayer.fajr'), time: formatMinutesToTime(parseTimeToMinutes(p.fajr)), minutes: getPeriodStartMinutes('morning', p) },
                  { key: 'dhuhr', prayer: t('prayer.dhuhr'), time: formatMinutesToTime(parseTimeToMinutes(p.dhuhr)), minutes: getPeriodStartMinutes('afternoon', p) },
                  { key: 'asr', prayer: t('prayer.asr'), time: formatMinutesToTime(parseTimeToMinutes(p.asr)), minutes: getPeriodStartMinutes('late_afternoon', p) },
                ];
                const cpm = getCurrentPlannerMinutes(currentTime, activeDate);
                const activePeriod = timelineStatus?.activePeriod;
                return boxes.map(box => (
                  <div key={box.key} className={`sidebar-prayer-box sidebar-prayer-box-${box.key} ${cpm >= box.minutes ? 'sidebar-prayer-box-past' : ''} ${boxToPeriod[box.key] === activePeriod ? 'sidebar-prayer-box-current' : ''}`}>
                    <span>{box.prayer}</span>
                    <strong>{box.time}</strong>
                  </div>
                ));
              })()}
            </div>

            <div className="sidebar-header">
              <span className="sidebar-header-label">{t('nav.navigation')}</span>
            </div>
            <nav className="sidebar-nav">
              {sidebarLinks.map(link => (
                  <button
                    key={link.id}
                    className={`sidebar-link ${currentPage === link.id ? 'active' : ''}`}
                    onClick={() => { setCurrentPage(link.id); setSidebarOpen(false); }}
                  >
                  <span className="nav-icon-wrap"><link.icon size={17} /></span>
                  <span className="nav-label">{link.label}</span>
                </button>
              ))}
            </nav>
            <div className="sidebar-quick-toggles">
              <button className="sidebar-toggle-btn" onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')} title={t('settings.theme')}>
                {theme === 'light' ? <Moon size={16} /> : <Sun size={16} />}
              </button>
              <button className="sidebar-toggle-btn" onClick={() => setLang(lang === 'en' ? 'ar' : 'en')} title={t('settings.language')}>
                {lang === 'en' ? 'AR' : 'EN'}
              </button>
              <button className="sidebar-toggle-btn" onClick={() => setFontSize(s => {
                const idx = FONT_SIZES.indexOf(s);
                return FONT_SIZES[(idx + 1) % FONT_SIZES.length];
              })} title={t('settings.fontSize')}>
                <Type size={16} />
                <span className="font-size-sidebar-label">{t('settings.fontSize_' + fontSize)}</span>
              </button>
            </div>
            <div className="sidebar-export-wrap">
              <button className="btn btn-export sidebar-export-btn" onClick={exportToMarkdown} title={t('header.exportTitle')}>
                <Download size={16} /> {t('header.export')}
              </button>
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
            {currentPage === 'home' && renderFullDayView()}

            {currentPage === 'tasks' && dayData && (
              <div className="tasks-page">
                <div className="tasks-header">
                  <List size={22} className="tasks-header-icon" />
                  <h3 className="tasks-header-title">{t('tasks.title')}</h3>
                  <span className="tasks-header-count">{dayData.stats.completedTasks}/{dayData.stats.totalTasks}</span>
                </div>
                <div className="tasks-stats-bar">
                  <div className="tasks-stat">
                    <span className="tasks-stat-value">{dayData.stats.totalTasks}</span>
                    <span className="tasks-stat-label">{t('tasks.total')}</span>
                  </div>
                  <div className="tasks-stat">
                    <span className="tasks-stat-value tasks-stat-done">{dayData.stats.completedTasks}</span>
                    <span className="tasks-stat-label">{t('tasks.completed')}</span>
                  </div>
                  <div className="tasks-stat">
                    <span className="tasks-stat-value tasks-stat-left">{dayData.stats.totalTasks - dayData.stats.completedTasks}</span>
                    <span className="tasks-stat-label">{t('tasks.remaining')}</span>
                  </div>
                  <div className="tasks-stat tasks-stat-pct">
                    <span className="tasks-stat-value">{dayData.stats.overallCompleted}%</span>
                    <span className="tasks-stat-label">{t('tasks.completion')}</span>
                  </div>
                </div>
                <div className="tasks-progress-wrap">
                  <div className="tasks-progress-bar" style={{ width: `${dayData.stats.overallCompleted}%` }} />
                </div>
                  {PLANNER_PERIOD_ORDER.map(periodKey => {
                  const periodTasks = dayData.tasks.filter(t => t.period === periodKey);
                  if (!periodTasks.length) return null;
                  const done = periodTasks.filter(t => t.completed).length;
                  const pct = Math.round((done / periodTasks.length) * 100);
                  const isCollapsed = !!collapsedPeriods[periodKey];
                  return (
                    <div key={periodKey} className={`tasks-block ${isCollapsed ? 'collapsed' : ''}`}>
                      <div className="tasks-block-header" onClick={() => setCollapsedPeriods(prev => ({ ...prev, [periodKey]: !prev[periodKey] }))} style={{ cursor: 'pointer' }}>
                        <span className="tasks-block-name">{t('period.' + periodKey)}</span>
                        <span className="tasks-block-meta">
                          {done}/{periodTasks.length} · {pct}%
                          {isCollapsed ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                        </span>
                      </div>
                      {!isCollapsed && (
                        <div className="tasks-block-list">
                          {periodTasks.map(task => {
                            const taskStart = getTaskStartMinutes(task, dayData.prayerTimes);
                            const taskEnd = taskStart + (Number(task.duration) || 15);
                            return (
                              <div key={task.id} className={`tasks-task-card ${task.completed ? 'completed' : ''}`}>
                                <button
                                  type="button"
                                  className={`tasks-task-check ${task.completed ? 'checked' : ''}`}
                                  onClick={() => toggleTaskCompletion(task.id)}
                                >
                                  {task.completed && <Check size={12} />}
                                </button>
                                <div className="tasks-task-body">
                                  <span className="tasks-task-name">{translateTaskName(task.name)}</span>
                                  <span className="tasks-task-time">{getTaskDisplayTime(task, dayData.prayerTimes)} – {formatMinutesToTime(taskEnd)} · {translateDuration(Number(task.duration) || 15)}</span>
                                </div>
                                {task.type !== 'fixed' && (
                                  <div className="tasks-task-actions">
                                    <button type="button" className="btn-task-action" onClick={() => openTaskModal('edit', task)} aria-label={t('task.edit')}>
                                      <Edit2 size={13} />
                                    </button>
                                    <button type="button" className="btn-task-action delete" onClick={() => deleteTask(task.id)} aria-label={t('task.deleteAria')}>
                                      <Trash2 size={13} />
                                    </button>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {currentPage === 'journal' && (
              <div className="journal-card">
                <div className="journal-header">
                  <div className="journal-header-left">
                    <BookOpen size={18} className="journal-icon" />
                    <div>
                      <h3 className="journal-title" dir="auto">{t('journal.title')}</h3>
                      <span className="journal-date" dir="auto">{formatHumanDate(dayData.date)}{dayData.hijriDate ? ` · ${dayData.hijriDate}` : ''}</span>
                    </div>
                  </div>
                  <button className="btn btn-primary btn-save-journal" onClick={handleDiarySave} disabled={diarySaved}>
                    {diarySaved ? t('journal.saved') : t('journal.save')}
                  </button>
                </div>
                <textarea className="diary-textarea" value={diaryDraft} onChange={handleDiaryChange} placeholder={t('journal.placeholder')} dir="auto" />
              </div>
            )}

            {currentPage === 'history' && (
              <div className="stats-section">
                <div className="section-header">
                  <Calendar size={18} style={{ color: 'var(--color-gold)' }} />
                  <h3>{t('history.title')}</h3>
                </div>
                <div className="history-list">
                  {historyDates.length === 0 ? (
                    <div className="history-empty">{t('history.empty')}</div>
                  ) : (
                    historyDates.map(dateStr => {
                      let hist = {};
                      try {
                        hist = JSON.parse(localStorage.getItem(`tarteeb_day_${dateStr}`) || '{}');
                      } catch {
                        hist = {};
                      }
                      const expanded = expandedHistoryDate === dateStr;
                      return (
                        <div key={dateStr} className={`history-card${expanded ? ' expanded' : ''}`}>
                          <div className="history-card-header" onClick={() => setExpandedHistoryDate(expanded ? null : dateStr)}>
                            <span className="history-card-date">{formatHumanDate(dateStr)}</span>
                            <div className="history-card-stats">
                              <span className="history-card-pct">{hist.stats?.overallCompleted ?? 0}%</span>
                              {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                            </div>
                          </div>
                          {expanded && (
                            <div className="history-card-body">
                              {hist.diary && (
                                <div className="history-card-diary" dir="auto">{hist.diary}</div>
                              )}
                              <div className="history-card-actions">
                                <button className="btn btn-history-edit" onClick={(e) => { e.stopPropagation(); loadHistoryDate(dateStr); }}>
                                  <Edit2 size={13} /> {t('history.openDay')}
                                </button>
                                <button className="btn btn-history-delete" onClick={(e) => { e.stopPropagation(); deleteHistoryDate(dateStr); }}>
                                  <Trash2 size={13} /> {t('history.delete')}
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}

            {currentPage === 'guide' && (
              <div className="guide-page">
                <div className="guide-hero">
                  <HelpCircle size={32} className="guide-hero-icon" />
                  <h2 className="guide-title">{t('guide.title')}</h2>
                  <p className="guide-subtitle">{t('guide.subtitle')}</p>
                </div>
                <div className="guide-sections">
                  <div className="guide-card">
                    <div className="guide-card-number">1</div>
                    <div className="guide-card-content">
                      <h3 className="guide-card-title">{t('guide.whatIs')}</h3>
                      <p className="guide-card-desc">{t('guide.whatIsDesc')}</p>
                    </div>
                  </div>
                  <div className="guide-card">
                    <div className="guide-card-number">2</div>
                    <div className="guide-card-content">
                      <h3 className="guide-card-title">{t('guide.timeline')}</h3>
                      <p className="guide-card-desc">{t('guide.timelineDesc')}</p>
                    </div>
                  </div>
                  <div className="guide-card">
                    <div className="guide-card-number">3</div>
                    <div className="guide-card-content">
                      <h3 className="guide-card-title">{t('guide.addTask')}</h3>
                      <p className="guide-card-desc">{t('guide.addTaskDesc')}</p>
                    </div>
                  </div>
                  <div className="guide-card">
                    <div className="guide-card-number">4</div>
                    <div className="guide-card-content">
                      <h3 className="guide-card-title">{t('guide.journal')}</h3>
                      <p className="guide-card-desc">{t('guide.journalDesc')}</p>
                    </div>
                  </div>
                  <div className="guide-card">
                    <div className="guide-card-number">5</div>
                    <div className="guide-card-content">
                      <h3 className="guide-card-title">{t('guide.history')}</h3>
                      <p className="guide-card-desc">{t('guide.historyDesc')}</p>
                    </div>
                  </div>
                  <div className="guide-card">
                    <div className="guide-card-number">6</div>
                    <div className="guide-card-content">
                      <h3 className="guide-card-title">{t('guide.settings')}</h3>
                      <p className="guide-card-desc">{t('guide.settingsDesc')}</p>
                    </div>
                  </div>
                  <div className="guide-card">
                    <div className="guide-card-number">7</div>
                    <div className="guide-card-content">
                      <h3 className="guide-card-title">{t('guide.export')}</h3>
                      <p className="guide-card-desc">{t('guide.exportDesc')}</p>
                    </div>
                  </div>
                  <div className="guide-card">
                    <div className="guide-card-number">8</div>
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
                <div className="habits-header">
                  <h2 className="habits-title">{t('habits.title')}</h2>
                  <button className="btn btn-primary" onClick={() => { setHabitForm({ name: '' }); setHabitModal({ open: true, mode: 'add', habit: null }); }}>
                    <Plus size={16} /> {t('habits.add')}
                  </button>
                </div>
                {habits.length === 0 ? (
                  <div className="habits-empty">{t('habits.noHabits')}</div>
                ) : (
                  <div className="habits-list">
                    {habits.map(habit => {
                      const entries = habit.entries || {};
                      const today = formatDateLocal(new Date());
                      const todayEntry = entries[today];
                      const isDone = todayEntry?.completed || false;
                      const stats = calcHabitStats(habit);
                      const sortedDates = Object.keys(entries).sort().slice(-60);
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
                              <div className="habit-meta">
                                <span className="habit-streak">
                                  🔥 {stats.currentStreak} {t('habits.streak')}
                                </span>
                                <span>{stats.completed}/{stats.total}</span>
                                <span>{stats.rate}%</span>
                              </div>
                            </div>
                            <div className="habit-actions">
                              <button type="button" className="btn-task-action" onClick={() => { setHabitForm({ name: habit.name }); setHabitModal({ open: true, mode: 'edit', habit }); }} title={t('habits.edit')}>
                                <Edit2 size={13} />
                              </button>
                              <button type="button" className="btn-task-action delete" onClick={() => deleteHabit(habit.id)} title={t('habits.delete')}>
                                <Trash2 size={13} />
                              </button>
                            </div>
                          </div>
                          <div className="habit-stats-panel">
                            <button
                              type="button"
                              className="habit-stats-toggle"
                              onClick={() => setExpandedStats(prev => ({ ...prev, [habit.id]: !prev[habit.id] }))}
                            >
                              {expandedStats[habit.id] ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                              {' '}{t('habits.stats')}
                            </button>
                            {expandedStats[habit.id] && (
                              <>
                                <div className="habit-stats-grid">
                                  <div className="habit-stat-card">
                                    <div className="habit-stat-value">{stats.currentStreak}</div>
                                    <div className="habit-stat-label">{t('habits.currentStreak')}</div>
                                  </div>
                                  <div className="habit-stat-card">
                                    <div className="habit-stat-value">{stats.longestStreak}</div>
                                    <div className="habit-stat-label">{t('habits.longestStreak')}</div>
                                  </div>
                                  <div className="habit-stat-card">
                                    <div className="habit-stat-value">{stats.completed}</div>
                                    <div className="habit-stat-label">{t('habits.totalCompletions')}</div>
                                  </div>
                                  <div className="habit-stat-card">
                                    <div className="habit-stat-value">{stats.rate}%</div>
                                    <div className="habit-stat-label">{t('habits.completionRate')}</div>
                                  </div>
                                </div>
                                {sortedDates.length > 0 && (
                                  <>
                                    <div className="habit-stats-chart">
                                      {sortedDates.map(d => {
                                        const e = entries[d];
                                        const isToday = d === today;
                                        let cls = 'habit-chart-day';
                                        if (e?.completed) cls += ' done';
                                        else if (e) cls += ' missed';
                                        else cls += ' empty';
                                        if (isToday) cls += ' today';
                                        return <div key={d} className={cls} title={`${d}: ${e?.completed ? '✓' : e ? '✗' : '–'}`} />;
                                      })}
                                    </div>
                                    <div className="habit-chart-legend">
                                      <span><span className="dot done" /> {t('habits.today')}</span>
                                      <span><span className="dot missed" /> Missed</span>
                                      <span><span className="dot empty" /> Empty</span>
                                    </div>
                                  </>
                                )}
                              </>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
                {habits.length > 0 && (
                  <div style={{ marginTop: 16, textAlign: 'center' }}>
                    <button className="btn" onClick={() => {
                      const md = exportHabitsMarkdown();
                      if (!md) return;
                      const blob = new Blob([md], { type: 'text/markdown' });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = `habits_${formatDateLocal(new Date())}.md`;
                      document.body.appendChild(a);
                      a.click();
                      document.body.removeChild(a);
                      URL.revokeObjectURL(url);
                    }}>
                      <Download size={14} /> {t('habits.export')}
                    </button>
                  </div>
                )}
              </div>
            )}

            {currentPage === 'settings' && (
              <div className="settings-page">
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
                        <span className="time-format-sample">11:59 PM</span>
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
                            <div className="form-row">
                              <div className="form-group"><label className="form-label">{t('settings.cityLabel')}</label><input className="form-input" type="text" value={settingsForm.city} onChange={e => setSettingsForm(prev => ({ ...prev, city: e.target.value }))} required/></div>
                              <div className="form-group"><label className="form-label">{t('settings.countryLabel')}</label><input className="form-input" type="text" value={settingsForm.country} onChange={e => setSettingsForm(prev => ({ ...prev, country: e.target.value }))} required/></div>
                            </div>
                          ) : (
                            <div className="form-row">
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
                          </div>
                        ))}
                      </div>
                      <button type="submit" className="btn btn-primary">{t('settings.apply')}</button>
                    </form>
                  </div>
                </div>
              </div>
            )}
          </main>
        </div>
      )}

      {/* Task Modal */}
      {taskModal.open && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <span className="modal-title">{taskModal.mode === 'add' ? t('modal.addTitle') : t('modal.editTitle')}</span>
              <button className="btn-task-action" onClick={() => setTaskModal(prev => ({ ...prev, open: false }))}><X size={18} /></button>
            </div>
            <form onSubmit={handleTaskSubmit}>
              <div className="modal-body">
                <div className="form-group"><label className="form-label">{t('modal.taskName')}</label><input className="form-input" type="text" value={taskForm.name} onChange={e => setTaskForm(prev => ({ ...prev, name: e.target.value }))} required/></div>
                <div className="form-group"><label className="form-label">{t('modal.details')}</label><textarea className="form-input" placeholder={t('modal.detailsPlaceholder')} value={taskForm.details} onChange={e => setTaskForm(prev => ({ ...prev, details: e.target.value }))}></textarea></div>
                <div className="form-group">
                  <label className="form-label">{t('modal.timeOfDay')}</label>
                  <select
                    className="form-select"
                    value={taskForm.period}
                    onChange={e => {
                      const period = e.target.value;
                      const excludeId = taskModal.task?.id;
                      const nowMin = taskModal.mode === 'add' ? getCurrentPlannerMinutes(currentTime, activeDate) : null;
                      const slots = dayData ? getAvailableStartSlots(period, dayData.tasks, dayData.prayerTimes, excludeId, nowMin) : [];
                      const firstStart = slots.length > 0 ? formatMinutesToTime(slots[0]) : '00:00';
                      const firstStartMin = scheduledTimeToPlannerMinutes(firstStart, period, dayData.prayerTimes);
                      const endSlots = dayData ? getAvailableEndSlots(period, dayData.tasks, dayData.prayerTimes, firstStartMin, excludeId) : [];
                      const endTime = endSlots.length > 0 ? formatMinutesToTime(endSlots[0]) : formatMinutesToTime(firstStartMin + 15);
                      setTaskForm(prev => ({
                        ...prev,
                        period,
                        scheduledTime: firstStart,
                        endTime
                      }));
                    }}
                  >
                    {PLANNER_PERIOD_ORDER.map(key => (
                      <option key={key} value={key}>
                        {t('period.' + key)} — {t('period.' + key + 'Range')}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">{t('modal.startTime')}</label>
                    <select
                      className="form-select"
                      value={taskForm.scheduledTime}
                      onChange={e => {
                        const startTime = e.target.value;
                        const startMin = scheduledTimeToPlannerMinutes(startTime, taskForm.period, dayData.prayerTimes);
                        const endSlots = getAvailableEndSlots(taskForm.period, dayData.tasks, dayData.prayerTimes, startMin, taskModal.task?.id);
                        const endTime = endSlots.length > 0 ? formatMinutesToTime(endSlots[0]) : formatMinutesToTime(startMin + 15);
                        setTaskForm(prev => ({ ...prev, scheduledTime: startTime, endTime }));
                      }}
                    >
                      {(dayData ? getAvailableStartSlots(taskForm.period, dayData.tasks, dayData.prayerTimes, taskModal.task?.id, taskModal.mode === 'add' ? getCurrentPlannerMinutes(currentTime, activeDate) : null) : []).map(min => (
                        <option key={min} value={formatMinutesToTime(min)}>{formatMinutesToTime(min)}</option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">{t('modal.endTime')}</label>
                    {(() => {
                      const prayerTimes = dayData?.prayerTimes;
                      if (!prayerTimes) return <select className="form-select" disabled><option>--:--</option></select>;
                      const endMin = scheduledTimeToPlannerMinutes(taskForm.scheduledTime, taskForm.period, prayerTimes);
                      const slots = getAvailableEndSlots(taskForm.period, dayData.tasks, prayerTimes, endMin, taskModal.task?.id);
                      const allMinutes = slots.map(m => m % 1440);
                      const allHours = [...new Set(allMinutes.map(m => Math.floor(m / 60)))].sort((a, b) => a - b);
                      const curParsed = parseTimeToMinutes(taskForm.endTime);
                      const curHour = Math.floor(curParsed / 60);
                      const curMin = Math.floor(curParsed % 60);
                      const hour = allHours.includes(curHour) ? curHour : (allHours[0] ?? 0);
                      const use12 = getUse12h();
                      const allMinOpts = Array.from({length: 60}, (_, i) => i);
                      return (
                        <div className="time-select-row">
                          <select className="form-select time-select-hour"
                            value={hour}
                            onChange={e => {
                              const h = Number(e.target.value);
                              setTaskForm(prev => ({ ...prev, endTime: formatMinutesToTime(h * 60 + curMin) }));
                            }}
                          >
                            {allHours.map(h => (
                              <option key={h} value={h}>
                                {use12 ? (h % 12 || 12) : String(h).padStart(2, '0')}
                              </option>
                            ))}
                          </select>
                          <span className="time-colon">:</span>
                          <select className="form-select time-select-minute"
                            value={Math.min(59, Math.max(0, curMin))}
                            onChange={e => {
                              const m = Number(e.target.value);
                              setTaskForm(prev => ({ ...prev, endTime: formatMinutesToTime(hour * 60 + m) }));
                            }}
                          >
                            {allMinOpts.map(m => (
                              <option key={m} value={m}>{String(m).padStart(2, '0')}</option>
                            ))}
                          </select>
                          {use12 && <span className="time-ampm">{hour < 12 ? 'AM' : 'PM'}</span>}
                        </div>
                      );
                    })()}
                  </div>
                </div>
                {taskModal.task?.type !== 'fixed' && (
                  <label className="checkbox-label"><input type="checkbox" checked={taskForm.isRecurring} onChange={e => setTaskForm(prev => ({ ...prev, isRecurring: e.target.checked }))}/> {t('modal.recurring')}</label>
                )}
              </div>
              <div className="modal-footer">
                <button type="button" className="btn" onClick={() => setTaskModal(prev => ({ ...prev, open: false }))}>{t('modal.cancel')}</button>
                <button type="submit" className="btn btn-primary">{taskModal.mode === 'add' ? t('modal.create') : t('modal.save')}</button>
              </div>
            </form>
          </div>
        </div>
      )}

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
    </div>
  );
}

export default App;
