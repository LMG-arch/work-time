// salt-seed.js — v3.17.8 过渡恢复注入（仅本机恢复账号登录用）
//
// 背景：账号 lmg 的密码在 v3.17.x 通过「路径 B 重置」将数据库 password_hash 改为
// 使用 salt = bac7b0acac4f65da4ef98a51e4226c2e 计算。重装 / 更新 APK 会清空设备本地
// 的 social-account-salt（WebView localStorage 被清），导致登录时哈希对不上、
// 报「用户名或密码错误」。本脚本在本机补全该 salt，使 lmg / 重置密码 可正常登录；
// 登录成功后数据会自动从云端同步回本地。
//
// 说明：salt 属公开盐值（非密钥，设计上本就该公开），随包分发无安全风险。
// 待后续把 salt 改为由服务端存储（login 前先取 salt）后，可移除本文件。
(function () {
  var SALT = 'bac7b0acac4f65da4ef98a51e4226c2e';
  function apply() {
    try {
      if (window.__storage && typeof window.__storage.setRaw === 'function') {
        // 强制写入重置 salt（覆盖设备可能已有的其他 salt，如误注册生成的随机 salt），
        // 确保 lmg 账号用正确 salt 计算哈希，登录通过。幂等（每次写同一值）。
        window.__storage.setRaw('social-account-salt', SALT);
        console.log('[salt-seed] recovery salt ensured ->', SALT);
      } else {
        setTimeout(apply, 200);
      }
    } catch (e) {
      console.warn('[salt-seed] failed', e && e.message);
    }
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', apply);
  } else {
    apply();
  }
})();
