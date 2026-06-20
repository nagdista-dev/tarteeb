const fs = require('fs');
let code = fs.readFileSync('src/App.jsx', 'utf8');

const replacements = [
  // 1. Remove Alternative Plan state declarations
  {
    target: `  // ---- Alternative Plan Data ----
  const [alternativeDayData, setAlternativeDayData] = useState(null);
  const [altPageView, setAltPageView] = useState('home'); // 'home' | 'tasks'
  const altDayDataRef = useRef(alternativeDayData);
  altDayDataRef.current = alternativeDayData;\n\n`,
    replacement: ''
  },
  // 2. Remove alternative from keydown
  {
    target: `      else if (e.key === 'a') { setCurrentPage('alternative'); setAltPageView('home'); }
      else if (e.key === 'n' && (currentPage === 'home' || currentPage === 'tasks') && dayData) {
        openTaskModal('add');
      }
      else if (e.key === 'n' && currentPage === 'alternative' && altDayDataRef.current) {
        openAltTaskModal('add');
      }`,
    replacement: `      else if (e.key === 'n' && (currentPage === 'home' || currentPage === 'tasks') && dayData) {
        openTaskModal('add');
      }`
  },
  // 3. Remove Load Alternative Day Data block completely
  {
    regex: /  \/\/ ---- Load \/ Init alternative plan data ----[\s\S]*?\}, \[activeDate, dayData\?\.prayerTimes\]\);\n\n/,
    replacement: ''
  },
  // 4. Remove updateAltDayData and alt tasks functions
  {
    regex: /  const updateAltDayData = \([\s\S]*?  const handleTaskSubmit = \(e\) => \{/m,
    replacement: `  const handleTaskSubmit = (e) => {`
  },
  // 5. Cleanup handleTaskSubmit logic
  {
    regex: /    const isAlt = taskModal\.isAlternative;\n    const targetData = isAlt \? altDayDataRef\.current : dayData;/m,
    replacement: `    const targetData = dayData;`
  },
  {
    regex: /    if \(isAlt\) \{\n      updateAltDayData\(\{ \.\.\.targetData, tasks: \[\.\.\.targetData\.tasks, formWithDuration\] \}\);\n    \} else \{\n      updateDayData\(\{ \.\.\.targetData, tasks: \[\.\.\.targetData\.tasks, formWithDuration\] \}\);\n    \}/m,
    replacement: `    updateDayData({ ...targetData, tasks: [...targetData.tasks, formWithDuration] });`
  },
  {
    regex: /    if \(isAlt\) \{\n      updateAltDayData\(\{ \.\.\.targetData, tasks: updTasks \}\);\n    \} else \{\n      updateDayData\(\{ \.\.\.targetData, tasks: updTasks \}\);\n    \}/m,
    replacement: `    updateDayData({ ...targetData, tasks: updTasks });`
  },
  // 6. Remove renderAlternative* functions
  {
    regex: /  \/\/ ---- Alternative Plan Views ----[\s\S]*?  \/\/ ---- Contact Developer ----/m,
    replacement: `  // ---- Contact Developer ----`
  },
  // 7. Remove Alternative Nav item
  {
    target: `    { id: 'alternative', label: t('nav.alternative'), icon: RefreshCw },\n`,
    replacement: ``
  },
  // 8. Remove Alternative from Desktop / Mobile content switch
  {
    target: `            {currentPage === 'alternative' && (
              altPageView === 'home' ? renderAlternativeDayView() : renderAlternativeTasksView()
            )}\n`,
    replacement: ``
  },
  // 9. Remove FAB for alternative
  {
    regex: /        \{currentPage === 'alternative' && altDayDataRef\.current && \([\s\S]*?        \)\}\n/m,
    replacement: ``
  },
  // 10. taskActionPopup fixes
  {
    target: `                  if (taskActionPopup.isAlternative) {
                    toggleAltTaskCompletion(task.id);
                  } else {
                    toggleTaskCompletion(task.id);
                  }`,
    replacement: `                  toggleTaskCompletion(task.id);`
  },
  {
    target: `                      if (taskActionPopup.isAlternative) {
                        openAltTaskModal('edit', task);
                      } else {
                        openTaskModal('edit', task);
                      }`,
    replacement: `                      openTaskModal('edit', task);`
  },
  {
    target: `                      if (taskActionPopup.isAlternative) {
                        deleteAltTask(task.id);
                      } else {
                        deleteTask(task.id);
                      }`,
    replacement: `                      deleteTask(task.id);`
  }
];

let modified = code;
replacements.forEach(r => {
  let prev = modified;
  if (r.target) {
    modified = modified.replace(r.target, r.replacement);
  } else if (r.regex) {
    modified = modified.replace(r.regex, r.replacement);
  }
  if (prev === modified) {
    console.log("Replacement failed for:", r.target || r.regex);
  } else {
    console.log("Replacement SUCCESS for:", r.target || r.regex);
  }
});

fs.writeFileSync('src/App.jsx', modified);
console.log("Done");
