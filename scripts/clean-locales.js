// Remove unused locale files from packaged Electron app to reduce size
const fs = require('fs');
const path = require('path');

const distDir = path.join(__dirname, '..', 'dist');
const keepLocales = ['zh-CN', 'zh-TW', 'en-US', 'en-GB'];

// Find the packaged app directory
const dirs = fs.readdirSync(distDir).filter(d => d.startsWith('WorkCalendar'));
for (const dir of dirs) {
  const localesDir = path.join(distDir, dir, 'locales');
  if (!fs.existsSync(localesDir)) continue;

  const files = fs.readdirSync(localesDir);
  let removed = 0;
  for (const file of files) {
    const locale = file.replace('.pak', '');
    if (!keepLocales.includes(locale)) {
      fs.unlinkSync(path.join(localesDir, file));
      removed++;
    }
  }
  console.log(`Cleaned ${removed} locale files, kept: ${keepLocales.join(', ')}`);
}
