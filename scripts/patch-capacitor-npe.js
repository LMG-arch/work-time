/**
 * Idempotent postinstall patch for Capacitor Android Bridge.java.
 *
 * Patches applied:
 *   1) NPE guard: WebView.getCurrentWebViewPackage() returns null on some OEM ROMs
 *      (e.g. vivo) → null-guard before info.versionName dereference.
 *   2) Plugin crash shield: Bridge.callPluginMethod$0 re-throws plugin exceptions
 *      as RuntimeException (line ~856), killing the process on ANY plugin error.
 *      Changed to notify JS-side error callback and survive.
 *
 * Safe to run any number of times (skips if already applied) and safe on
 * Capacitor upgrades (skips if marker lines are gone).
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

// ---- Patch 1: NPE guard in isMinimumWebViewInstalled() ----
const NPE_MARKER = 'WebView.getCurrentWebViewPackage();';
const NPE_GUARD_PRESENT = 'if (info == null || info.versionName == null)';
const NPE_GUARD =
  '            if (info == null || info.versionName == null) {\n' +
  '                // Some OEM ROMs (e.g. vivo) return null here.\n' +
  '                return true;\n' +
  '            }\n';

// ---- Patch 2: Plugin crash shield in callPluginMethod() ----
const CRASH_THROW_MARKER = 'throw new RuntimeException(ex);';
const CRASH_SHIELD_PRESENT = '[PATCH] Don\'t re-throw';
const CRASH_SHIELD =
  '                    // [PATCH] Don\'t re-throw — notify JS side and survive.\n' +
  '                    // Original: throw new RuntimeException(ex);  <- kills process\n' +
  '                    try { call.errorCallback("Plugin invoke error: " + ex.toString()); } catch (Throwable ignored) {}\n';

function main() {
  if (!fs.existsSync(BRIDGE)) {
    console.log('[patch-capacitor] Bridge.java not found, skipping.');
    return;
  }

  let src = fs.readFileSync(BRIDGE, 'utf8');
  let changed = false;

  // Apply Patch 1: NPE guard
  if (!src.includes(NPE_GUARD_PRESENT)) {
    const idx = src.indexOf(NPE_MARKER);
    if (idx !== -1) {
      const insertAt = src.indexOf('\n', idx) + 1;
      src = src.slice(0, insertAt) + NPE_GUARD + src.slice(insertAt);
      changed = true;
      console.log('[patch-capacitor] NPE guard applied.');
    } else {
      console.log('[patch-capacitor] NPE marker not found (Capacitor changed?), skipping patch 1.');
    }
  } else {
    console.log('[patch-capacitor] NPE guard already present.');
  }

  // Apply Patch 2: Plugin crash shield
  if (!src.includes(CRASH_SHIELD_PRESENT)) {
    if (src.includes(CRASH_THROW_MARKER)) {
      src = src.replace(CRASH_THROW_MARKER, CRASH_SHIELD);
      changed = true;
      console.log('[patch-capacitor] Plugin crash shield applied.');
    } else {
      console.log('[patch-capacitor] Crash throw marker not found, skipping patch 2.');
    }
  } else {
    console.log('[patch-capacitor] Plugin crash shield already present.');
  }

  if (changed) {
    fs.writeFileSync(BRIDGE, src);
    console.log('[patch-capacitor] Bridge.java updated.');
  } else {
    console.log('[patch-capacitor] No changes needed.');
  }
}

main();
