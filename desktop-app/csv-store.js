/* CSV 文档读写：纯 Node 实现，不依赖 Electron，方便单独测试
 *
 * 关键设计：**按列名对齐，不按列位置**
 *   - 读取时以文件自己的表头为准，不认识的多余列原样保留
 *   - 文件缺少的列追加到末尾，旧行空着，不会挤位
 * 这样任何一版软件写过的文件，另一版读写都不会把数据错位或丢掉。
 */
const fs = require('fs');
const path = require('path');
const os = require('os');

/* 桌面目录由主进程传入（macOS 中文系统显示为「桌面」，实际目录仍是 ~/Desktop），
   这里保留兜底，方便脱离 Electron 单独测试 */
const DESKTOP_DIR = process.env.HB_DESKTOP || path.join(os.homedir(), 'Desktop');
const CSV_PATH = process.env.HB_CSV_PATH || path.join(DESKTOP_DIR, '健康Buddy-我的记录.csv');

const CSV_HEAD = [
  '日期', '入睡时间', '起床时间', '睡眠时长(小时)', '午休(分钟)', '运动时长(分钟)', '饮水量(ml)',
  '早餐(吃了填是，没吃填否)', '午餐(吃了填是，没吃填否)', '晚餐(吃了填是，没吃填否)',
  '早餐吃了什么', '午餐吃了什么', '晚餐吃了什么', '含糖饮料(杯)',
  '主要食物(食堂/外卖/自己做/快餐/均衡)', '久坐时长(小时)', '精神状态(1-5)', '身体自评(1-5)', '备注'
];

const DATE_COL = '日期';

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

/* ---------- 表头处理 ---------- */

/* 读文件 → { header, rows }。第一行不像表头时按标准表头处理 */
function readState() {
  if (!fs.existsSync(CSV_PATH)) return { header: CSV_HEAD.slice(), rows: [] };
  const rows = parseCSV(readTextSafe(CSV_PATH));
  if (!rows.length) return { header: CSV_HEAD.slice(), rows: [] };

  let header = rows[0].map(c => String(c == null ? '' : c).trim());
  const looksLikeHeader = header.some(h => CSV_HEAD.indexOf(h) >= 0) || normDate(header[0]) === null;
  if (!looksLikeHeader) return { header: CSV_HEAD.slice(), rows: rows };

  /* 补一列「日期」：极早期文件可能没有这一列名 */
  if (header.indexOf(DATE_COL) < 0) header = [DATE_COL].concat(header);
  return { header, rows: rows.slice(1) };
}

/* 输出表头 = 文件原有列 + 本版本新增列（追加到末尾，不打乱已有位置） */
function targetHeaderOf(fileHeader) {
  const out = fileHeader.slice();
  CSV_HEAD.forEach(h => { if (out.indexOf(h) < 0) out.push(h); });
  return out;
}

function indexMapOf(header) {
  const m = {};
  header.forEach((h, i) => { if (!(h in m)) m[h] = i; });
  return m;
}

/* 把一行规整到指定列数，日期统一格式 */
function normalizeRow(r, width, dateIdx) {
  const a = r.slice(0, width);
  while (a.length < width) a.push('');
  if (dateIdx != null) a[dateIdx] = normDate(a[dateIdx]) || a[dateIdx] || '';
  return a;
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

    const state = readState();
    const header = targetHeaderOf(state.header);
    const idx = indexMapOf(header);
    const dIdx = idx[DATE_COL];

    const rows = state.rows
      .map(r => normalizeRow(r, header.length, dIdx))
      .filter(r => normDate(r[dIdx]));

    const at = rows.findIndex(r => r[dIdx] === date);
    const target = at >= 0 ? rows[at] : new Array(header.length).fill('');

    /* 只覆盖本版本认识的列；文件里多出来的列保持原值 */
    CSV_HEAD.forEach((name, i) => {
      if (name === DATE_COL) return;
      const pos = idx[name];
      if (pos == null) return;
      target[pos] = cells[i] == null ? '' : cells[i];
    });
    target[dIdx] = date;
    if (at < 0) rows.push(target);

    rows.sort((a, b) => String(a[dIdx]).localeCompare(String(b[dIdx])));
    writeRows([header].concat(rows));
    return { ok: true, path: CSV_PATH, updated: at >= 0, total: rows.length, columns: header.length };
  } catch (e) {
    return { error: friendlyError(e), path: CSV_PATH };
  }
}

function remove(payload) {
  try {
    const date = normDate(payload && payload.date);
    if (!date) return { error: '日期不合法' };
    const state = readState();
    const header = targetHeaderOf(state.header);
    const dIdx = indexMapOf(header)[DATE_COL];
    const rows = state.rows.map(r => normalizeRow(r, header.length, dIdx));
    const keep = rows.filter(r => normDate(r[dIdx]) !== date);
    writeRows([header].concat(keep));
    return { ok: true, removed: rows.length - keep.length, path: CSV_PATH };
  } catch (e) {
    return { error: friendlyError(e), path: CSV_PATH };
  }
}

module.exports = { CSV_PATH, CSV_HEAD, read, upsert, remove, parseCSV, normDate, readState };
