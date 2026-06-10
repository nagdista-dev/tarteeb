export const FIXED_TASK_SCHEDULE = {
  'Maghrib Prayer': { period: 'evening', offset: 0 },
  'Isha Prayer': { period: 'night', offset: 0 },
  'Fajr Prayer': { period: 'morning', offset: 0 },
  'Morning Adhkar': { period: 'morning', offset: 20 },
  'Dhuhr Prayer': { period: 'afternoon', offset: 0 },
  'Asr Prayer': { period: 'late_afternoon', offset: 0 },
  'Evening Adhkar': { period: 'late_afternoon', offset: 0 }
};

export const PRAYER_TO_TASK_NAME = {
  'fajr': 'Fajr Prayer',
  'dhuhr': 'Dhuhr Prayer',
  'asr': 'Asr Prayer',
  'maghrib': 'Maghrib Prayer',
  'isha': 'Isha Prayer'
};

export const FIXED_TASK_PRAYER_KEY = {
  'Fajr Prayer': 'fajr',
  'Dhuhr Prayer': 'dhuhr',
  'Asr Prayer': 'asr',
  'Maghrib Prayer': 'maghrib',
  'Isha Prayer': 'isha'
};

export const TASK_TO_ADHKAR_KEY = {
  'Morning Adhkar': 'adhkar_morning',
  'Evening Adhkar': 'adhkar_evening'
};

export const ADHKAR_KEY_TO_TASK = {
  'adhkar_morning': 'Morning Adhkar',
  'adhkar_evening': 'Evening Adhkar'
};

export const PRAYER_KEYS = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'];
export const PRAYER_STATUSES = ['pending', 'not_completed', 'completed'];
export const TASK_GAP = 5;
export const NOTIF_ICON = '/icons/icon-192.png';

export const FONT_SIZES = ['small', 'normal', 'large', 'xlarge'];
export const FONT_SIZE_VALUES = { small: '14px', normal: '16px', large: '18px', xlarge: '20px' };

export const MOODS = ['happy', 'grateful', 'peaceful', 'energetic', 'tired', 'stressed', 'anxious', 'sad'];
export const MOOD_EMOJIS = { happy: '😊', grateful: '🤲', peaceful: '🕊️', energetic: '⚡', tired: '😴', stressed: '😰', anxious: '😟', sad: '😢' };

export const STATUS_COLORS = {
  completed: 'var(--color-emerald)',
  not_completed: 'var(--color-danger)',
  pending: 'var(--text-tertiary)',
};
