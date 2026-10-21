// ==========================================
// 1. ตั้งค่าพื้นฐาน (Configuration)
// ==========================================
const SHEET_ID = '1Zm0QtxOVdjRYSuXKIJ9FLO1JMO_BI673LBMtk8DBfTo';
const FOLDER_ID = '1cvhCCc2S4W7nZCDMytgvNWhX03Zr3OT2';
const SHEET_NAME = 'Products';
const SALES_SHEET_NAME = 'Sales';
const BRANDS_SHEET_NAME = 'Brands';
const CONTACT_PREFIX = 'Siamsolar'; // ชื่อที่ขึ้นหน้าชื่อเซลล์ตอนบันทึกลงมือถือ เช่น "Siamsolar สมชาย" // ชีตรายชื่อเซลล์ (ระบบสร้างให้อัตโนมัติเมื่อบันทึกเซลล์คนแรก)

// Username / Password แอดมิน: ตั้งที่ Project Settings > Script Properties
// เพิ่ม ADMIN_USER และ ADMIN_PASS (ไม่เขียนรหัสไว้ในโค้ด เพื่อให้เก็บโค้ดบน GitHub ได้ปลอดภัย)
// ถ้ายังไม่ได้ตั้ง ADMIN_PASS ระบบจะไม่ให้ใครล็อกอินได้

// อายุของการล็อกอิน (วินาที) สูงสุดที่ CacheService รองรับคือ 6 ชั่วโมง
const TOKEN_TTL = 6 * 60 * 60;

// ==========================================
// ฟังก์ชันกระตุ้นการขออนุญาตสิทธิ์ (รันฟังก์ชันนี้ครั้งแรกครั้งเดียว)
// ==========================================
function setupPermissions() {
  SpreadsheetApp.openById(SHEET_ID).getName();
  // ทดสอบเขียนไฟล์ลงโฟลเดอร์จริง แล้วลบทิ้ง (เช็คว่าบัญชีนี้มีสิทธิ์แก้ไขโฟลเดอร์)
  var folder = DriveApp.getFolderById(FOLDER_ID);
  var test = folder.createFile(Utilities.newBlob('test', 'text/plain', 'permission-test.txt'));
  test.setTrashed(true);
  Logger.log("ได้รับสิทธิ์เรียบร้อยแล้ว (โฟลเดอร์: " + folder.getName() + ")");
}

// ==========================================
// 2. API สำหรับเว็บ Netlify
// ==========================================

// GET: ใช้อ่านข้อมูลสาธารณะ เช่น ?action=products
// ถ้าไม่มี action จะแสดงหน้าเว็บเดิม (ลิงก์ /exec เก่ายังใช้ได้ ถ้ายังมีไฟล์ Index.html อยู่)
function doGet(e) {
  const action = (e && e.parameter && e.parameter.action) || '';

  if (action === 'products') {
    return jsonOut({ success: true, data: getPublishedProducts(), sales: getVisibleSales(), brands: readBrandsSafe() });
  }
  if (action === 'vcard') {
    return saleVCard(e.parameter.id, e.parameter.site);
  }
  if (action === 'sales') {
    return jsonOut({ success: true, data: getVisibleSales() });
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
      return jsonOut({ success: true, data: getAllProducts(), brands: readBrandsSafe() });
    }
    if (action === 'upload') {
      return jsonOut({ success: true, data: uploadFileToDrive(body.base64, body.name, body.type) });
    }
    if (action === 'save') {
      return jsonOut(saveProduct(body.product || {}));
    }
    if (action === 'saveOrder') {
      return jsonOut(saveProductOrder(body.orders || []));
    }
    if (action === 'saveBrands') {
      return jsonOut(saveBrands(body.brands || []));
    }
    if (action === 'listSales') {
      return jsonOut({ success: true, data: readSales() });
    }
    if (action === 'saveSale') {
      return jsonOut(saveSale(body.sale || {}));
    }
    if (action === 'deleteSale') {
      return jsonOut(deleteSale(body.id));
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
  ['Order',       h => h.includes('order') || h.includes('ลำดับ')],
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

// บันทึกลำดับการแสดงสินค้า: orders = [{ ID: 'row-5', Order: 1 }, ...]
// ถ้า Sheet ยังไม่มีคอลัมน์ลำดับ ระบบจะเพิ่มคอลัมน์ "ลำดับ (Order)" ต่อท้ายให้
function saveProductOrder(orders) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const sheet = getProductSheet();
    const data = sheet.getDataRange().getValues();
    const keys = headerKeys(data[0]);
    let orderCol = keys.indexOf('Order');
    if (orderCol === -1) {
      orderCol = data[0].length;
      sheet.getRange(1, orderCol + 1).setValue('ลำดับ (Order)');
    }
    const idCol = keys.indexOf('ID');
    const rowOf = {};
    for (let i = 1; i < data.length; i++) {
      if (idCol >= 0 && data[i][idCol]) rowOf[String(data[i][idCol])] = i + 1;
      rowOf['row-' + (i + 1)] = i + 1;
    }
    const lastRow = Math.max(data.length, 2);
    const range = sheet.getRange(2, orderCol + 1, lastRow - 1, 1);
    const values = range.getValues();
    let changed = 0;
    orders.forEach(o => {
      const r = rowOf[String(o.ID)];
      if (r) { values[r - 2][0] = Number(o.Order) || ''; changed++; }
    });
    range.setValues(values);
    return { success: true, message: 'บันทึกลำดับเรียบร้อย (' + changed + ' รายการ)' };
  } finally {
    lock.releaseLock();
  }
}

// ==========================================
// 4.1 แบรนด์ (ชีต Brands) ชื่อ สี โลโก้ ลำดับ ซ่อน/แสดง
// ==========================================
const BRAND_HEADERS = ['Name', 'Color', 'Logo', 'Order', 'Status'];

// ยังไม่มีชีต Brands = คืนค่าว่าง แล้วหน้าเว็บจะใช้รายการแบรนด์ตั้งต้นใน index.html
function readBrandsSafe() {
  try {
    const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(BRANDS_SHEET_NAME);
    if (!sheet || sheet.getLastRow() < 2) return [];
    const data = sheet.getDataRange().getDisplayValues();
    const headers = data.shift().map(h => String(h).trim());
    return data
      .filter(row => row.some(cell => cell !== ''))
      .map(row => {
        const obj = {};
        headers.forEach((h, c) => { obj[h] = row[c]; });
        return obj;
      })
      .filter(b => b.Name)
      .sort((a, b) => (Number(a.Order) || 999) - (Number(b.Order) || 999));
  } catch (e) {
    return [];
  }
}

// บันทึกรายการแบรนด์ทั้งหมด (เพิ่ม แก้ไข ลบ เรียงลำดับ) ในครั้งเดียว
// ถ้าเปลี่ยนชื่อแบรนด์ (OldName ไม่ตรงกับ Name) จะเปลี่ยนชื่อแบรนด์ในสินค้าทุกตัวให้ด้วย
function saveBrands(brands) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const clean = brands
      .map(b => ({
        Name: String(b.Name || '').trim(),
        OldName: String(b.OldName || '').trim(),
        Color: /^#[0-9a-f]{3,8}$/i.test(String(b.Color || '').trim()) ? String(b.Color).trim() : '#1d3f8f',
        Logo: String(b.Logo || '').trim(),
        Status: String(b.Status || '').toLowerCase() === 'hide' ? 'Hide' : 'Show'
      }))
      .filter(b => b.Name);
    const names = clean.map(b => b.Name.toLowerCase());
    if (names.some((n, i) => names.indexOf(n) !== i)) {
      return { success: false, message: 'มีชื่อแบรนด์ซ้ำกัน' };
    }

    const ss = SpreadsheetApp.openById(SHEET_ID);
    let sheet = ss.getSheetByName(BRANDS_SHEET_NAME);
    if (!sheet) sheet = ss.insertSheet(BRANDS_SHEET_NAME);
    sheet.clearContents();
    const rows = [BRAND_HEADERS].concat(clean.map((b, i) => [b.Name, b.Color, b.Logo, i + 1, b.Status]));
    sheet.getRange(1, 1, rows.length, BRAND_HEADERS.length).setValues(rows);
    sheet.getRange(1, 1, 1, BRAND_HEADERS.length).setFontWeight('bold');
    sheet.setFrozenRows(1);

    // เปลี่ยนชื่อแบรนด์ในชีตสินค้า
    let renamed = 0;
    const renames = clean.filter(b => b.OldName && b.OldName !== b.Name);
    if (renames.length) {
      const pSheet = getProductSheet();
      const data = pSheet.getDataRange().getValues();
      const brandCol = headerKeys(data[0]).indexOf('Brand');
      if (brandCol >= 0 && data.length > 1) {
        const range = pSheet.getRange(2, brandCol + 1, data.length - 1, 1);
        const values = range.getValues();
        values.forEach(v => {
          const r = renames.find(b => String(v[0]).trim() === b.OldName);
          if (r) { v[0] = r.Name; renamed++; }
        });
        range.setValues(values);
      }
    }
    return { success: true, message: 'บันทึกแบรนด์เรียบร้อย' + (renamed ? ' (เปลี่ยนชื่อแบรนด์ในสินค้า ' + renamed + ' รายการ)' : '') };
  } finally {
    lock.releaseLock();
  }
}

// ==========================================
// 5. ทีมเซลล์ (ชีต Sales)
// ==========================================
const SALES_HEADERS = ['ID', 'Name', 'Position', 'Phone', 'LINE', 'Email', 'Photo', 'Details', 'Order', 'Status', 'Department'];

function getSalesSheet(create) {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  let sheet = ss.getSheetByName(SALES_SHEET_NAME);
  if (!sheet && create) {
    sheet = ss.insertSheet(SALES_SHEET_NAME);
    sheet.getRange(1, 1, 1, SALES_HEADERS.length).setValues([SALES_HEADERS]).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

// เติมคอลัมน์ที่ยังไม่มี (เช่น Department) ต่อท้ายชีต Sales เดิม
function ensureSalesHeaders(sheet) {
  const lastCol = Math.max(sheet.getLastColumn(), 1);
  const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(h => String(h).trim());
  const missing = SALES_HEADERS.filter(h => headers.indexOf(h) === -1);
  if (missing.length) {
    sheet.getRange(1, lastCol + 1, 1, missing.length).setValues([missing]).setFontWeight('bold');
  }
}

function readSales() {
  const sheet = getSalesSheet(false);
  if (!sheet || sheet.getLastRow() < 2) return [];
  const data = sheet.getDataRange().getDisplayValues();
  const headers = data.shift().map(h => String(h).trim());
  return data
    .filter(row => row.some(cell => cell !== ''))
    .map(row => {
      const obj = {};
      headers.forEach((h, c) => { obj[h] = row[c]; });
      return obj;
    })
    .sort((a, b) => (Number(a.Order) || 999) - (Number(b.Order) || 999));
}

// เซลล์ที่แสดงบนหน้าเว็บ (ซ่อนคนที่ Status = Hide)
function getVisibleSales() {
  try {
    return readSales().filter(s => String(s.Status || '').trim().toLowerCase() !== 'hide');
  } catch (e) {
    return [];
  }
}

function saveSale(sale) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const sheet = getSalesSheet(true);
    ensureSalesHeaders(sheet);
    const data = sheet.getDataRange().getValues();
    const headers = data[0].map(h => String(h).trim());
    const idCol = headers.indexOf('ID');

    if (!sale.ID) {
      sale.ID = 'S-' + new Date().getTime();
      sheet.appendRow(headers.map(h => sale[h] || ''));
      return { success: true, message: 'เพิ่มเซลล์เรียบร้อย' };
    }
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][idCol]) === String(sale.ID)) {
        const row = headers.map((h, c) => (h !== 'ID' && sale.hasOwnProperty(h)) ? (sale[h] || '') : data[i][c]);
        sheet.getRange(i + 1, 1, 1, headers.length).setValues([row]);
        return { success: true, message: 'อัปเดตข้อมูลเซลล์เรียบร้อย' };
      }
    }
    return { success: false, message: 'ไม่พบเซลล์คนนี้' };
  } finally {
    lock.releaseLock();
  }
}

function deleteSale(id) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const sheet = getSalesSheet(false);
    if (!sheet) return { success: false, message: 'ไม่พบชีต Sales' };
    const data = sheet.getDataRange().getValues();
    const idCol = data[0].map(h => String(h).trim()).indexOf('ID');
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][idCol]) === String(id)) {
        sheet.deleteRow(i + 1);
        return { success: true, message: 'ลบเซลล์เรียบร้อย' };
      }
    }
    return { success: false, message: 'ไม่พบเซลล์คนนี้' };
  } finally {
    lock.releaseLock();
  }
}

// นามบัตรเซลล์ (.vcf) สำหรับกด "บันทึกลงมือถือ" ใส่รูป ชื่อ ตำแหน่ง เบอร์ อีเมล LINE
function saleVCard(id, site) {
  const sale = getVisibleSales().find(s => String(s.ID) === String(id));
  if (!sale) return ContentService.createTextOutput('ไม่พบข้อมูลเซลล์');

  const esc = v => String(v || '').replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/([,;])/g, '\\$1');
  const fullName = (CONTACT_PREFIX ? CONTACT_PREFIX + ' ' : '') + sale.Name;
  const lines = [
    'BEGIN:VCARD',
    'VERSION:3.0',
    'N:' + esc(sale.Name) + ';' + esc(CONTACT_PREFIX) + ';;;',
    'FN:' + esc(fullName),
    'ORG:' + esc(CONTACT_PREFIX) + (sale.Department ? ';' + esc(sale.Department) : '')
  ];
  if (sale.Position) lines.push('TITLE:' + esc(sale.Position));
  if (sale.Phone) lines.push('TEL;TYPE=CELL,VOICE:' + String(sale.Phone).replace(/[^\d+]/g, ''));
  if (sale.Email) lines.push('EMAIL;TYPE=INTERNET,WORK:' + esc(sale.Email));

  const line = String(sale.LINE || '').trim();
  let lineUrl = '';
  if (/^https?:\/\//i.test(line)) lineUrl = line;
  else if (line.startsWith('@')) lineUrl = 'https://line.me/R/ti/p/' + encodeURIComponent(line);
  else if (line) lineUrl = 'https://line.me/ti/p/~' + encodeURIComponent(line);
  if (lineUrl) lines.push('URL;TYPE=LINE:' + lineUrl);
  if (site && /^https:\/\/[\w.-]+\//.test(site)) lines.push('URL;TYPE=WORK:' + site);

  const note = [sale.Details, line && !/^https?:/i.test(line) ? 'LINE: ' + line : ''].filter(Boolean).join('\n');
  if (note) lines.push('NOTE:' + esc(note));

  const photo = salePhotoBase64(sale.Photo);
  if (photo) lines.push('PHOTO;ENCODING=b;TYPE=' + photo.type + ':' + photo.data);
  lines.push('END:VCARD');

  // บรรทัดยาวต้องตัดทุก 75 ตัวอักษรตามมาตรฐาน vCard
  const folded = lines.map(l => l.length <= 75 ? l : l.match(/.{1,74}/g).join('\r\n ')).join('\r\n');
  const fileName = fullName.replace(/[\\\/:*?"<>|]/g, '') + '.vcf';
  return ContentService.createTextOutput(folded)
    .setMimeType(ContentService.MimeType.VCARD)
    .downloadAsFile(fileName);
}

// ดึงรูปโปรไฟล์จาก Google Drive (ย่อขนาดแล้ว) เป็น base64
function salePhotoBase64(url) {
  const m = String(url || '').trim().match(/(?:file\/d\/|[?&]id=|lh3\.googleusercontent\.com\/d\/|^)([\w-]{25,})/);
  if (!m) return null;
  try {
    const blob = DriveApp.getFileById(m[1]).getThumbnail();
    if (!blob) return null;
    const type = /png/i.test(blob.getContentType()) ? 'PNG' : 'JPEG';
    return { type: type, data: Utilities.base64Encode(blob.getBytes()) };
  } catch (e) {
    return null;
  }
}
