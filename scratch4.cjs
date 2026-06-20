const fs = require('fs');

let i18nCode = fs.readFileSync('src/i18n.js', 'utf8');

const replacements = [
  { target: "'nav.journal': 'Notes',", replacement: "'nav.journal': 'Journal'," },
  { target: "'modal.detailsPlaceholder': 'Add notes, location, link…',", replacement: "'modal.detailsPlaceholder': 'Add journal, location, link…'," },
  { target: "'journal.title': 'Notes',", replacement: "'journal.title': 'Journal'," },
  { target: "'journal.studyNotes': 'Notes',", replacement: "'journal.studyNotes': 'Journal'," },
  { target: "'journal.newNote': 'New Note',", replacement: "'journal.newNote': 'New Entry'," },
  { target: "'journal.addNote': 'Add Note',", replacement: "'journal.addNote': 'Add Entry'," },
  { target: "'journal.studyPlaceholder': 'Write your note...',", replacement: "'journal.studyPlaceholder': 'Write your entry...'," },
  { target: "'journal.allNotes': 'All Notes',", replacement: "'journal.allNotes': 'All Entries'," },
  { target: "'journal.noNotes': 'No notes yet. Write your first note above.',", replacement: "'journal.noNotes': 'No entries yet. Write your first entry above.'," },
  { target: "'journal.deleteConfirm': 'Delete this note? This action cannot be undone.',", replacement: "'journal.deleteConfirm': 'Delete this entry? This action cannot be undone.'," },
  { target: "'export.notes': 'Notes',", replacement: "'export.notes': 'Journal'," },
  { target: "'pulse.noNotes': 'No notes today.',", replacement: "'pulse.noNotes': 'No entries today.'," },
  { target: "'pulse.studyNotes': 'Notes',", replacement: "'pulse.studyNotes': 'Journal'," },
  { target: "'habits.notes': 'Notes',", replacement: "'habits.notes': 'Journal'," },
  { target: "'habits.notesPlaceholder': 'Add note...',", replacement: "'habits.notesPlaceholder': 'Add entry...'," },
  { target: "'guide.journal': 'Journal — Daily Notes',", replacement: "'guide.journal': 'Journal — Daily Entries'," },
  { target: "'nav.journal': 'ملاحظات',", replacement: "'nav.journal': 'يوميات'," },
  { target: "'journal.title': 'ملاحظات',", replacement: "'journal.title': 'يوميات'," },
  { target: "'journal.studyNotes': 'ملاحظات',", replacement: "'journal.studyNotes': 'يوميات'," },
  { target: "'journal.newNote': 'ملاحظة جديدة',", replacement: "'journal.newNote': 'إدخال جديد'," },
  { target: "'journal.addNote': 'إضافة ملاحظة',", replacement: "'journal.addNote': 'إضافة إدخال'," },
  { target: "'journal.studyPlaceholder': 'اكتب ملاحظتك...',", replacement: "'journal.studyPlaceholder': 'اكتب إدخالك...'," },
  { target: "'journal.allNotes': 'جميع الملاحظات',", replacement: "'journal.allNotes': 'جميع الإدخالات'," },
  { target: "'journal.noNotes': 'لا توجد ملاحظات بعد. اكتب ملاحظتك الأولى أعلاه.',", replacement: "'journal.noNotes': 'لا توجد إدخالات بعد. اكتب إدخالك الأول أعلاه.'," },
  { target: "'journal.deleteConfirm': 'حذف هذه الملاحظة؟ لا يمكن التراجع عن هذا الإجراء.',", replacement: "'journal.deleteConfirm': 'حذف هذا الإدخال؟ لا يمكن التراجع عن هذا الإجراء.'," },
  { target: "'export.notes': 'ملاحظات',", replacement: "'export.notes': 'يوميات'," },
  { target: "'pulse.noNotes': 'لا توجد ملاحظات اليوم.',", replacement: "'pulse.noNotes': 'لا توجد إدخالات اليوم.'," },
  { target: "'pulse.studyNotes': 'ملاحظات',", replacement: "'pulse.studyNotes': 'يوميات'," },
  { target: "'habits.notes': 'ملاحظات',", replacement: "'habits.notes': 'يوميات'," },
  { target: "'habits.notesPlaceholder': 'أضف ملاحظة...',", replacement: "'habits.notesPlaceholder': 'أضف إدخال...'," },
  { target: "'modal.detailsPlaceholder': 'أضف ملاحظات، موقع، رابط…',", replacement: "'modal.detailsPlaceholder': 'أضف يوميات، موقع، رابط…'," }
];

replacements.forEach(r => {
  i18nCode = i18nCode.replace(r.target, r.replacement);
});

// Update the guide text manually to replace Notes with Journal where applicable:
i18nCode = i18nCode.replace(
  "'guide.journalDesc': 'The Journal (Notes) page lets you write reflections and notes for each prayer period. Select a period using the chip buttons (Fajr, Dhuhr, etc.), type your note, and save it. Notes appear on the Statistics page and in your Markdown export. Use this to track what you learned, things you\\'re grateful for, or any thoughts throughout the day.',",
  "'guide.journalDesc': 'The Journal page lets you write reflections and entries for each prayer period. Select a period using the chip buttons (Fajr, Dhuhr, etc.), type your entry, and save it. Entries appear on the Statistics page and in your Markdown export. Use this to track what you learned, things you\\'re grateful for, or any thoughts throughout the day.',"
);

i18nCode = i18nCode.replace(
  "journal entry, study notes",
  "journal entry"
);

fs.writeFileSync('src/i18n.js', i18nCode);
console.log("Cleanup done.");
