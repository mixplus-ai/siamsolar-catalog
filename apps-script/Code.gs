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
// หัวคอลัมน์ใน Sheet เป็นภาษาไทย/อังกฤษได้ ระบบจะจับคู่กับชื่อที่หน้าเว็บใช้ให้อัตโนมัติ
// เช่น "สถานะ (Status)" -> Status, "รูปภาพสินค้า (Image URL)" -> CoverImg
const FIELD_RULES = [
  ['ID',          h => h === 'id'],
  ['ProductName', h => h.includes('product name') || h.includes('productname') || h.includes('ชื่อสินค้า')],
  ['Brand',       h => h.includes('brand') || h.includes('แบรนด์')],
  ['Description', h => h.includes('detail') || h.includes('description') || h.includes('รายละเอียด')],
  ['Tags',        h => h.includes('tag')],
  ['CoverImg',    h => h.includes('image') || h.includes('cover') || h.includes('รูป')],
  ['Datasheet',   h => h.includes('datasheet')],
  ['Manual',      h => h.includes('manual') || h.includes('คู่มือ')],
  ['VideoLink',   h => h.includes('video') || h.includes('วิดีโอ')],
  ['Status',      h => h.includes('status') || h.includes('สถานะ')],
  ['OtherFile',   h => h.includes('other') || h.includes('ไฟล์อื่น')],
  ['Date',        h => h.includes('date') || h.includes('วันที่')]
];

function headerKeys(headers) {
  return headers.map(raw => {
    const h = String(raw).trim().toLowerCase();
    const rule = FIELD_RULES.find(r => r[1](h));
    return rule ? rule[0] : String(raw).trim();
  });
}

function getProductSheet() {
  const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(SHEET_NAME);
  if (!sheet) throw new Error('ไม่พบชีตชื่อ ' + SHEET_NAME);
  return sheet;
}

// ถ้า Sheet ไม่มีคอลัมน์ ID จะใช้เลขแถวเป็นรหัสสินค้า เช่น "row-5"
function readProducts() {
  const data = getProductSheet().getDataRange().getDisplayValues();
  const keys = headerKeys(data.shift());
  const hasId = keys.indexOf('ID') >= 0;
  const products = [];
  data.forEach((row, i) => {
    if (!row.some(cell => cell !== '')) return;
    const obj = {};
    keys.forEach((k, c) => { obj[k] = row[c]; });
    if (!hasId || !obj.ID) obj.ID = 'row-' + (i + 2);
    products.push(obj);
  });
  return products;
}

function getPublishedProducts() {
  return readProducts().filter(p => String(p.Status || '').trim().toLowerCase() === 'publish');
}

// ใช้ตรวจปัญหา: ?action=info บอกชื่อคอลัมน์ จำนวนแถว และค่าในคอลัมน์ Status
function getSheetInfo() {
  const sheet = getProductSheet();
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getDisplayValues()[0];
  const rows = readProducts();
  const statuses = {};
  rows.forEach(p => { const k = String(p.Status); statuses[k] = (statuses[k] || 0) + 1; });
  return {
    headers: headers,
    mappedTo: headerKeys(headers),
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
    const sheet = getProductSheet();
    const data = sheet.getDataRange().getValues();
    const keys = headerKeys(data[0]);
    const idCol = keys.indexOf('ID');

    // เพิ่มสินค้าใหม่
    if (!productData.ID) {
      if (idCol >= 0) productData.ID = 'PROD-' + new Date().getTime();
      if (keys.indexOf('Date') >= 0) productData.Date = new Date();
      const newRow = keys.map(k => productData[k] || '');
      sheet.appendRow(newRow);
      return { success: true, message: 'เพิ่มสินค้าใหม่เรียบร้อย' };
    }

    // หาแถวที่จะแก้ไข
    let rowIndex = -1;
    const m = String(productData.ID).match(/^row-(\d+)$/);
    if (m) {
      rowIndex = Number(m[1]);
      if (rowIndex < 2 || rowIndex > data.length) rowIndex = -1;
    } else if (idCol >= 0) {
      for (let i = 1; i < data.length; i++) {
        if (String(data[i][idCol]) === String(productData.ID)) { rowIndex = i + 1; break; }
      }
    }
    if (rowIndex === -1) return { success: false, message: 'ไม่พบรหัสสินค้านี้' };

    // คงค่าเดิมของคอลัมน์ที่ฟอร์มไม่ได้ส่งมา (เช่น วันที่, ID)
    const old = data[rowIndex - 1];
    const updateRow = keys.map((k, c) =>
      (k !== 'ID' && k !== 'Date' && productData.hasOwnProperty(k)) ? (productData[k] || '') : old[c]
    );
    sheet.getRange(rowIndex, 1, 1, keys.length).setValues([updateRow]);
    return { success: true, message: 'อัปเดตข้อมูลเรียบร้อย' };
  } finally {
    lock.releaseLock();
  }
}
