// updater.js — 应用内版本检查与更新提示 (ESM 模块)

const UPDATE_CHECK_URL = 'https://raw.githubusercontent.com/LMG-arch/work-time/main/version.json';
const UPDATE_CHECK_INTERVAL = 12 * 60 * 60 * 1000; // 12小时检查一次

// 获取本地版本号
export async function getLocalVersion() {
  // Android Capacitor 环境
  if (window.Capacitor && window.Capacitor.Plugins) {
    try {
      const { App } = window.Capacitor.Plugins;
      if (App && App.getInfo) {
        const info = await App.getInfo();
        return { versionName: info.version, versionCode: info.build || 0 };
      }
    } catch (e) { console.warn('[Updater] Capacitor getAppInfo failed:', e.message); }
  }
  // Electron 环境
  if (window.calendarAPI && window.calendarAPI.getAppVersion) {
    try {
      return await window.calendarAPI.getAppVersion();
    } catch (e) { console.warn('[Updater] Electron getAppVersion failed:', e.message); }
  }
  // Web 降级：从 version.json 读取
  try {
    const resp = await fetch('version.json');
    if (resp.ok) {
      const v = await resp.json();
      return { versionName: v.version, versionCode: v.versionCode || 0 };
    }
  } catch (e) { console.warn('[Updater] Failed to fetch version.json:', e.message); }
  // 最终回退：使用 package.json 中的版本号
  return { versionName: '3.13.0', versionCode: 0 };
}

// 版本比较：返回 1 (a>b), 0 (a=b), -1 (a<b)
export function compareVersions(a, b) {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const na = pa[i] || 0;
    const nb = pb[i] || 0;
    if (na > nb) return 1;
    if (na < nb) return -1;
  }
  return 0;
}

// 检查更新
export async function checkForUpdate(silent) {
  try {
    const local = await getLocalVersion();

    // 从 GitHub 获取远程版本信息（加时间戳防缓存）
    const resp = await fetch(UPDATE_CHECK_URL + '?t=' + Date.now());
    if (!resp.ok) return null;
    const remote = await resp.json();

    if (!remote.version || !remote.downloadUrl) return null;

    const hasUpdate = compareVersions(remote.version, local.versionName) > 0;
    if (hasUpdate) {
      return remote;
    }

    if (!silent) {
      showToast('当前已是最新版本 v' + local.versionName);
    }
    return null;
  } catch (e) {
    console.log('[Updater] Check failed:', e.message);
    if (!silent) showToast('检查更新失败，请检查网络');
    return null;
  }
}

// 显示更新弹窗
export function showUpdateDialog(remote) {
  // 移除已有的更新弹窗
  const existing = document.getElementById('update-modal');
  if (existing) existing.remove();

  const modal = document.createElement('div');
  modal.id = 'update-modal';
  modal.className = 'modal';
  modal.style.display = 'flex';
  modal.innerHTML = `
    <div class="update-modal-content">
      <div class="update-icon">&#x2728;</div>
      <div class="update-title">发现新版本 v${escapeHtml(remote.version)}</div>
      <div class="update-changelog">${escapeHtml(remote.changelog).replace(/\n/g, '<br>')}</div>
      <div class="update-actions">
        <button class="update-btn update-later">稍后再说</button>
        <button class="update-btn update-download">立即更新</button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  modal.querySelector('.update-later').addEventListener('click', () => {
    modal.remove();
  });

  modal.querySelector('.update-download').addEventListener('click', () => {
    modal.remove();
    startDownload(remote.downloadUrl);
  });

  // 点击背景关闭
  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.remove();
  });
}

// 下载 APK（显示进度）
export function startDownload(url) {
  const safeUrl = sanitizeUrl(url);
  if (!safeUrl) { showToast('更新地址无效，已取消下载'); return; }
  url = safeUrl;
  const isAndroid = isCapacitorPlatform();

  if (isAndroid) {
    // Android: 使用系统浏览器下载
    try {
      // 尝试用 Capacitor Browser 插件打开
      if (window.Capacitor.Plugins && window.Capacitor.Plugins.Browser) {
        window.Capacitor.Plugins.Browser.open({ url: url });
      } else {
        window.open(url, '_system');
      }
      showToast('正在跳转到浏览器下载...');
    } catch {
      // 降级：直接 window.open
      window.open(url, '_system');
    }
  } else {
    // 桌面端：直接下载
    window.open(url, '_blank');
    showToast('正在下载新版本...');
  }
}

// 启动时自动检查更新（静默模式）
export async function autoCheckUpdate() {
  // 延迟 5 秒后检查，避免影响启动速度
  setTimeout(async () => {
    const remote = await checkForUpdate(true);
    if (remote) {
      showUpdateDialog(remote);
    }
  }, 5000);
}

// 手动检查更新（从设置页触发）
export async function manualCheckUpdate() {
  showToast('正在检查更新...');
  const remote = await checkForUpdate(false);
  if (remote) {
    showUpdateDialog(remote);
  }
}
