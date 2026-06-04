const en = {
  /* Brand */
  'brand.title': 'Tarteeb',
  'brand.subtitle': 'Prayer-based daily planner',

  /* Navigation */
  'nav.home': 'Home',
  'nav.overview': 'Overview',
  'nav.journal': 'Journal',
  'nav.tasks': 'Tasks',
  'nav.history': 'History',
  'nav.settings': 'Settings',
  'nav.guide': 'How to Use',
  'nav.navigation': 'Navigation',
  'nav.openSidebar': 'Open sidebar',
  'nav.closeSidebar': 'Close sidebar',
  'nav.toggleTheme': 'Toggle Light/Dark',

  /* Header actions */
  'header.addTask': 'Add Task',
  'header.export': 'Export',
  'header.exportTitle': 'Export to Markdown',
  'header.loading': 'Updating prayer times...',

  /* Sidebar planner */
  'sidebar.complete': '% complete',

  /* Timeline bands */
  'band.night': 'Night Period',
  'band.day': 'Day Period',

  /* Task card */
  'task.markComplete': 'Mark task complete',
  'task.markIncomplete': 'Mark task incomplete',
  'task.edit': 'Edit task',
  'task.deleteAria': 'Delete task',

  /* Task modal */
  'modal.addTitle': 'Add Task',
  'modal.editTitle': 'Edit Task',
  'modal.taskName': 'Task Name *',
  'modal.details': 'Details',
  'modal.timeOfDay': 'Time of day',
  'modal.startTime': 'Start time',
  'modal.endTime': 'End time',
  'modal.recurring': 'Recurring',
  'modal.cancel': 'Cancel',
  'modal.create': 'Create',
  'modal.save': 'Save',

  /* Period names (from PERIODS_META) */
  'period.evening': 'Evening',
  'period.eveningRange': 'Maghrib to Isha',
  'period.night': 'Night',
  'period.nightRange': 'Isha to Fajr',
  'period.morning': 'Morning',
  'period.morningRange': 'Fajr to Dhuhr',
  'period.afternoon': 'Afternoon',
  'period.afternoonRange': 'Dhuhr to Asr',
  'period.late_afternoon': 'Late Afternoon',
  'period.late_afternoonRange': 'Asr to Maghrib',

  /* Tasks page */
  'tasks.title': "Today's Tasks",
  'tasks.total': 'Total',
  'tasks.completed': 'Completed',
  'tasks.remaining': 'Remaining',
  'tasks.overall': 'Overall Progress',
  'tasks.noTasks': 'No tasks for this period yet.',
  'tasks.completion': 'completion',

  /* Journal page */
  'journal.title': 'Journal',
  'journal.saved': 'Saved',
  'journal.save': 'Save',
  'journal.placeholder': 'Write your reflections for today...',

  /* History page */
  'history.title': 'History Log',
  'history.empty': 'No history yet. Start planning your days!',
  'history.openDay': 'Open Day',
  'history.delete': 'Delete',

  /* Settings page */
  'settings.locationTitle': 'Location',
  'settings.locationDesc': 'Fetch prayer times for your city or coordinates',
  'settings.useApi': 'Use Aladhan API',
  'settings.mode': 'Mode',
  'settings.city': 'City',
  'settings.coords': 'Coordinates',
  'settings.cityLabel': 'City',
  'settings.countryLabel': 'Country',
  'settings.latLabel': 'Latitude',
  'settings.lngLabel': 'Longitude',
  'settings.saveSettings': 'Save Settings',
  'settings.manualTitle': 'Manual Overrides',
  'settings.manualDesc': 'Set prayer times manually',
  'settings.appearance': 'Appearance',
  'settings.fontSize': 'Font Size',
  'settings.fontSizeDesc': 'Adjust the text size across the website',
  'settings.fontSize_small': 'Small',
  'settings.fontSize_normal': 'Normal',
  'settings.fontSize_large': 'Large',
  'settings.fontSize_xlarge': 'Extra Large',
  'settings.fontSizePreview': 'Aa',
  'settings.timeFormat': 'Time Format',
  'settings.timeFormatDesc': 'Choose between 12-hour and 24-hour display',
  'settings.format24h': '24-Hour',
  'settings.format12h': '12-Hour',
  'settings.fajr': 'Fajr',
  'settings.dhuhr': 'Dhuhr',
  'settings.asr': 'Asr',
  'settings.maghrib': 'Maghrib',
  'settings.isha': 'Isha',
  'settings.apply': 'Apply Overrides',

  /* Dialog */
  'dialog.cancel': 'Cancel',
  'dialog.confirm': 'Confirm',
  'dialog.ok': 'OK',

  /* Confirm / alert messages */
  'confirm.deleteTask': 'Delete this task?',
  'confirm.deleteHistory': 'Delete this day from history?',
  'alert.settingsSaved': 'Settings saved and timings refreshed',
  'alert.apiError': 'Failed to fetch prayer times – check the location settings.',
  'alert.manualApplied': 'Manual times applied',
  'error.prayerTimesNotLoaded': 'Prayer times are not loaded yet.',
  'error.durationZero': 'Task duration must be greater than 0 minutes.',
  'error.durationExceeds': 'Task duration cannot exceed its prayer block.',
  'error.startOutside': 'Task start time must be inside its prayer block.',
  'error.endOutside': 'Task end time must stay inside its prayer block.',
  'error.conflict': 'Another task already occupies this time in the same prayer block.',

  /* Fixed task names */
  'task.maghribPrayer': 'Maghrib Prayer',
  'task.ishaLPrayer': 'Isha Prayer',
  'task.fajrPrayer': 'Fajr Prayer',
  'task.morningAdhkar': 'Morning Adhkar',
  'task.dhuhrPrayer': 'Dhuhr Prayer',
  'task.asrPrayer': 'Asr Prayer',
  'task.eveningAdhkar': 'Evening Adhkar',

  /* Prayer names (display) */
  'prayer.maghrib': 'Maghrib',
  'prayer.isha': 'Isha',
  'prayer.fajr': 'Fajr',
  'prayer.dhuhr': 'Dhuhr',
  'prayer.asr': 'Asr',

  /* Export / Markdown */
  'export.prayerTimes': 'Prayer Times',
  'export.prayer': 'Prayer',
  'export.time': 'Time',
  'export.notes': 'Notes',
  'export.tasks': 'Tasks',
  'export.completed': 'completed',

  /* Duration labels */
  'duration.hour': '1 hour',
  'duration.hours': '% hours',
  'duration.mins': '% mins',
  'duration.hm': '%h %m',

  /* Guide page */
  'guide.title': 'How to Use Tarteeb',
  'guide.subtitle': 'Your prayer-based daily planner — plan your day around the five prayers',
  'guide.whatIs': 'What is Tarteeb?',
  'guide.whatIsDesc': 'Tarteeb is a daily planner organised around the five Islamic prayer times. Each day starts at Maghrib and runs through to the next Asr. Tasks are grouped into prayer-based blocks so you can plan what to do between Fajr and Dhuhr, Dhuhr and Asr, and so on.',
  'guide.timeline': 'The Timeline',
  'guide.timelineDesc': 'The main view shows a vertical timeline of your entire day. The red line marks the current time. Each task appears as a card inside its prayer block. You can mark tasks complete, edit them, or delete them directly from the timeline.',
  'guide.addTask': 'Adding & Editing Tasks',
  'guide.addTaskDesc': 'Click "Add Task" in the header bar. Choose a name, set the time block (e.g. Morning, Afternoon), pick a start and end time, and optionally mark it as recurring. Fixed prayer tasks (Fajr, Dhuhr, etc.) are added automatically and cannot be edited or deleted.',
  'guide.journal': 'Daily Journal',
  'guide.journalDesc': 'The Journal page lets you write reflections for the day. Your entry is saved locally and will appear in the History log alongside the day\'s tasks and stats.',
  'guide.history': 'History Log',
  'guide.historyDesc': 'Every day you open Tarteeb is recorded in History. You can expand any past day to see your journal entry and completion percentage. Use "Open Day" to revisit that day\'s timeline or "Delete" to remove it.',
  'guide.settings': 'Settings',
  'guide.settingsDesc': 'Under Settings you can configure your location for automatic prayer times (city or coordinates via the Aladhan API) or manually enter prayer times. Your settings are saved in the browser.',
  'guide.export': 'Export',
  'guide.exportDesc': 'The Export button downloads a Markdown (.md) file of the current day including prayer times, all tasks with completion status, and your journal entry.',
  'guide.theme': 'Theme & Language',
  'guide.themeDesc': 'Use the moon/sun icon to toggle between light and dark mode. Use the AR/EN button to switch between English and Arabic. Your preferences are remembered for next time.',

  /* Misc */
  'time.until': 'until',
  'prayer.boundary': 'boundary',
  'lang.switch': 'العربية',
};

const ar = {
  /* Brand */
  'brand.title': 'ترتيب',
  'brand.subtitle': 'مخطّط يومي يعتمد على أوقات الصلاة',

  /* Navigation */
  'nav.home': 'الرئيسية',
  'nav.tasks': 'المهام',
  'nav.journal': 'مذكرات',
  'nav.history': 'السجل',
  'nav.settings': 'الإعدادات',
  'nav.guide': 'كيفية الاستخدام',
  'nav.navigation': 'التنقل',
  'nav.openSidebar': 'فتح الشريط الجانبي',
  'nav.closeSidebar': 'إغلاق الشريط الجانبي',
  'nav.toggleTheme': 'تبديل السمة',

  /* Header actions */
  'header.addTask': 'إضافة مهمة',
  'header.export': 'تصدير',
  'header.exportTitle': 'تصدير إلى ماركداون',
  'header.loading': 'جاري تحديث أوقات الصلاة...',

  /* Sidebar planner */
  'sidebar.complete': '% مكتمل',

  /* Timeline bands */
  'band.night': 'الفترة الليلية',
  'band.day': 'الفترة النهارية',

  /* Task card */
  'task.markComplete': 'تحديد كمكتمل',
  'task.markIncomplete': 'تحديد كغير مكتمل',
  'task.edit': 'تعديل المهمة',
  'task.deleteAria': 'حذف المهمة',

  /* Task modal */
  'modal.addTitle': 'إضافة مهمة',
  'modal.editTitle': 'تعديل المهمة',
  'modal.taskName': 'اسم المهمة *',
  'modal.details': 'تفاصيل',
  'modal.timeOfDay': 'الوقت من اليوم',
  'modal.startTime': 'وقت البداية',
  'modal.endTime': 'وقت النهاية',
  'modal.recurring': 'متكرر',
  'modal.cancel': 'إلغاء',
  'modal.create': 'إنشاء',
  'modal.save': 'حفظ',

  /* Period names */
  'period.evening': 'المغرب',
  'period.eveningRange': 'المغرب إلى العشاء',
  'period.night': 'العشاء',
  'period.nightRange': 'العشاء إلى الفجر',
  'period.morning': 'الفجر',
  'period.morningRange': 'الفجر إلى الظهر',
  'period.afternoon': 'الظهر',
  'period.afternoonRange': 'الظهر إلى العصر',
  'period.late_afternoon': 'العصر',
  'period.late_afternoonRange': 'العصر إلى المغرب',

  /* Tasks page */
  'tasks.title': 'مهام اليوم',
  'tasks.total': 'الإجمالي',
  'tasks.completed': 'مكتمل',
  'tasks.remaining': 'متبقي',
  'tasks.overall': 'التقدم العام',
  'tasks.noTasks': 'لا توجد مهام لهذه الفترة بعد.',
  'tasks.completion': 'الإنجاز',

  /* Journal page */
  'journal.title': 'المذكرات',
  'journal.saved': 'تم الحفظ',
  'journal.save': 'حفظ',
  'journal.placeholder': 'اكتب تأملاتك لهذا اليوم...',

  /* History page */
  'history.title': 'سجل الأيام',
  'history.empty': 'لا يوجد سجل بعد. ابدأ في تخطيط أيامك!',
  'history.openDay': 'فتح اليوم',
  'history.delete': 'حذف',

  /* Settings page */
  'settings.appearance': 'المظهر',
  'settings.fontSize': 'حجم الخط',
  'settings.fontSizeDesc': 'تعديل حجم النص في جميع أنحاء الموقع',
  'settings.fontSize_small': 'صغير',
  'settings.fontSize_normal': 'عادي',
  'settings.fontSize_large': 'كبير',
  'settings.fontSize_xlarge': 'كبير جداً',
  'settings.fontSizePreview': 'أأ',
  'settings.timeFormat': 'تنسيق الوقت',
  'settings.timeFormatDesc': 'اختر بين عرض الوقت بنظام ١٢ أو ٢٤ ساعة',
  'settings.format24h': '٢٤ ساعة',
  'settings.format12h': '١٢ ساعة',
  'settings.locationTitle': 'الموقع',
  'settings.locationDesc': 'احصل على أوقات الصلاة لمدينتك أو إحداثياتك',
  'settings.useApi': 'استخدام API الأذان',
  'settings.mode': 'الوضع',
  'settings.city': 'مدينة',
  'settings.coords': 'إحداثيات',
  'settings.cityLabel': 'المدينة',
  'settings.countryLabel': 'الدولة',
  'settings.latLabel': 'خط العرض',
  'settings.lngLabel': 'خط الطول',
  'settings.saveSettings': 'حفظ الإعدادات',
  'settings.manualTitle': 'الإعدادات اليدوية',
  'settings.manualDesc': 'ضبط أوقات الصلاة يدوياً',
  'settings.fajr': 'الفجر',
  'settings.dhuhr': 'الظهر',
  'settings.asr': 'العصر',
  'settings.maghrib': 'المغرب',
  'settings.isha': 'العشاء',
  'settings.apply': 'تطبيق',

  /* Dialog */
  'dialog.cancel': 'إلغاء',
  'dialog.confirm': 'تأكيد',
  'dialog.ok': 'موافق',

  /* Confirm / alert messages */
  'confirm.deleteTask': 'حذف هذه المهمة؟',
  'confirm.deleteHistory': 'حذف هذا اليوم من السجل؟',
  'alert.settingsSaved': 'تم حفظ الإعدادات وتحديث الأوقات',
  'alert.apiError': 'فشل في جلب أوقات الصلاة – تحقق من إعدادات الموقع.',
  'alert.manualApplied': 'تم تطبيق الأوقات اليدوية',
  'error.prayerTimesNotLoaded': 'أوقات الصلاة لم يتم تحميلها بعد.',
  'error.durationZero': 'يجب أن تكون مدة المهمة أكبر من 0 دقيقة.',
  'error.durationExceeds': 'مدة المهمة لا يمكن أن تتجاوز فترة الصلاة.',
  'error.startOutside': 'يجب أن يكون وقت البداية داخل فترة الصلاة.',
  'error.endOutside': 'يجب أن يكون وقت النهاية داخل فترة الصلاة.',
  'error.conflict': 'توجد مهمة أخرى في نفس الوقت ضمن نفس الفترة.',

  /* Fixed task names */
  'task.maghribPrayer': 'صلاة المغرب',
  'task.ishaLPrayer': 'صلاة العشاء',
  'task.fajrPrayer': 'صلاة الفجر',
  'task.morningAdhkar': 'أذكار الصباح',
  'task.dhuhrPrayer': 'صلاة الظهر',
  'task.asrPrayer': 'صلاة العصر',
  'task.eveningAdhkar': 'أذكار المساء',

  /* Prayer names (display) */
  'prayer.maghrib': 'المغرب',
  'prayer.isha': 'العشاء',
  'prayer.fajr': 'الفجر',
  'prayer.dhuhr': 'الظهر',
  'prayer.asr': 'العصر',

  /* Export / Markdown */
  'export.prayerTimes': 'أوقات الصلاة',
  'export.prayer': 'الصلاة',
  'export.time': 'الوقت',
  'export.notes': 'ملاحظات',
  'export.tasks': 'المهام',
  'export.completed': 'مكتمل',

  /* Duration labels */
  'duration.hour': 'ساعة واحدة',
  'duration.hours': '% ساعات',
  'duration.mins': '% دقيقة',
  'duration.hm': '%hس %mد',

  /* Guide page */
  'guide.title': 'كيفية استخدام ترتيب',
  'guide.subtitle': 'مخططك اليومي المعتمد على أوقات الصلاة — نظّم يومك حول الصلوات الخمس',
  'guide.whatIs': 'ما هو ترتيب؟',
  'guide.whatIsDesc': 'ترتيب هو مخطط يومي منظم حول أوقات الصلاة الإسلامية الخمس. يبدأ كل يوم عند المغرب ويمتد حتى العصر من اليوم التالي. يتم تجميع المهام في حزم قائمة على أوقات الصلاة لتتمكن من التخطيط لما ستفعله بين الفجر والظهر، والظهر والعصر، وهكذا.',
  'guide.timeline': 'الخط الزمني',
  'guide.timelineDesc': 'تعرض الشاشة الرئيسية خطاً زمنياً عمودياً ليومك بالكامل. الخط الأحمر يحدد الوقت الحالي. كل مهمة تظهر كبطاقة داخل حزمتها الزمنية. يمكنك تحديد المهام كمكتملة أو تعديلها أو حذفها مباشرة من الخط الزمني.',
  'guide.addTask': 'إضافة وتعديل المهام',
  'guide.addTaskDesc': 'انقر على "إضافة مهمة" في الشريط العلوي. اختر اسماً، وحدد الحزمة الزمنية (مثلاً الصباح، الظهر)، واختر وقت البداية والنهاية، ويمكنك جعلها متكررة. المهام الثابتة (الفجر، الظهر، إلخ) تضاف تلقائياً ولا يمكن تعديلها أو حذفها.',
  'guide.journal': 'المذكرات اليومية',
  'guide.journalDesc': 'تتيح لك صفحة المذكرات كتابة تأملاتك لليوم. يتم حفظ إدخالك محلياً ويظهر في سجل الأيام بجانب المهام والإحصائيات.',
  'guide.history': 'سجل الأيام',
  'guide.historyDesc': 'كل يوم تفتح فيه ترتيب يتم تسجيله في السجل. يمكنك توسيع أي يوم سابق لرؤية إدخال المذكرات ونسبة الإنجاز. استخدم "فتح اليوم" للعودة إلى ذلك اليوم أو "حذف" لإزالته.',
  'guide.settings': 'الإعدادات',
  'guide.settingsDesc': 'تحت الإعدادات يمكنك ضبط موقعك للحصول على أوقات الصلاة تلقائياً (مدينة أو إحداثيات عبر API الأذان) أو إدخال أوقات الصلاة يدوياً. يتم حفظ إعداداتك في المتصفح.',
  'guide.export': 'التصدير',
  'guide.exportDesc': 'يقوم زر التصدير بتنزيل ملف ماركداون (.md) لليوم الحالي يحتوي على أوقات الصلاة وجميع المهام مع حالة الإنجاز وإدخال المذكرات.',
  'guide.theme': 'السمة واللغة',
  'guide.themeDesc': 'استخدم أيقونة القمر/الشمس للتبديل بين الوضع الفاتح والداكن. استخدم زر AR/EN للتبديل بين الإنجليزية والعربية. يتم تذكر تفضيلاتك للمرة القادمة.',

  /* Misc */
  'time.until': 'حتى',
  'prayer.boundary': 'الحدود',
  'lang.switch': 'English',
};

const translations = { en, ar };

let currentLang = 'en';

export function setLanguage(lang) {
  if (translations[lang]) currentLang = lang;
}

export function getLanguage() {
  return currentLang;
}

export function t(key) {
  return translations[currentLang]?.[key] ?? translations.en[key] ?? key;
}

export function translateTaskName(name) {
  const map = {
    'Maghrib Prayer': 'task.maghribPrayer',
    'Isha Prayer': 'task.ishaLPrayer',
    'Fajr Prayer': 'task.fajrPrayer',
    'Morning Adhkar': 'task.morningAdhkar',
    'Dhuhr Prayer': 'task.dhuhrPrayer',
    'Asr Prayer': 'task.asrPrayer',
    'Evening Adhkar': 'task.eveningAdhkar',
  };
  const key = map[name];
  return key ? t(key) : name;
}

export default translations;
