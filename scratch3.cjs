const fs = require('fs');

// Clean up i18n.js
let i18nCode = fs.readFileSync('src/i18n.js', 'utf8');

const i18nReplacements = [
  {
    regex: /  \/\* Alternative Plan \*\/[\s\S]*?'alternative\.fabHint': 'Add alternative task',\n/m,
    replacement: ''
  },
  {
    regex: /  \/\* Alternative Plan \*\/[\s\S]*?'alternative\.fabHint': 'إضافة مهمة بديلة',\n/m,
    replacement: ''
  }
];

i18nReplacements.forEach(r => {
  i18nCode = i18nCode.replace(r.regex, r.replacement);
});

fs.writeFileSync('src/i18n.js', i18nCode);

// Clean up index.css
let cssCode = fs.readFileSync('src/index.css', 'utf8');

const cssReplacements = [
  {
    regex: /\/\* ---- Alternative Plan ---- \*\/[\s\S]*?(?=\/\* ----)/m,
    replacement: ''
  }
];

cssReplacements.forEach(r => {
  cssCode = cssCode.replace(r.regex, r.replacement);
});

fs.writeFileSync('src/index.css', cssCode);
console.log("Cleanup done.");
