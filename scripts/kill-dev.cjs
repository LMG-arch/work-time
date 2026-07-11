// kill-dev.cjs — 启动前清理本项目的残留进程（端口 5173 上的旧 vite + 上一轮未退出的 Electron）。
// 关键：只杀「本项目相关」的 Electron，绝不误杀 VS Code / Discord 等其他 Electron 应用。
const cp = require('child_process')
const fs = require('fs')
const path = require('path')

// 1) 读取本应用上一轮写入的 PID，精准杀掉它（含进程树）
function killOwnElectron() {
  const pidFile = path.join(__dirname, '..', 'electron.pid')
  if (!fs.existsSync(pidFile)) return []
  let pid = ''
  try { pid = fs.readFileSync(pidFile, 'utf8').trim() } catch { return [] }
  if (!/^\d+$/.test(pid)) return []
  try {
    cp.execSync('taskkill /PID ' + pid + ' /F /T', { windowsHide: true })
    return [pid]
  } catch { return [] }
}

// 2) 兜底：用 WMIC 杀命令行含本项目目录名的 electron.exe（精准匹配，不误杀其他 Electron）
function killElectronByPath() {
  const set = new Set()
  try {
    const out = cp.execSync(
      "wmic process where \"name='electron.exe' and commandline like '%上班日历%'\" get processid /format:csv",
      { encoding: 'utf8', windowsHide: true }
    )
    out.split('\n').forEach((l) => {
      const m = l.match(/(\d+)/)
      if (m) set.add(m[1])
    })
  } catch { /* 忽略 */ }
  const killed = []
  set.forEach((pid) => {
    try { cp.execSync('taskkill /PID ' + pid + ' /F /T', { windowsHide: true }); killed.push(pid) } catch { /* 已退出 */ }
  })
  return killed
}

// 3) 清理占用 5173 端口（vite 开发服务器）的残留进程
function pidsOn5173() {
  try {
    const out = cp.execSync('netstat -ano', { encoding: 'utf8' })
    const set = new Set()
    out.split('\n').forEach((l) => {
      const m = l.match(/:5173\b.*LISTENING\s+(\d+)$/i)
      if (m) set.add(m[1])
    })
    return [...set]
  } catch { return [] }
}

const killed = []
killed.push(...killOwnElectron())
killed.push(...killElectronByPath())
pidsOn5173().forEach((pid) => {
  try { cp.execSync('taskkill /PID ' + pid + ' /F /T', { windowsHide: true }); killed.push(pid) } catch { /* 已退出 */ }
})

if (killed.length) {
  console.log('[kill-dev] 已清理残留进程 (PID: ' + [...new Set(killed)].join(', ') + ')')
} else {
  console.log('[kill-dev] 无残留进程，环境干净')
}
