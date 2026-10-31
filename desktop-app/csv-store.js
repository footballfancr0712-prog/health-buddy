/* CSV 文档读写：纯 Node 实现，不依赖 Electron，方便单独测试 */
const fs = require('fs');
const path = require('path');
const os = require('os');

/* 桌面目录由主进程传入（macOS 中文系统显示为「桌面」，实际目录仍是 ~/Desktop），
   这里保留兜底，方便脱离 Electron 单独测试 */
const DESKTOP_DIR = process.env.HB_DESKTOP || path.join(os.homedir(), 'Desktop');
const CSV_PATH = process.env.HB_CSV_PATH || path.join(DESKTOP_DIR, '健康Buddy-我的记录.csv');

const CSV_HEAD = [
  '日期', '入睡时间', '起床时间', '睡眠时长(小时)', '运动时长(分钟)', '饮水量(ml)',
  '早餐(吃了填是，没吃填否)', '午餐(吃了填是，没吃填否)', '晚餐(吃了填是，没吃填否)',
  '早餐吃了什么', '午餐吃了什么', '晚餐吃了什么', '含糖饮料(杯)',
  '主要食物(食堂/外卖/自己做/快餐/均衡)', '久坐时长(小时)', '精神状态(1-5)', '身体自评(1-5)', '备注'
];

function readTextSafe(file) {
  const buf = fs.readFileSync(file);
  if (buf.length >= 3 && buf[0] === 0xEF && buf[1] === 0xBB && buf[2] === 0xBF) {
    return buf.slice(3).toString('utf8');
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buf);
  } catch (e) {
    try { return new TextDecoder('gb18030').decode(buf); } catch (e2) { return buf.toString('utf8'); }
  }
}

function parseCSV(text) {
  const src = String(text || '').replace(/^\ufeff/, '');
  const rows = [];
  let row = [], cell = '', inQ = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inQ) {
      if (c === '"') {
        if (src[i + 1] === '"') { cell += '"'; i++; } else inQ = false;
      } else cell += c;
    } else if (c === '"') inQ = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
    else if (c === '\r') { /* skip */ }
    else cell += c;
  }
  if (cell.length || row.length) { row.push(cell); rows.push(row); }
  return rows.filter(r => r.some(c => String(c).trim() !== ''));
}

function serCell(v) {
  const s = (v == null ? '' : String(v));
  return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

function normDate(v) {
  const m = String(v == null ? '' : v).match(/(\d{4})\D+(\d{1,2})\D+(\d{1,2})/);
  if (!m) return null;
  return `${m[1]}-${String(+m[2]).padStart(2, '0')}-${String(+m[3]).padStart(2, '0')}`;
}

function writeRows(rows) {
  const body = rows.map(r => r.map(serCell).join(',')).join('\r\n') + '\r\n';
  fs.mkdirSync(path.dirname(CSV_PATH), { recursive: true });
  fs.writeFileSync(CSV_PATH, '\ufeff' + body, 'utf8');
}

function friendlyError(e) {
  if (!e) return '未知错误';
  if (e.code === 'EBUSY' || e.code === 'EPERM' || e.code === 'EACCES') return '文档正被其他程序占用（多半是 Excel 开着）';
  if (e.code === 'ENOENT') return '文档路径不存在';
  if (e.code === 'ENOSPC') return '磁盘空间不足';
  return e.code || e.message || '未知错误';
}

function read() {
  try {
    if (!fs.existsSync(CSV_PATH)) return { ok: true, text: '', path: CSV_PATH, exists: false };
    return { ok: true, text: readTextSafe(CSV_PATH), path: CSV_PATH, exists: true };
  } catch (e) {
    return { error: friendlyError(e), path: CSV_PATH };
  }
}

function upsert(payload) {
  try {
    const date = normDate(payload && payload.date);
    const cells = (payload && payload.cells) || [];
    if (!date) return { error: '日期不合法' };
    let rows = [];
    if (fs.existsSync(CSV_PATH)) rows = parseCSV(readTextSafe(CSV_PATH));
    if (!rows.length) rows = [CSV_HEAD.slice()];
    rows[0] = CSV_HEAD.slice();
    const row = cells.slice(0, CSV_HEAD.length);
    while (row.length < CSV_HEAD.length) row.push('');
    row[0] = date;
    const idx = rows.findIndex((r, i) => i > 0 && normDate(r[0]) === date);
    if (idx >= 0) rows[idx] = row; else rows.push(row);
    const body = rows.slice(1)
      .filter(r => normDate(r[0]))
      .map(r => { r[0] = normDate(r[0]); return r; })   // 日期统一成 YYYY-MM-DD
      .sort((a, b) => normDate(a[0]).localeCompare(normDate(b[0])));
    writeRows([CSV_HEAD.slice()].concat(body));
    return { ok: true, path: CSV_PATH, updated: idx >= 0, total: body.length };
  } catch (e) {
    return { error: friendlyError(e), path: CSV_PATH };
  }
}

function remove(payload) {
  try {
    const date = normDate(payload && payload.date);
    if (!date) return { error: '日期不合法' };
    if (!fs.existsSync(CSV_PATH)) return { ok: true, removed: 0, path: CSV_PATH };
    const rows = parseCSV(readTextSafe(CSV_PATH));
    if (!rows.length) return { ok: true, removed: 0, path: CSV_PATH };
    const keep = rows.filter((r, i) => i === 0 || normDate(r[0]) !== date);
    writeRows(keep.length ? keep : [CSV_HEAD.slice()]);
    return { ok: true, removed: rows.length - keep.length, path: CSV_PATH };
  } catch (e) {
    return { error: friendlyError(e), path: CSV_PATH };
  }
}

module.exports = { CSV_PATH, CSV_HEAD, read, upsert, remove, parseCSV, normDate };
