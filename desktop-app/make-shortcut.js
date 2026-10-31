const { app, shell } = require('electron');
const path = require('path');
const os = require('os');

const exe = path.join(process.env.LOCALAPPDATA, 'Programs', 'HealthBuddy', 'HealthBuddy.exe');
const lnk = path.join(os.homedir(), 'Desktop', '健康 Buddy.lnk');

app.whenReady().then(() => {
  const ok = shell.writeShortcutLink(lnk, 'create', {
    target: exe,
    cwd: path.dirname(exe),
    icon: exe,
    iconIndex: 0,
    description: '健康 Buddy · 7天身体管理工作台',
    appUserModelId: 'com.personal.healthbuddy'
  });
  console.log(ok ? 'SHORTCUT_OK' : 'SHORTCUT_FAIL');
  setTimeout(() => app.quit(), 100);
});
