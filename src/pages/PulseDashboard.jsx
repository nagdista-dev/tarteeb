import {
  Activity, TrendingUp, Award, Target, Check, Minus, Clock,
  BookOpen, BarChart3, Moon, Coffee
} from 'lucide-react';
import { getPlannerPeriodOrder } from '../utils/prayerService';
import { PRAYER_TO_TASK_NAME, PRAYER_KEYS, STATUS_COLORS } from '../utils/constants';

function ProgressRing({ pct, size = 72, strokeWidth = 5, color, bgColor = 'var(--bg-primary)' }) {
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
}

function ScoreRow({ label, pct, pts, color }) {
  return (
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
}

export default function PulseDashboard({
  t, dayData, habits, prevDayData,
  prayerTracking, todayStr, todayDrinks, todayTotalSleep,
  computeStreak, formatHumanDate
}) {
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
  const sleepHours = todayTotalSleep;
  const sleepScore = Math.min(Math.round((sleepHours / 8) * 100), 100);
  const streakScore = Math.min(streak * 10, 100);

  const compositeScore = Math.round(
    (overallPct * 0.25) + (habitsPct * 0.20) + (prayerPct * 0.30) + (sleepScore * 0.15) + (streakScore * 0.10)
  );
  const scoreLabel = compositeScore >= 85 ? t('pulse.scoreExcellent')
    : compositeScore >= 65 ? t('pulse.scoreGood')
    : compositeScore >= 45 ? t('pulse.scoreFair')
    : t('pulse.scoreNeedsWork');

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
          <div className="new-pulse-date">
            <span className="date-gregorian">{formatHumanDate(todayStr)}</span>
            {dayData.hijriDate && <span className="date-hijri">{dayData.hijriDate}</span>}
          </div>
        </div>
      </div>

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

      <div className="new-pulse-content-grid">
        <div className="new-pulse-column-left">
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

        <div className="new-pulse-column-right">
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
}
