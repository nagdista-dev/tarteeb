import { useState, useEffect } from 'react';
import {
  Check, Plus, Edit2, Trash2, Calendar, Settings, Moon, Sun,
  BookOpen, Clock, Sparkles, MapPin, CheckCircle2, X, AlertCircle,
  ChevronUp, ChevronDown, RefreshCw, Menu, Download, HelpCircle, List
} from 'lucide-react';
import {
  formatDateLocal, addDays, getPrayerTimesForDate,
  getLogicalPlannerDate, getCompiledPrayersForPlannerDate,
  ensurePrayerTimesCached, FIXED_TASKS_TEMPLATES,
  calculateTimelineStatus, PERIODS_META, savePrayerCache, getPrayerCache,
  getPeriodStartMinutes, getPeriodEndMinutes, formatDurationHours,
  PLANNER_PERIOD_ORDER, getDefaultTimeForPeriod, getCurrentPlannerMinutes,
  getTaskDisplayTime, sortTasksForPlannerDay, scheduledTimeToPlannerMinutes,
  formatMinutesToTime
} from './utils/prayerService';

import { t, setLanguage, getLanguage, translateTaskName } from './i18n';

import './App.css';

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

const TASK_GAP = 10;

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

const getFirstAvailableTimeForPeriod = (period, tasks, prayers, duration = 15) => {
  const blockStart = getPeriodStartMinutes(period, prayers);
  const blockEnd = getPeriodEndMinutes(period, prayers);
  const occupied = getOccupiedSlots(period, tasks, prayers);

  for (let start = blockStart; start + duration <= blockEnd; start += TASK_GAP) {
    const overlaps = occupied.some(slot => start < slot.end && start + duration > slot.start);
    if (!overlaps) return formatMinutesToTime(start);
  }

  return formatMinutesToTime(blockStart);
};

const getOccupiedSlots = (period, tasks, prayers) => {
  return tasks
    .map(task => normalizeFixedTask(task, prayers))
    .filter(task => task.period === period)
    .map(task => {
      const start = getTaskStartMinutes(task, prayers);
      return { start, end: start + (Number(task.duration) || 15) };
    })
    .sort((a, b) => a.start - b.start);
};

const getAvailableStartSlots = (period, tasks, prayers) => {
  const blockStart = getPeriodStartMinutes(period, prayers);
  const blockEnd = getPeriodEndMinutes(period, prayers);
  const occupied = getOccupiedSlots(period, tasks, prayers);
  const slots = [];

  for (let start = blockStart; start < blockEnd; start += TASK_GAP) {
    const overlaps = occupied.some(slot => start >= slot.start && start < slot.end);
    if (!overlaps) slots.push(start);
  }

  return slots;
};

const getAvailableEndSlots = (period, tasks, prayers, startMinutes) => {
  const blockEnd = getPeriodEndMinutes(period, prayers);
  const occupied = getOccupiedSlots(period, tasks, prayers);
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
  const [theme, setTheme] = useState(() => localStorage.getItem('tarteeb_theme') || 'light');

  // ---- Language ----
  const [lang, setLang] = useState(() => {
    const saved = localStorage.getItem('tarteeb_lang') || 'en';
    setLanguage(saved);
    return saved;
  });

  useEffect(() => {
    document.documentElement.setAttribute('lang', lang);
    document.documentElement.setAttribute('dir', lang === 'ar' ? 'rtl' : 'ltr');
    localStorage.setItem('tarteeb_lang', lang);
    setLanguage(lang);
  }, [lang]);

  // ---- Location Config ----
  const [locationConfig, setLocationConfig] = useState(() => {
    const saved = localStorage.getItem('tarteeb_location_config');
    return saved ? JSON.parse(saved) : { enabled: false, type: 'city', city: 'Cairo', country: 'Egypt', latitude: '30.0444', longitude: '31.2357' };
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

  // ---- Theme Sync ----
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('tarteeb_theme', theme);
  }, [theme]);

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
      setTimelineStatus(calculateTimelineStatus(currentTime, dayData.prayerTimes, activeDate));
    }
  }, [currentTime, dayData, activeDate]);

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
      const startTime = getFirstAvailableTimeForPeriod(period, dayData.tasks, prayers);
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
    const timelineHeight = Math.max(2200, Math.min(5000, visualDuration * 2.5));
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
      const hour12 = hour % 12 || 12;
      return exact || minute !== 0 ? `${hour12}:${String(minute).padStart(2, '0')}` : `${hour12}`;
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
          <p className="brand-subtitle">{t('brand.subtitle')}</p>
        </div>
        <div className="header-actions">
          {dayData && (
            <button className="btn btn-primary btn-add-task" onClick={() => openTaskModal('add')}>
              <Plus size={16} /> {t('header.addTask')}
            </button>
          )}
          {dayData && (
            <button className="btn btn-export" onClick={exportToMarkdown} title={t('header.exportTitle')}>
              <Download size={16} /> {t('header.export')}
            </button>
          )}
          <button className="btn btn-icon btn-lang" onClick={() => setLang(l => l === 'en' ? 'ar' : 'en')} title={t('lang.switch')}>
            <span style={{ fontSize: '14px', fontWeight: 700 }}>{lang === 'en' ? 'AR' : 'EN'}</span>
          </button>
          <button className="btn btn-icon sidebar-toggle-btn" onClick={() => setSidebarOpen(true)} aria-label={t('nav.openSidebar')}>
            <Menu size={18} />
          </button>
          <button className="btn btn-icon" onClick={() => setTheme(t => t === 'light' ? 'dark' : 'light')} title={t('nav.toggleTheme')}>
            {theme === 'light' ? <Moon size={18} /> : <Sun size={18} />}
          </button>
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
                  { key: 'maghrib', prayer: t('prayer.maghrib'), time: p.maghrib, minutes: ds },
                  { key: 'isha', prayer: t('prayer.isha'), time: p.isha, minutes: getPeriodStartMinutes('night', p) },
                  { key: 'fajr', prayer: t('prayer.fajr'), time: p.fajr, minutes: getPeriodStartMinutes('morning', p) },
                  { key: 'dhuhr', prayer: t('prayer.dhuhr'), time: p.dhuhr, minutes: getPeriodStartMinutes('afternoon', p) },
                  { key: 'asr', prayer: t('prayer.asr'), time: p.asr, minutes: getPeriodStartMinutes('late_afternoon', p) },
                ];
                const cpm = getCurrentPlannerMinutes(currentTime, activeDate);
                const activePeriod = timelineStatus?.activePeriod;
                return boxes.map(box => (
                  <div key={box.key} className={`sidebar-prayer-box ${cpm >= box.minutes ? 'sidebar-prayer-box-past' : ''} ${boxToPeriod[box.key] === activePeriod ? 'sidebar-prayer-box-current' : ''}`}>
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
                          {isCollapsed ? <ChevronUp size={14} style={{ marginLeft: 6 }} /> : <ChevronDown size={14} style={{ marginLeft: 6 }} />}
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

            {currentPage === 'settings' && (
              <div className="settings-page">
                {/* Location Settings */}
                <div className="settings-card">
                  <div className="settings-card-header">
                    <MapPin size={18} className="settings-card-icon settings-icon-green" />
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
                    <Clock size={18} className="settings-card-icon settings-icon-gold" />
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
                <div className="form-group"><label className="form-label">{t('modal.details')}</label><textarea className="form-input" value={taskForm.details} onChange={e => setTaskForm(prev => ({ ...prev, details: e.target.value }))}></textarea></div>
                <div className="form-group">
                  <label className="form-label">{t('modal.timeOfDay')}</label>
                  <select
                    className="form-select"
                    value={taskForm.period}
                    onChange={e => {
                      const period = e.target.value;
                      const slots = dayData ? getAvailableStartSlots(period, dayData.tasks, dayData.prayerTimes) : [];
                      const firstStart = slots.length > 0 ? formatMinutesToTime(slots[0]) : '00:00';
                      const firstStartMin = scheduledTimeToPlannerMinutes(firstStart, period, dayData.prayerTimes);
                      const endSlots = dayData ? getAvailableEndSlots(period, dayData.tasks, dayData.prayerTimes, firstStartMin) : [];
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
                        const endSlots = getAvailableEndSlots(taskForm.period, dayData.tasks, dayData.prayerTimes, startMin);
                        const endTime = endSlots.length > 0 ? formatMinutesToTime(endSlots[0]) : formatMinutesToTime(startMin + 15);
                        setTaskForm(prev => ({ ...prev, scheduledTime: startTime, endTime }));
                      }}
                    >
                      {(dayData ? getAvailableStartSlots(taskForm.period, dayData.tasks, dayData.prayerTimes) : []).map(min => (
                        <option key={min} value={formatMinutesToTime(min)}>{formatMinutesToTime(min)}</option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">{t('modal.endTime')}</label>
                    <select
                      className="form-select"
                      value={taskForm.endTime}
                      onChange={e => setTaskForm(prev => ({ ...prev, endTime: e.target.value }))}
                    >
                      {(dayData ? getAvailableEndSlots(taskForm.period, dayData.tasks, dayData.prayerTimes, scheduledTimeToPlannerMinutes(taskForm.scheduledTime, taskForm.period, dayData.prayerTimes)) : []).map(min => (
                        <option key={min} value={formatMinutesToTime(min)}>{formatMinutesToTime(min)}</option>
                      ))}
                    </select>
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
