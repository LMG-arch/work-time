/**
 * bootstrap.js — 应用入口（被 Vite 作为正式 ESM module 处理）
 *
 * 为什么需要这个文件：
 *   index.html 原来在普通 <script>（非 type=module）里写动态 import('./vue-main.js')。
 *   Vite build 对非 module script 中的动态 import() 不会做正常的模块打包/依赖解析，
 *   而是把目标文件的【原始源码文本】base64 编码内联进 HTML（data: URI）。
 *   base64 里包含 import './shared.js'、from 'vue' 等裸 import → data URI 上下文无法解析
 *   → Capacitor WebView / 生产环境白屏，报 vue-main.js 404。
 *
 * 解决：把入口放在独立的 .js 文件中，用 <script type="module" src="./bootstrap.js"> 引用。
 *   Vite 会正确处理 bootstrap.js → vue-main.js → shared.js → shims.js → ... 整条依赖链，
 *   把它们打包成正确的 chunk 文件输出到 dist/assets/。
 */

import('./vue-main.js')
  .then(function () {
    if (window.__bootLog) window.__bootLog('bootstrap OK — vue-main.js evaluated');
    else console.log('bootstrap OK');
  })
  .catch(function (e) {
    var m = (e && (e.stack || e.message)) ? (e.stack || e.message) : String(e);
    // 区分 file:// 协议限制 vs 其他原因
    if (typeof location !== 'undefined' && location.protocol === 'file:') {
      m = 'file:// protocol blocks ESM import(). Use "npm run dev" or launcher bat. Raw: ' + m;
    }
    if (window.__bootError) window.__bootError('Module load/eval FAILED: ' + m);
    else console.error('Module load/eval FAILED:', m);
  });
