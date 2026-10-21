// ==========================================
// 1. ตั้งค่าพื้นฐาน (Configuration)
// ==========================================
const SHEET_ID = '1Zm0QtxOVdjRYSuXKIJ9FLO1JMO_BI673LBMtk8DBfTo';
const FOLDER_ID = '1cvhCCc2S4W7nZCDMytgvNWhX03Zr3OT2';
const SHEET_NAME = 'Products';

// Username / Password แอดมิน: ตั้งที่ Project Settings > Script Properties
// เพิ่ม ADMIN_USER และ ADMIN_PASS (ไม่เขียนรหัสไว้ในโค้ด เพื่อให้เก็บโค้ดบน GitHub ได้ปลอดภัย)
// ถ้ายังไม่ได้ตั้ง ADMIN_PASS ระบบจะไม่ให้ใครล็อกอินได้

// อายุของการล็อกอิน (วินาที) สูงสุดที่ CacheService รองรับคือ 6 ชั่วโมง
const TOKEN_TTL = 6 * 60 * 60;

// ==========================================
// ฟังก์ชันกระตุ้นการขออนุญาตสิทธิ์ (รันฟังก์ชันนี้ครั้งแรกครั้งเดียว)
// ==========================================
function setupPermissions() {
  var drive = DriveApp.getFiles();
  var sheet = SpreadsheetApp.openById(SHEET_ID);
  Logger.log("ได้รับสิทธิ์เรียบร้อยแล้ว");
}

// ==========================================
// 2. API สำหรับเว็บ Netlify
// ==========================================

// GET: ใช้อ่านข้อมูลสาธารณะ เช่น ?action=products
// ถ้าไม่มี action จะแสดงหน้าเว็บเดิม (ลิงก์ /exec เก่ายังใช้ได้ ถ้ายังมีไฟล์ Index.html อยู่)
function doGet(e) {
  const action = (e && e.parameter && e.parameter.action) || '';

  if (action === 'products') {
    return jsonOut({ success: true, data: getPublishedProducts() });
  }
  if (action === 'info') {
    return jsonOut({ success: true, data: getSheetInfo() });
  }
  if (action === 'ping') {
    return jsonOut({ success: true, message: 'pong' });
  }

  // โหมดเดิม (HTML ใน Apps Script)
  let mode = (e && e.parameter && e.parameter.mode === 'admin') ? 'admin' : 'client';
  let template = HtmlService.createTemplateFromFile('Index');
  template.mode = mode;
  return template.evaluate()
    .setTitle('Solar Equipment Catalog')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1.0');
}

// POST: ใช้สำหรับล็อกอินและงานแอดมินทั้งหมด
// หน้าเว็บส่งเป็น Content-Type: text/plain (เลี่ยงปัญหา CORS) โดย body เป็น JSON
// { action: 'login' | 'listAll' | 'upload' | 'save', token: '...', ... }
function doPost(e) {
  try {
    const body = JSON.parse((e.postData && e.postData.contents) || '{}');
    const action = body.action;

    if (action === 'login') {
      return jsonOut(login(body.username, body.password));
    }

    // ทุก action ด้านล่างต้องล็อกอินก่อน
    if (!isValidToken(body.token)) {
      return jsonOut({ success: false, authError: true, message: 'กรุณาเข้าสู่ระบบใหม่' });
    }

    if (action === 'listAll') {
      return jsonOut({ success: true, data: getAllProducts() });
    }
    if (action === 'upload') {
      return jsonOut({ success: true, data: uploadFileToDrive(body.base64, body.name, body.type) });
    }
    if (action === 'save') {
      return jsonOut(saveProduct(body.product || {}));
    }
    if (action === 'logout') {
      CacheService.getScriptCache().remove('tok_' + body.token);
      return jsonOut({ success: true });
    }

    return jsonOut({ success: false, message: 'ไม่รู้จักคำสั่ง: ' + action });
  } catch (err) {
    return jsonOut({ success: false, message: 'เกิดข้อผิดพลาด: ' + err.message });
  }
}

function jsonOut(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ==========================================
// 3. ระบบล็อกอิน (ตรวจที่ฝั่งเซิร์ฟเวอร์)
// ==========================================
function getAdminCredentials() {
  const props = PropertiesService.getScriptProperties();
  return {
    user: props.getProperty('ADMIN_USER') || 'admin',
    pass: props.getProperty('ADMIN_PASS') || ''
  };
}

function login(username, password) {
  const cred = getAdminCredentials();
  if (!cred.pass) {
    return { success: false, message: 'ยังไม่ได้ตั้งรหัสผ่านแอดมินใน Script Properties (ADMIN_PASS)' };
  }
  if (username === cred.user && password === cred.pass) {
    const token = Utilities.getUuid();
    CacheService.getScriptCache().put('tok_' + token, '1', TOKEN_TTL);
    return { success: true, token: token, message: 'เข้าสู่ระบบสำเร็จ' };
  }
  Utilities.sleep(800); // ชะลอการเดารหัสผ่าน
  return { success: false, message: 'Username หรือ Password ไม่ถูกต้อง' };
}

function isValidToken(token) {
  if (!token) return false;
  return CacheService.getScriptCache().get('tok_' + token) === '1';
}

// ==========================================
// 4. ข้อมูลสินค้า
// ==========================================
function readProducts() {
  const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(SHEET_NAME);
  const data = sheet.getDataRange().getDisplayValues();
  const headers = data.shift().map(h => String(h).trim());
  return data
    .filter(row => row.some(cell => cell !== ''))
    .map(row => {
      let obj = {};
      headers.forEach((header, index) => { obj[header] = row[index]; });
      return obj;
    });
}

function getPublishedProducts() {
  return readProducts().filter(p => String(p.Status || '').trim().toLowerCase() === 'publish');
}

// ใช้ตรวจปัญหา: ?action=info บอกชื่อคอลัมน์ จำนวนแถว และค่าในคอลัมน์ Status
function getSheetInfo() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    return { error: 'ไม่พบชีตชื่อ ' + SHEET_NAME, sheets: ss.getSheets().map(s => s.getName()) };
  }
  const rows = readProducts();
  const statuses = {};
  rows.forEach(p => { const k = String(p.Status); statuses[k] = (statuses[k] || 0) + 1; });
  return {
    headers: sheet.getRange(1, 1, 1, sheet.getLastColumn()).getDisplayValues()[0],
    totalRows: rows.length,
    published: getPublishedProducts().length,
    statuses: statuses
  };
}

function getAllProducts() {
  return readProducts();
}

// อัปโหลดไฟล์ลง Google Drive
// รูปภาพจะคืนลิงก์แบบ thumbnail ที่ใส่ใน <img> ได้เลย ส่วน PDF คืนลิงก์ปกติ
function uploadFileToDrive(base64Data, fileName, mimeType) {
  const folder = DriveApp.getFolderById(FOLDER_ID);
  const blob = Utilities.newBlob(Utilities.base64Decode(base64Data), mimeType, fileName);
  const file = folder.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  if (mimeType && mimeType.indexOf('image/') === 0) {
    return 'https://drive.google.com/thumbnail?id=' + file.getId() + '&sz=w1000';
  }
  return file.getUrl();
}

// บันทึกข้อมูล (เพิ่ม/แก้ไข)
function saveProduct(productData) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(SHEET_NAME);
    const data = sheet.getDataRange().getValues();
    const headers = data[0];

    if (!productData.ID) {
      productData.ID = 'PROD-' + new Date().getTime();
      const newRow = headers.map(h => productData[h] || '');
      sheet.appendRow(newRow);
      return { success: true, message: 'เพิ่มสินค้าใหม่เรียบร้อย' };
    }

    const idCol = headers.indexOf('ID') >= 0 ? headers.indexOf('ID') : 0;
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][idCol]) === String(productData.ID)) {
        // คงค่าเดิมของคอลัมน์ที่ฟอร์มไม่ได้ส่งมา
        const updateRow = headers.map((h, c) =>
          productData.hasOwnProperty(h) ? (productData[h] || '') : data[i][c]
        );
        sheet.getRange(i + 1, 1, 1, headers.length).setValues([updateRow]);
        return { success: true, message: 'อัปเดตข้อมูลเรียบร้อย' };
      }
    }
    return { success: false, message: 'ไม่พบรหัสสินค้านี้' };
  } finally {
    lock.releaseLock();
  }
}
