const fs = require('fs');
let code = fs.readFileSync('src/App.jsx', 'utf8');

const replacements = [
  {
    regex: /  \/\/ ---- Alternative Plan Views ----[\s\S]*?  \/\/ ---- Pulse Dashboard \(Professional Resume-Style\) ----/m,
    replacement: `  // ---- Pulse Dashboard (Professional Resume-Style) ----`
  },
  {
    regex: /    if \(isAlt\) \{\n      updateAltDayData\(\{ \.\.\.targetData, tasks: \[\.\.\.targetData\.tasks, formWithDuration\] \}\);\n    \} else \{\n      updateDayData\(\{ \.\.\.targetData, tasks: \[\.\.\.targetData\.tasks, formWithDuration\] \}\);\n    \}/m,
    replacement: `    updateDayData({ ...targetData, tasks: [...targetData.tasks, formWithDuration] });`
  },
  {
    regex: /    if \(isAlt\) \{\n      updateAltDayData\(\{ \.\.\.targetData, tasks: updTasks \}\);\n    \} else \{\n      updateDayData\(\{ \.\.\.targetData, tasks: updTasks \}\);\n    \}/m,
    replacement: `    updateDayData({ ...targetData, tasks: updTasks });`
  }
];

let modified = code;
replacements.forEach(r => {
  let prev = modified;
  modified = modified.replace(r.regex, r.replacement);
  if (prev === modified) {
    console.log("Replacement failed for:", r.regex);
  } else {
    console.log("Replacement SUCCESS for:", r.regex);
  }
});

fs.writeFileSync('src/App.jsx', modified);
console.log("Done");
