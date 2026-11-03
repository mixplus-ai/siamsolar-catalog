// ==========================================
// ตัวโหลดโค้ดจาก GitHub (วางใน Apps Script ครั้งเดียว)
// ==========================================
// วางไฟล์นี้แทนโค้ดทั้งหมดใน Code.gs ของ Apps Script แล้วรัน setupPermissions หนึ่งครั้ง
// หลังจากนั้นโค้ดจริงจะดึงจาก GitHub เอง (apps-script/Code.gs) ไม่ต้องวางโค้ดหรือ Deploy ใหม่อีก
// โค้ดที่แก้บน GitHub จะมีผลภายในประมาณ 5-10 นาที
// ถ้าดึงจาก GitHub ไม่ได้ ระบบจะใช้โค้ดชุดล่าสุดที่เคยดึงได้แทน

const CODE_URL = 'https://raw.githubusercontent.com/mixplus-ai/siamsolar-catalog/main/apps-script/Code.gs';
const CODE_CACHE_SECONDS = 300;
const CHUNK = 8000;

function doGet(e) { return app_().doGet(e); }
function doPost(e) { return app_().doPost(e); }

// รันฟังก์ชันนี้หนึ่งครั้ง แล้วกด Allow เพื่ออนุญาตสิทธิ์ทั้งหมดที่ระบบต้องใช้
function setupPermissions() {
  clearCodeCache();
  app_().setupPermissions();
  Logger.log('ได้รับสิทธิ์และโหลดโค้ดจาก GitHub เรียบร้อย');
}

// ใช้เมื่ออยากให้โค้ดใหม่บน GitHub มีผลทันที (ปกติรอประมาณ 5-10 นาที)
function clearCodeCache() {
  CacheService.getScriptCache().remove('code_n');
  APP_ = null;
}

// ไม่ได้ถูกเรียกใช้ มีไว้ให้ Google รู้ว่าโค้ดที่ดึงจาก GitHub ต้องใช้บริการอะไรบ้าง (Google ดูสิทธิ์จากโค้ดในไฟล์นี้)
function permissionScopes_() {
  SpreadsheetApp.openById('');
  DriveApp.getFolderById('').createFile(null);
  DriveApp.getFileById('');
  UrlFetchApp.fetch('');
  LockService.getScriptLock();
  PropertiesService.getScriptProperties();
  ContentService.createTextOutput('');
  HtmlService.createHtmlOutput('');
}

let APP_ = null;

function app_() {
  if (APP_) return APP_;
  let code = readChunks_(k => CacheService.getScriptCache().get(k));
  if (!code) {
    code = fetchCode_();
    if (code) {
      writeChunks_(code, (k, v) => CacheService.getScriptCache().put(k, v, CODE_CACHE_SECONDS));
      writeChunks_(code, (k, v) => PropertiesService.getScriptProperties().setProperty('backup_' + k, v));
    } else {
      code = readChunks_(k => PropertiesService.getScriptProperties().getProperty('backup_' + k));
    }
  }
  if (!code) throw new Error('โหลดโค้ดจาก GitHub ไม่ได้ และยังไม่มีโค้ดสำรอง');
  APP_ = new Function(code + '\nreturn { doGet: doGet, doPost: doPost, setupPermissions: setupPermissions };')();
  return APP_;
}

function fetchCode_() {
  try {
    const res = UrlFetchApp.fetch(CODE_URL + '?t=' + Date.now(), { muteHttpExceptions: true });
    const text = res.getContentText();
    // กันกรณีได้หน้า error แทนโค้ด
    if (res.getResponseCode() === 200 && text.indexOf('function doPost') >= 0) return text;
  } catch (e) {}
  return '';
}

// CacheService / Script Properties เก็บค่าได้จำกัดต่อช่อง จึงแบ่งโค้ดเป็นชิ้นๆ
function writeChunks_(text, put) {
  const n = Math.ceil(text.length / CHUNK);
  for (let i = 0; i < n; i++) put('code_' + i, text.slice(i * CHUNK, (i + 1) * CHUNK));
  put('code_n', String(n));
}

function readChunks_(get) {
  const n = Number(get('code_n'));
  if (!n) return '';
  let text = '';
  for (let i = 0; i < n; i++) {
    const part = get('code_' + i);
    if (part === null || part === undefined) return '';
    text += part;
  }
  return text;
}
