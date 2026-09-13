#!/usr/bin/env node
// barename-audit.cjs — 垫片裁剪后的裸名审计（回归矩阵项，见 docs/重构计划-2026-09-11.md §9.8）
//
// 背景：`foo()` 与 `window.foo()` 等价（都经全局对象解析）。精简 shims.js 的 window.* 绑定后，
// 仍以裸名调用旧绑定的模块会抛 ReferenceError；若发生在 async 函数内，会变成「未处理的
// Promise 拒绝」，逃过调用方的 try/catch（v3.17.42 线上崩溃即此类）。
// 本脚本比对「基线 tag 的 shims 绑定集」与「当前 shims.js 绑定集」的差集，
// 再逐文件扫描这些「已删除绑定」是否仍被裸名调用（排除本地声明 / import / window.X 前缀）。
//
// 用法：node scripts/barename-audit.cjs [基线tag]        （默认 v3.17.41）
// 退出码：0 = 无残留；1 = 有残留（可用于 CI / 发布前卡点）

const fs = require('fs');
const path = require('path');
const cp = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'src');
const BASELINE = process.argv[2] || 'v3.17.41';

function bindNames(src) {
  const out = new Set();
  const re = /window\.([A-Za-z_$][\w$]*)\s*=/g;
  let m;
  while ((m = re.exec(src))) out.add(m[1]);
  return out;
}

const oldShims = cp.execSync(`git show ${BASELINE}:src/shims.js`, { cwd: ROOT, encoding: 'utf8', maxBuffer: 1e8 });
const curShims = fs.readFileSync(path.join(SRC, 'shims.js'), 'utf8');
const dropped = [...bindNames(oldShims)].filter(n => !bindNames(curShims).has(n));

// 剥离注释与字符串字面量；模板字面量必须保留 ${...} 插值，
// 否则 `${sanitizeUrl(x)}` 会被整体吞掉 → 漏报。
function strip(code) {
  return code
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:\\])\/\/[^\n]*/g, '$1 ')
    .replace(/`(?:\\.|[^`\\])*`/g, m => {
      const parts = m.match(/\$\{[\s\S]*?\}/g) || [];
      return parts.map(p => '(' + p.slice(2, -1) + ')').join(' + ') || '``';
    })
    .replace(/'(?:\\.|[^'\\\n])*'/g, "''")
    .replace(/"(?:\\.|[^"\\\n])*"/g, '""');
}

function declaredNames(code) {
  const out = new Set();
  for (const m of code.matchAll(/import\s+([\s\S]*?)\s+from\s+/g)) {
    const seg = m[1];
    const brace = seg.match(/\{([\s\S]*?)\}/);
    if (brace) brace[1].split(',').forEach(p => { const t = p.trim().split(/\s+as\s+/).pop().trim(); if (t) out.add(t); });
    const def = seg.replace(/\{[\s\S]*?\}/, '').replace(/\*\s+as\s+/g, '').trim();
    if (def && /^[A-Za-z_$][\w$]*$/.test(def)) out.add(def);
  }
  for (const m of code.matchAll(/(?:^|\s)(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/g)) out.add(m[1]);
  for (const m of code.matchAll(/(?:^|\s)(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)/g)) out.add(m[1]);
  for (const m of code.matchAll(/(?:^|\s)(?:export\s+)?class\s+([A-Za-z_$][\w$]*)/g)) out.add(m[1]);
  // 对象解构：const { getProfile } = await import('...')
  for (const m of code.matchAll(/(?:const|let|var)\s*\{([^}]*)\}\s*=/g)) {
    m[1].split(',').forEach(p => { const t = p.trim().split(':').pop().trim(); if (/^[A-Za-z_$][\w$]*$/.test(t)) out.add(t); });
  }
  // 对象/类方法简写：`async saveDay(date, ...) {`
  for (const m of code.matchAll(/[{,]\s*(?:async\s+)?([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*\{/g)) out.add(m[1]);
  return out;
}

function walk(dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, acc);
    else if (/\.(js|vue|html)$/.test(e.name)) acc.push(p);
  }
  return acc;
}

const findings = [];
for (const f of walk(SRC)) {
  const raw = fs.readFileSync(f, 'utf8');
  const code = strip(raw);
  const declared = declaredNames(raw);
  for (const name of dropped) {
    if (declared.has(name)) continue;
    const re = new RegExp(`(?<![\\w$.])${name.replace(/\$/g, '\\$')}(?![\\w$])`, 'g');
    let m;
    while ((m = re.exec(code))) {
      const line = code.slice(0, m.index).split('\n').length;
      findings.push({ file: path.relative(ROOT, f), line, name });
    }
  }
}

const byName = {};
for (const f of findings) (byName[f.name] = byName[f.name] || []).push(`${f.file}:${f.line}`);

console.log(`=== 基线 ${BASELINE} → 当前 shims：已删除绑定 ${dropped.length} 个 ===`);
console.log('\n=== 裸名残留（需修） ===');
if (findings.length === 0) {
  console.log('（无）');
} else {
  for (const name of Object.keys(byName).sort()) {
    console.log(`\n[${name}]  ${byName[name].length} 处`);
    byName[name].forEach(x => console.log('   ' + x));
  }
}
console.log('\n总计:', findings.length, '处');
console.log('提示：已覆盖 import / 本地声明 / 解构赋值 / 对象方法简写；出现新形态误报请在 declaredNames 补充规则。');
process.exit(findings.length === 0 ? 0 : 1);
