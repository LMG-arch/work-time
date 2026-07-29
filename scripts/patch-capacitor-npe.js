/**
 * Idempotent postinstall patch for Capacitor Android.
 *
 * Root cause: on some OEM ROMs (e.g. vivo) WebView.getCurrentWebViewPackage()
 * returns null, and Capacitor's Bridge.isMinimumWebViewInstalled() dereferences
 * info.versionName -> NullPointerException inside Bridge construction, crashing
 * the app immediately on launch (before any JS error overlay can show).
 *
 * This script inserts a null-guard so the app falls through to assuming a
 * compatible WebView is present instead of throwing. It is safe to run any
 * number of times (skips if already applied) and safe on Capacitor upgrades
 * (skips if the marker line is gone).
 */
const fs = require('fs');
const path = require('path');

const BRIDGE = path.resolve(
  __dirname,
  '..',
  'node_modules',
  '@capacitor',
  'android',
  'capacitor',
  'src',
  'main',
  'java',
  'com',
  'getcapacitor',
  'Bridge.java'
);

const MARKER = 'WebView.getCurrentWebViewPackage();';
const GUARD_PRESENT = 'if (info == null || info.versionName == null)';
const GUARD =
  '            if (info == null || info.versionName == null) {\n' +
  '                // Some OEM ROMs (e.g. vivo) return null here instead of a PackageInfo.\n' +
  '                // Don\'t throw NPE and crash the app at launch — assume a compatible\n' +
  '                // WebView is present and let the view load.\n' +
  '                return true;\n' +
  '            }\n';

function main() {
  if (!fs.existsSync(BRIDGE)) {
    console.log('[patch-capacitor-npe] Bridge.java not found, skipping.');
    return;
  }

  let src = fs.readFileSync(BRIDGE, 'utf8');

  if (src.includes(GUARD_PRESENT)) {
    console.log('[patch-capacitor-npe] guard already present, skipping.');
    return;
  }

  const idx = src.indexOf(MARKER);
  if (idx === -1) {
    console.log('[patch-capacitor-npe] marker not found (Capacitor may have changed), skipping.');
    return;
  }

  // Insert the guard on the line immediately after getCurrentWebViewPackage();
  const insertAt = src.indexOf('\n', idx) + 1;
  src = src.slice(0, insertAt) + GUARD + src.slice(insertAt);

  fs.writeFileSync(BRIDGE, src);
  console.log('[patch-capacitor-npe] NPE guard applied to Bridge.java.');
}

main();
