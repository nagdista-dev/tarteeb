import {
  Sparkles, Settings, Clock, Plus, List, BookOpen, Target,
  Moon, Coffee, Activity, Download, Sun, Zap, Heart
} from 'lucide-react';

const STEPS = [
  { icon: Sparkles, color: 'var(--color-emerald)', key: 'whatIs' },
  { icon: Settings, color: 'var(--color-teal)', key: 'gettingStarted' },
  { icon: Clock, color: 'var(--color-emerald)', key: 'timeline' },
  { icon: Plus, color: 'var(--color-gold)', key: 'addTask' },
  { icon: List, color: 'var(--color-emerald)', key: 'tasksPage' },
  { icon: BookOpen, color: 'var(--color-gold)', key: 'journal' },
  { icon: Target, color: 'var(--color-emerald)', key: 'habits' },
  { icon: Moon, color: 'var(--color-gold)', key: 'sleep' },
  { icon: Coffee, color: 'var(--color-teal)', key: 'drinks' },
  { icon: Clock, color: 'var(--color-emerald)', key: 'prayers' },
  { icon: Activity, color: 'var(--color-gold)', key: 'history' },
  { icon: Settings, color: 'var(--color-teal)', key: 'settings' },
  { icon: Download, color: 'var(--color-emerald)', key: 'export' },
  { icon: Sun, color: 'var(--color-gold)', key: 'theme' },
  { icon: Zap, color: 'var(--color-teal)', key: 'shortcuts' },
];

export default function GuidePage({ t }) {
  return (
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
        {STEPS.map((step, i) => {
          const IconComp = step.icon;
          const stepNum = String(i + 1).padStart(2, '0');
          const isLast = i === STEPS.length - 1;
          return (
            <div
              key={step.key}
              className={`guide-card${isLast ? ' guide-card-tips' : ''}`}
              style={{ '--card-accent': step.color }}
            >
              <div className="guide-card-step">{stepNum}</div>
              <div className="guide-card-icon-wrap"><IconComp size={22} /></div>
              <div className="guide-card-content">
                <h3 className="guide-card-title">{t('guide.' + step.key)}</h3>
                <p className="guide-card-desc">{t('guide.' + step.key + 'Desc')}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
