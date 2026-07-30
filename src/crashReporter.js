// crashReporter.js — 崩溃可视化与落盘
// 原生层 (MainApplication) 把未捕获异常写入
//   <external-files>/crashlogs/crash-<ts>.txt
// 本模块在启动时读取并弹窗展示，支持一键复制（不依赖 @capacitor/share）。
// 同时把 JS 运行错误也写入同一目录，统一崩溃入口。

import { isCapacitorPlatform } from './utils.js'

const CRASH_DIR = 'crashlogs'
const FS = () => (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Filesystem) || null

function tsName(prefix) {
  return prefix + '-' + Date.now() + '.txt'
}

// 把文本写入崩溃目录（原生层已创建目录，这里兜底 mkdir）
export async function persistCrashText(text, prefix = 'js') {
  const Fs = FS()
  if (!Fs) return false
  try {
    await Fs.mkdir({ path: CRASH_DIR, directory: 'External', recursive: true }).catch(() => {})
    await Fs.writeFile({
      path: CRASH_DIR + '/' + tsName(prefix),
      data: String(text),
      directory: 'External',
      encoding: 'utf8',
    })
    return true
  } catch (e) {
    return false
  }
}

export async function persistJsError(message, stack) {
  const body =
    'Time: ' + new Date().toLocaleString() + '\n' +
    'Kind: JS runtime error\n' +
    '----- Message -----\n' + String(message) + '\n' +
    '----- Stack -----\n' + String(stack || '')
  await persistCrashText(body, 'js')
}

async function listCrashFiles() {
  const Fs = FS()
  if (!Fs) return []
  try {
    const res = await Fs.readdir({ path: CRASH_DIR, directory: 'External' })
    const files = (res && res.files) || []
    return files
      .map((f) => (typeof f === 'string' ? f : f.name))
      .filter((n) => n && (n.startsWith('crash-') || n.startsWith('js-')))
  } catch (e) {
    return []
  }
}

async function readCrashFile(name) {
  const Fs = FS()
  const res = await Fs.readFile({
    path: CRASH_DIR + '/' + name,
    directory: 'External',
    encoding: 'utf8',
  })
  return typeof res.data === 'string' ? res.data : String(res.data)
}

async function deleteAllCrashFiles(names) {
  const Fs = FS()
  for (const n of names) {
    try {
      await Fs.deleteFile({ path: CRASH_DIR + '/' + n, directory: 'External' })
    } catch (e) { /* ignore */ }
  }
}

function renderCrashOverlay(allText, names) {
  if (document.getElementById('crash-report-overlay')) return
  const overlay = document.createElement('div')
  overlay.id = 'crash-report-overlay'
  overlay.style.cssText =
    'position:fixed;inset:0;z-index:2147483646;background:rgba(20,0,0,.94);' +
    'color:#ffd9d9;font:13px/1.6 ui-monospace,Menlo,Consolas,monospace;' +
    'display:flex;flex-direction:column;box-sizing:border-box;padding:16px;'

  const title = document.createElement('div')
  title.textContent = '⚠ 检测到上次运行崩溃（请把内容复制发给开发者）'
  title.style.cssText = 'font-weight:700;margin-bottom:8px;color:#ffb3b3;flex:none;'

  const pre = document.createElement('pre')
  pre.textContent = allText
  pre.style.cssText =
    'flex:1;margin:0;padding:12px;overflow:auto;white-space:pre-wrap;' +
    'word-break:break-word;background:rgba(0,0,0,.35);border-radius:10px;' +
    'border:1px solid rgba(255,180,180,.25);user-select:text;-webkit-user-select:text;'

  const bar = document.createElement('div')
  bar.style.cssText = 'flex:none;display:flex;gap:8px;margin-top:10px;'

  const copyBtn = document.createElement('button')
  copyBtn.textContent = '复制内容'
  copyBtn.style.cssText =
    'flex:1;padding:10px;border:1px solid rgba(255,180,180,.5);border-radius:10px;' +
    'background:rgba(255,80,80,.18);color:#ffd9d9;font-size:14px;cursor:pointer;'
  copyBtn.onclick = async () => {
    try {
      await navigator.clipboard.writeText(allText)
      copyBtn.textContent = '已复制 ✓'
    } catch (e) {
      // 兜底：选中文本让用户手动复制
      const range = document.createRange()
      range.selectNodeContents(pre)
      const sel = window.getSelection()
      sel.removeAllRanges()
      sel.addRange(range)
      copyBtn.textContent = '已选中，长按复制'
    }
    setTimeout(() => (copyBtn.textContent = '复制内容'), 2000)
  }

  const clearBtn = document.createElement('button')
  clearBtn.textContent = '清除并关闭'
  clearBtn.style.cssText =
    'flex:1;padding:10px;border:1px solid rgba(255,180,180,.5);border-radius:10px;' +
    'background:rgba(255,255,255,.08);color:#ffd9d9;font-size:14px;cursor:pointer;'
  clearBtn.onclick = async () => {
    await deleteAllCrashFiles(names)
    overlay.remove()
  }

  bar.appendChild(copyBtn)
  bar.appendChild(clearBtn)
  overlay.appendChild(title)
  overlay.appendChild(pre)
  overlay.appendChild(bar)
  document.body.appendChild(overlay)
}

// 启动后调用：若有崩溃文件则展示
export async function showPendingCrashReport() {
  if (!isCapacitorPlatform()) return
  try {
    const names = await listCrashFiles()
    if (!names.length) return
    names.sort()
    const allText = []
    for (const n of names) {
      try {
        allText.push(await readCrashFile(n))
      } catch (e) { /* skip unreadable */ }
    }
    renderCrashOverlay(allText.join('\n\n==========\n\n'), names)
  } catch (e) { /* 极致兜底 */ }
}
