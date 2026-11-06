/**
 * 测试安全闸（2026-11-06 事故后加）
 *
 * 事故回顾：桌面链路测试把 HB_DESKTOP 指向真实桌面目录，页面启动时的 deskBootSync()
 * 把测试缓存里残留的样例记录当成「本地有、文档无」补写进了用户的 健康Buddy-我的记录.csv。
 *
 * 用法：在测试脚本的第一行（require electron 之前）加：
 *     require('<仓库>/scripts/test-guard.js')('你的测试名');
 *
 * 它会做三件事：
 *   1. HB_DESKTOP / HB_CSV 指向真实桌面 → 直接抛错拒绝运行
 *   2. 把 Electron 的 userData 指到仓库内临时目录，不污染 %APPDATA%/Electron
 *   3. 启动时打印「本次测试的数据目录」，出问题时一眼能看出写到了哪
 */
const path = require('path');
const os = require('os');
const fs = require('fs');

module.exports = function guard(testName) {
  const tag = testName || 'unnamed-test';

  // ---- 1) 禁止指向真实桌面 ----
  const realDesktop = path.resolve(os.homedir(), 'Desktop');
  const targets = [
    ['HB_DESKTOP', process.env.HB_DESKTOP],
    ['HB_CSV', process.env.HB_CSV]
  ].filter(([, v]) => v);

  for (const [key, val] of targets) {
    const abs = path.resolve(val);
    const insideReal = abs.toLowerCase() === realDesktop.toLowerCase()
      || abs.toLowerCase().startsWith(realDesktop.toLowerCase() + path.sep)
      || /Desktop$/i.test(abs);
    if (insideReal) {
      throw new Error(
        `[test-guard] 拒绝运行：${key} 指向真实桌面目录（${val}）。\n` +
        `测试会写进用户的 健康Buddy-我的记录.csv。\n` +
        `请改成仓库内的副本，例如 .tmp/desktest/，并把真实 CSV 复制过去。`
      );
    }
  }

  // ---- 2) 隔离 userData ----
  const repoRoot = path.resolve(__dirname, '..');
  const isoDir = path.join(repoRoot, '.tmp', 'userdata', tag);
  try { fs.mkdirSync(isoDir, { recursive: true }); } catch (e) {}
  try {
    const { app } = require('electron');
    if (app && typeof app.setPath === 'function') {
      app.setPath('userData', isoDir);
    }
  } catch (e) {
    // 非 Electron 环境下（比如纯 Node 单测）跳过
  }

  // ---- 3) 打印声明 ----
  console.log(`[test-guard] ${tag} · 数据目录=${process.env.HB_DESKTOP || '(未设置)'} · userData=${isoDir}`);
  return { isoDir, dataDir: process.env.HB_DESKTOP || null };
};
