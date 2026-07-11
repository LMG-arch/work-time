// kill-dev.cjs — 清理占用 5173 端口（Vite 开发服务器）的残留进程。
// 背景：Electron 关闭时最小化到托盘（main.js 的 win.on('close') 阻止退出），
// 不会杀死 vite；下一轮「启动-开发模式.bat」再起 vite 时旧实例仍占着 5173，
// 新的 vite 被迫切到 5174 而无人连接，Electron 连到的还是旧实例（旧代码）→ 永久白屏。
// 在 npm run dev 之前先跑本脚本，保证 5173 一定归新 vite 所有。

const cp = require('child_process')

function pidsOn5173() {
  try {
    const out = cp.execSync('netstat -ano', { encoding: 'utf8' })
    const set = new Set()
    out.split('\n').forEach((l) => {
      if (l.includes(':5173') && l.includes('LISTENING')) {
        const parts = l.trim().split(/\s+/)
        const pid = parts[parts.length - 1]
        if (/^\d+$/.test(pid)) set.add(pid)
      }
    })
    return [...set]
  } catch {
    return []
  }
}

const pids = pidsOn5173()
const killed = []
pids.forEach((pid) => {
  try {
    cp.execSync('taskkill /PID ' + pid + ' /F', { windowsHide: true })
    killed.push(pid)
  } catch {
    /* 已退出 */
  }
})

if (killed.length) {
  console.log('[kill-dev] 已清理残留开发服务器进程 (PID: ' + killed.join(', ') + ')')
} else {
  console.log('[kill-dev] 5173 端口干净，无残留进程')
}
