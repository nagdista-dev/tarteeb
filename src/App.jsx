import { useState, useEffect } from 'react';
import {
  Check, Plus, Edit2, Trash2, Calendar, Settings, Moon, Sun,
  BookOpen, Clock, Sparkles, MapPin, CheckCircle2, BarChart2, X, AlertCircle,
  ChevronUp, ChevronDown, RefreshCw
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
  'Evening Adhkar': { period: 'late_afternoon', offset: 15 }
};

const getFixedTaskSchedule = (task, prayers) => {
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

    while (usedStarts.has(start) && start + duration + 5 <= blockEnd) {
      start += 5;
    }

    if (usedStarts.has(start)) {
      start = blockStart;
      while (usedStarts.has(start) && start + duration + 5 <= blockEnd) {
        start += 5;
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
  const occupied = tasks
    .map(task => normalizeFixedTask(task, prayers))
    .filter(task => task.period === period)
    .map(task => {
      const start = getTaskStartMinutes(task, prayers);
      return { start, end: start + (Number(task.duration) || 15) };
    })
    .sort((a, b) => a.start - b.start);

  for (let start = blockStart; start + duration <= blockEnd; start += 5) {
    const overlaps = occupied.some(slot => start < slot.end && start + duration > slot.start);
    if (!overlaps) return formatMinutesToTime(start);
  }

  return formatMinutesToTime(blockStart);
};

function App() {
  // ---- UI Navigation ----
  const [currentPage, setCurrentPage] = useState('home'); // home | overview | journal | history | settings

  // ---- Theme ----
  const [theme, setTheme] = useState(() => localStorage.getItem('tarteeb_theme') || 'light');

  // ---- Location Config ----
  const [locationConfig, setLocationConfig] = useState(() => {
    const saved = localStorage.getItem('tarteeb_location_config');
    return saved ? JSON.parse(saved) : { enabled: false, type: 'city', city: 'Cairo', country: 'Egypt', latitude: '30.0444', longitude: '31.2357' };
  });

  // ---- Planner Date & Data ----
  const [activeDate, setActiveDate] = useState(() => getLogicalPlannerDate(new Date()));
  const [dayData, setDayData] = useState(null);

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
    name: '', details: '', duration: 15, period: 'evening', scheduledTime: '19:00', isRecurring: false
  });
  const [settingsForm, setSettingsForm] = useState({ ...locationConfig });
  const [manualTimesForm, setManualTimesForm] = useState({ fajr: '', dhuhr: '', asr: '', maghrib: '', isha: '' });
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
      setTaskForm({
        name: '', details: '', duration: 15, period,
        scheduledTime: getFirstAvailableTimeForPeriod(period, dayData.tasks, prayers),
        isRecurring: false
      });
      setTaskModal({ open: true, mode: 'add', task: null });
    } else if (task && prayers) {
      setTaskForm({
        name: task.name,
        details: task.details || '',
        duration: task.duration,
        period: task.period,
        scheduledTime: getTaskDisplayTime(task, prayers),
        isRecurring: task.isRecurring || false
      });
      setTaskModal({ open: true, mode: 'edit', task });
    }
  };

  const handleTaskSubmit = (e) => {
    e.preventDefault();
    if (!taskForm.name.trim()) return;
    if (taskModal.mode === 'edit' && taskModal.task?.type === 'fixed') return;
    const validationError = validateTaskForm(taskForm, dayData.tasks, taskModal.task?.id);
    if (validationError) {
      alert(validationError);
      return;
    }

    let newTasks;
    if (taskModal.mode === 'add') {
      const newTask = {
        id: createTaskId(),
        name: taskForm.name,
        details: taskForm.details,
        duration: Number(taskForm.duration) || 15,
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
        duration: Number(taskForm.duration) || 15,
        period: taskForm.period,
        scheduledTime: taskForm.scheduledTime,
        isRecurring: taskForm.isRecurring,
        type: taskForm.isRecurring ? 'user' : (t.type === 'fixed' ? 'fixed' : 'personal')
      } : t);
    }
    updateDayData({ ...dayData, tasks: newTasks });
    setTaskModal({ open: false, mode: 'add', task: null });
  };

  const deleteTask = (id) => {
    const task = dayData?.tasks.find(t => t.id === id);
    if (task?.type === 'fixed') return;
    if (confirm('Delete this task?')) {
      const newTasks = dayData.tasks.filter(t => t.id !== id);
      updateDayData({ ...dayData, tasks: newTasks });
    }
  };

  const handleDiaryChange = (e) => {
    if (!dayData) return;
    updateDayData({ ...dayData, diary: e.target.value });
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
      alert('Settings saved and timings refreshed');
    } catch (err) {
      console.error(err);
      setApiError('Failed to fetch prayer times – check the location settings.');
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
    alert('Manual times applied');
  };

  const formatHumanDate = (dateStr) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  };

  const validateTaskForm = (form, existingTasks, editingId = null) => {
    if (!dayData?.prayerTimes) return 'Prayer times are not loaded yet.';
    const prayers = dayData.prayerTimes;
    const duration = Number(form.duration) || 0;
    const blockStart = getPeriodStartMinutes(form.period, prayers);
    const blockEnd = getPeriodEndMinutes(form.period, prayers);
    const blockDuration = blockEnd - blockStart;
    const start = scheduledTimeToPlannerMinutes(form.scheduledTime, form.period, prayers);
    const end = start + duration;

    if (duration <= 0) return 'Task duration must be greater than 0 minutes.';
    if (duration > blockDuration) return 'Task duration cannot exceed its prayer block.';
    if (start < blockStart || start >= blockEnd) return 'Task start time must be inside its prayer block.';
    if (end > blockEnd) return 'Task end time must stay inside its prayer block.';

    const conflictingTask = existingTasks.some(t => {
      const normalized = normalizeFixedTask(t, prayers);
      if (normalized.id === editingId || normalized.period !== form.period) return false;
      const existingStart = getTaskStartMinutes(normalized, prayers);
      const existingEnd = existingStart + (Number(normalized.duration) || 15);
      return start < existingEnd && end > existingStart;
    });

    if (conflictingTask) return 'Another task already occupies this time in the same prayer block.';
    return '';
  };

  // ---- Rendering helpers ----
  const renderFullDayView = () => {
    const prayers = dayData.prayerTimes;
    const completedCount = dayData.tasks.filter(t => t.completed).length;
    const dayStart = getPeriodStartMinutes('evening', prayers);
    const dayEnd = getPeriodEndMinutes('late_afternoon', prayers);
    const dayDuration = dayEnd - dayStart;
    const timelineHeight = Math.max(980, Math.min(1320, dayDuration * 0.78));
    const sortedTasks = sortTasksForPlannerDay(dayData.tasks, prayers);
    const markers = [
      { key: 'maghrib_start', prayer: 'Maghrib', time: prayers.maghrib, minutes: dayStart },
      { key: 'isha', prayer: 'Isha', time: prayers.isha, minutes: getPeriodStartMinutes('night', prayers) },
      { key: 'fajr', prayer: 'Fajr', time: prayers.fajr, minutes: getPeriodStartMinutes('morning', prayers) },
      { key: 'dhuhr', prayer: 'Dhuhr', time: prayers.dhuhr, minutes: getPeriodStartMinutes('afternoon', prayers) },
      { key: 'asr', prayer: 'Asr', time: prayers.asr, minutes: getPeriodStartMinutes('late_afternoon', prayers) },
      { key: 'maghrib_end', prayer: 'Maghrib', time: prayers.maghrib, minutes: dayEnd }
    ];
    const prayerBoxes = markers.slice(0, -1);
    const periodBands = [
      { key: 'night-band', label: 'Night Period', start: dayStart, end: getPeriodStartMinutes('morning', prayers) },
      { key: 'day-band', label: 'Day Period', start: getPeriodStartMinutes('morning', prayers), end: dayEnd }
    ];
    const toPercent = (minutes) => ((minutes - dayStart) / dayDuration) * 100;
    const currentPlannerMinutes = getCurrentPlannerMinutes(currentTime, activeDate);
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
        <header className="homepage-hero">
          <div>
            <span className="homepage-eyebrow">Prayer-based daily planner</span>
            <h1>{formatHumanDate(dayData.date)}</h1>
            <div className="homepage-meta">
              {dayData.hijriDate && <span>{dayData.hijriDate}</span>}
              {timelineStatus?.nextPrayerName && (
                <span><Clock size={14} /> {timelineStatus.timeToNextPrayer} until {timelineStatus.nextPrayerName}</span>
              )}
            </div>
          </div>
          <div className="homepage-score-card">
            <span>Daily completion</span>
            <strong>{dayData.stats.overallCompleted}%</strong>
            <small>{completedCount}/{dayData.tasks.length} tasks complete</small>
          </div>
        </header>

        <article className="continuous-day-card">
          <div className="continuous-day-header">
            <div>
              <span className="homepage-eyebrow">Complete daily cycle</span>
              <h2>Maghrib to Maghrib</h2>
            </div>
            <button type="button" className="btn btn-primary day-planner-add-btn" onClick={() => openTaskModal('add')}>
              <Plus size={16} />
              Add Task
            </button>
          </div>

          <div className="prayer-time-strip" aria-label="Prayer times">
            {prayerBoxes.map(marker => (
              <div
                key={marker.key}
                className={`prayer-time-box ${currentPlannerMinutes >= marker.minutes ? 'prayer-time-box-past' : ''}`}
              >
                <span>{marker.prayer}</span>
                <strong>{marker.time}</strong>
              </div>
            ))}
          </div>

          <div className="continuous-timeline" style={{ '--timeline-height': `${timelineHeight}px` }}>
            <div className="timeline-time-column">
              {hourTicks.map(tick => (
                <span key={tick.key} style={{ top: `${toPercent(tick.minutes)}%` }}>
                  {tick.label}
                </span>
              ))}
            </div>

            <div className="timeline-board">
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
                  aria-label={`${marker.prayer} boundary`}
                />
              ))}

              {sortedTasks.map(task => {
                const taskStart = getTaskStartMinutes(task, prayers);
                const blockEnd = getPeriodEndMinutes(task.period, prayers);
                const duration = Math.max(5, Math.min(Number(task.duration) || 15, blockEnd - taskStart));
                const top = toPercent(taskStart);
                const rawHeight = (duration / dayDuration) * timelineHeight;
                const availableHeight = Math.max(28, timelineHeight - ((top / 100) * timelineHeight) - 10);
                const visualHeight = Math.min(Math.max(42, rawHeight), availableHeight);

                return (
                  <div
                    key={task.id}
                    className={`timeline-task-card task-${task.type} ${task.completed ? 'completed' : ''}`}
                    style={{ top: `${top}%`, height: `${visualHeight}px` }}
                  >
                    <button
                      type="button"
                      className={`task-checkbox block-task-check ${task.completed ? 'checked' : ''}`}
                      onClick={() => toggleTaskCompletion(task.id)}
                      aria-label={task.completed ? 'Mark task incomplete' : 'Mark task complete'}
                    >
                      {task.completed && <Check size={12} />}
                    </button>
                      <div className="block-task-main">
                        <div className="block-task-topline">
                          <span className="block-task-time">{getTaskDisplayTime(task, prayers)}</span>
                          <span className="block-task-duration">{formatDurationHours(duration)}</span>
                        </div>
                        <strong>{task.name}</strong>
                        {task.type === 'fixed' && (
                          <small className="fixed-task-note">
                            Prayer has been decreed at specified times.
                          </small>
                        )}
                      </div>
                    {task.type !== 'fixed' && (
                      <div className="block-task-actions">
                        <button type="button" className="btn-task-action" onClick={() => openTaskModal('edit', task)} aria-label="Edit task">
                          <Edit2 size={12} />
                        </button>
                        <button type="button" className="btn-task-action delete" onClick={() => deleteTask(task.id)} aria-label="Delete task">
                          <Trash2 size={12} />
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </article>
      </section>
    );
  };

  // ---- Sidebar navigation links ----
  const sidebarLinks = [
    { id: 'home', label: 'Home', icon: Sparkles },
    { id: 'overview', label: 'Overview', icon: BarChart2 },
    { id: 'journal', label: 'Journal', icon: BookOpen },
    { id: 'history', label: 'History', icon: Calendar },
    { id: 'settings', label: 'Settings', icon: Settings }
  ];

  // ---- Main render ----
  return (
    <div className="app-container">
      {/* Header */}
      <header className="app-header">
        <div className="brand-section">
          <h1 className="brand-title">
            <Sparkles size={26} />
            ترتيب <span style={{ fontFamily: 'var(--font-sans)', fontWeight: 500, fontSize: '1.4rem' }}>Tarteeb</span>
          </h1>
          <p className="brand-subtitle">DAILY PRODUCTIVITY & SPIRITUAL PLANNER</p>
        </div>
        <div className="header-actions">
          <button className="btn btn-icon" onClick={() => setTheme(t => t === 'light' ? 'dark' : 'light')} title="Toggle Light/Dark">
            {theme === 'light' ? <Moon size={18} /> : <Sun size={18} />}
          </button>
        </div>
      </header>

      {/* Full‑screen layout with left sidebar */}
      {dayData && (
        <div className="main-layout full-screen">
          {/* Left Sidebar */}
          <aside className="full-sidebar">
            <div className="sidebar-header">
              <span className="sidebar-header-label">Navigation</span>
            </div>
            <nav className="sidebar-nav">
              {sidebarLinks.map(link => (
                <button
                  key={link.id}
                  className={`sidebar-link ${currentPage === link.id ? 'active' : ''}`}
                  onClick={() => setCurrentPage(link.id)}
                >
                  <link.icon size={18} />
                  <span>{link.label}</span>
                </button>
              ))}
            </nav>
          </aside>

          {/* Main Content Area */}
          <main className="content-area">
            {loading && (
              <div style={{ textAlign: 'center', padding: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', color: 'var(--color-emerald)' }}>
                <RefreshCw className="animate-spin" size={16} />
                <span style={{ fontSize: '0.85rem' }}>Updating prayer times...</span>
              </div>
            )}

            {/* Conditional Pages */}
            {currentPage === 'home' && renderFullDayView()}

            {currentPage === 'overview' && (
              <div className="stats-section">
                <h3 style={{ fontSize: '1rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <CheckCircle2 size={18} style={{ color: 'var(--color-emerald)' }} />
                  Daily Progress Overview
                </h3>
                <div className="stats-grid">
                  <div className="stat-box">
                    <div className="stat-header">
                      <span className="stat-label">Overall Completed</span>
                      <span className="stat-value">{dayData.stats.overallCompleted}%</span>
                    </div>
                    <div className="progress-container"><div className="progress-bar progress-overall" style={{ width: `${dayData.stats.overallCompleted}%` }}></div></div>
                  </div>
                  <div className="stat-box">
                    <div className="stat-header">
                      <span className="stat-label">Islamic Duties</span>
                      <span className="stat-value">{dayData.stats.fixedCompleted}%</span>
                    </div>
                    <div className="progress-container"><div className="progress-bar progress-fixed" style={{ width: `${dayData.stats.fixedCompleted}%` }}></div></div>
                  </div>
                  <div className="stat-box">
                    <div className="stat-header">
                      <span className="stat-label">Personal Goals</span>
                      <span className="stat-value">{dayData.stats.personalCompleted}%</span>
                    </div>
                    <div className="progress-container"><div className="progress-bar progress-personal" style={{ width: `${dayData.stats.personalCompleted}%` }}></div></div>
                  </div>
                </div>
              </div>
            )}

            {currentPage === 'journal' && (
              <div className="stats-section">
                <h3 style={{ fontSize: '1rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <BookOpen size={18} style={{ color: 'var(--color-gold)' }} />
                  Journal
                </h3>
                <textarea className="diary-textarea" value={dayData.diary || ''} onChange={handleDiaryChange} placeholder="Write your reflections..."/> 
              </div>
            )}

            {currentPage === 'history' && (
              <div className="stats-section">
                <h3 style={{ fontSize: '1rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Calendar size={18} style={{ color: 'var(--color-gold)' }} />
                  History Log
                </h3>
                <div className="history-list">
                  {historyDates.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '16px', color: 'var(--text-tertiary)' }}>No history yet.</div>
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
                        <div key={dateStr} className="history-card" onClick={() => setExpandedHistoryDate(expanded ? null : dateStr)}>
                          <div className="history-card-header">
                            <span className="history-card-date">{formatHumanDate(dateStr)}</span>
                            <div className="history-card-stats">
                              <span className="task-badge badge-fixed">{hist.stats?.overallCompleted ?? 0}%</span>
                              {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                            </div>
                          </div>
                          {expanded && hist.diary && (
                            <div style={{ paddingTop: '8px' }} onClick={e => e.stopPropagation()}>
                              <p className="history-card-diary">{hist.diary}</p>
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}

            {currentPage === 'settings' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {/* Location Settings */}
                <div>
                  <h3 style={{ fontSize: '0.95rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <MapPin size={16} style={{ color: 'var(--color-emerald)' }}/> Aladhan API Settings
                  </h3>
                  {apiError && (
                    <div style={{ padding: '8px', backgroundColor: 'var(--color-danger-bg)', border: '1px solid var(--color-danger)', color: 'var(--color-danger)' }}>
                      <AlertCircle size={14} /> {apiError}
                    </div>
                  )}
                  <form onSubmit={handleSettingsSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <label className="checkbox-label">
                      <input type="checkbox" checked={settingsForm.enabled} onChange={e => setSettingsForm(prev => ({ ...prev, enabled: e.target.checked }))} /> Enable API
                    </label>
                    {settingsForm.enabled && (
                      <>
                        <div className="form-group">
                          <span className="form-label">Mode</span>
                          <div style={{ display: 'flex', gap: '10px' }}>
                            <label className="checkbox-label"><input type="radio" name="locMode" checked={settingsForm.type === 'city'} onChange={() => setSettingsForm(prev => ({ ...prev, type: 'city' }))} /> City</label>
                            <label className="checkbox-label"><input type="radio" name="locMode" checked={settingsForm.type === 'coords'} onChange={() => setSettingsForm(prev => ({ ...prev, type: 'coords' }))} /> Coordinates</label>
                          </div>
                        </div>
                        {settingsForm.type === 'city' ? (
                          <div className="form-row">
                            <div className="form-group"><label className="form-label">City</label><input className="form-input" type="text" value={settingsForm.city} onChange={e => setSettingsForm(prev => ({ ...prev, city: e.target.value }))} required/></div>
                            <div className="form-group"><label className="form-label">Country</label><input className="form-input" type="text" value={settingsForm.country} onChange={e => setSettingsForm(prev => ({ ...prev, country: e.target.value }))} required/></div>
                          </div>
                        ) : (
                          <div className="form-row">
                            <div className="form-group"><label className="form-label">Lat</label><input className="form-input" type="number" step="0.0001" value={settingsForm.latitude} onChange={e => setSettingsForm(prev => ({ ...prev, latitude: e.target.value }))} required/></div>
                            <div className="form-group"><label className="form-label">Lng</label><input className="form-input" type="number" step="0.0001" value={settingsForm.longitude} onChange={e => setSettingsForm(prev => ({ ...prev, longitude: e.target.value }))} required/></div>
                          </div>
                        )}
                      </>
                    )}
                    <button type="submit" className="btn btn-primary" disabled={loading}>Save Settings</button>
                  </form>
                </div>
                {/* Manual Overrides */}
                <div>
                  <h3 style={{ fontSize: '0.95rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Clock size={16} style={{ color: 'var(--color-gold)' }}/> Manual Overrides
                  </h3>
                  <form onSubmit={handleManualTimesSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(80px, 1fr))', gap: '6px' }}>
                      {['fajr','dhuhr','asr','maghrib','isha'].map(p => (
                        <div key={p} className="form-group">
                          <label className="form-label" style={{ fontSize: '0.75rem' }}>{p.charAt(0).toUpperCase()+p.slice(1)}</label>
                          <input className="form-input" type="text" value={manualTimesForm[p]} onChange={e => setManualTimesForm(prev => ({ ...prev, [p]: e.target.value }))} required />
                        </div>
                      ))}
                    </div>
                    <button type="submit" className="btn">Apply Overrides</button>
                  </form>
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
              <span className="modal-title">{taskModal.mode === 'add' ? 'Add Task' : 'Edit Task'}</span>
              <button className="btn-task-action" onClick={() => setTaskModal(prev => ({ ...prev, open: false }))}><X size={18} /></button>
            </div>
            <form onSubmit={handleTaskSubmit}>
              <div className="modal-body">
                <div className="form-group"><label className="form-label">Task Name *</label><input className="form-input" type="text" value={taskForm.name} onChange={e => setTaskForm(prev => ({ ...prev, name: e.target.value }))} required/></div>
                <div className="form-group"><label className="form-label">Details</label><textarea className="form-input" value={taskForm.details} onChange={e => setTaskForm(prev => ({ ...prev, details: e.target.value }))}></textarea></div>
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Time of day</label>
                    <select
                      className="form-select"
                      value={taskForm.period}
                      onChange={e => {
                        const period = e.target.value;
                        setTaskForm(prev => ({
                          ...prev,
                          period,
                          scheduledTime: dayData
                            ? getDefaultTimeForPeriod(period, dayData.prayerTimes)
                            : prev.scheduledTime
                        }));
                      }}
                    >
                      {PLANNER_PERIOD_ORDER.map(key => (
                        <option key={key} value={key}>
                          {PERIODS_META[key].name} — {PERIODS_META[key].range}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Scheduled time</label>
                    <input
                      className="form-input"
                      type="time"
                      value={taskForm.scheduledTime}
                      onChange={e => setTaskForm(prev => ({ ...prev, scheduledTime: e.target.value }))}
                      required
                    />
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Duration (minutes)</label>
                  <input className="form-input" type="number" min="1" value={taskForm.duration} onChange={e => setTaskForm(prev => ({ ...prev, duration: Number(e.target.value) }))} required/>
                </div>
                {taskModal.task?.type !== 'fixed' && (
                  <label className="checkbox-label"><input type="checkbox" checked={taskForm.isRecurring} onChange={e => setTaskForm(prev => ({ ...prev, isRecurring: e.target.checked }))}/> Recurring</label>
                )}
              </div>
              <div className="modal-footer">
                <button type="button" className="btn" onClick={() => setTaskModal(prev => ({ ...prev, open: false }))}>Cancel</button>
                <button type="submit" className="btn btn-primary">{taskModal.mode === 'add' ? 'Create' : 'Save'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
