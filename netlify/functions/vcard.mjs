// นามบัตรเซลล์ (.vcf) สำหรับปุ่ม "บันทึกลงมือถือ"
// เปิด https://<เว็บ>/vcard?id=<รหัสเซลล์>&d=<deployment id ของ Apps Script>
// ดึงข้อมูลเซลล์จาก Apps Script (?action=products) แล้วสร้างไฟล์ที่นี่ จึงไม่ต้องแก้ Apps Script
// มือถือจะขึ้นหน้า "เพิ่มรายชื่อ" ทันที ชื่อในรายชื่อคือ "Siamsolar ชื่อเซลล์"

const CONTACT_PREFIX = 'Siamsolar';

const esc = v => String(v || '').replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/([,;])/g, '\\$1');

function driveId(u) {
  const m = String(u || '').trim().match(/(?:file\/d\/|[?&]id=|lh3\.googleusercontent\.com\/d\/|^)([\w-]{25,})/);
  return m ? m[1] : '';
}

async function photoBase64(url) {
  const id = driveId(url);
  const src = id ? 'https://drive.google.com/thumbnail?id=' + id + '&sz=w300' : (/^https:\/\//.test(url) ? url : '');
  if (!src) return null;
  try {
    const res = await fetch(src, { redirect: 'follow', signal: AbortSignal.timeout(6000) });
    const type = res.headers.get('content-type') || '';
    if (!res.ok || !type.startsWith('image/')) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > 400000) return null;
    return { type: /png/i.test(type) ? 'PNG' : 'JPEG', data: buf.toString('base64') };
  } catch (e) {
    return null;
  }
}

export function buildVCard(sale, photo, site) {
  const lines = [
    'BEGIN:VCARD',
    'VERSION:3.0',
    'N:' + esc(sale.Name) + ';' + esc(CONTACT_PREFIX) + ';;;',
    'FN:' + esc(CONTACT_PREFIX + ' ' + sale.Name),
    'ORG:' + esc(CONTACT_PREFIX) + (sale.Department ? ';' + esc(sale.Department) : '')
  ];
  if (sale.Position) lines.push('TITLE:' + esc(sale.Position));
  if (sale.Phone) lines.push('TEL;TYPE=CELL,VOICE:' + String(sale.Phone).replace(/[^\d+]/g, ''));
  if (sale.Email) lines.push('EMAIL;TYPE=INTERNET,WORK:' + esc(sale.Email));
  const line = String(sale.LINE || '').trim();
  const lineUrl = /^https?:\/\//i.test(line) ? line
    : line.startsWith('@') ? 'https://line.me/R/ti/p/' + encodeURIComponent(line)
    : line ? 'https://line.me/ti/p/~' + encodeURIComponent(line) : '';
  if (lineUrl) lines.push('URL;TYPE=LINE:' + lineUrl);
  if (site) lines.push('URL;TYPE=WORK:' + site);
  const note = [sale.Details, line && !/^https?:/i.test(line) ? 'LINE: ' + line : ''].filter(Boolean).join('\n');
  if (note) lines.push('NOTE:' + esc(note));
  if (photo) lines.push('PHOTO;ENCODING=b;TYPE=' + photo.type + ':' + photo.data);
  lines.push('END:VCARD');
  // บรรทัดยาวตัดทุก 74 ตัวอักษรตามมาตรฐาน vCard
  return lines.map(l => l.length <= 75 ? l : l.match(/.{1,74}/g).join('\r\n ')).join('\r\n') + '\r\n';
}

const text = (body, status) => new Response(body, { status, headers: { 'content-type': 'text/plain; charset=utf-8' } });

export default async (req) => {
  const url = new URL(req.url);
  const id = url.searchParams.get('id') || '';
  const dep = url.searchParams.get('d') || '';
  // รับเฉพาะลิงก์ Apps Script เพื่อไม่ให้ใช้ฟังก์ชันนี้ไปดึงเว็บอื่น
  if (!id || !/^[A-Za-z0-9_-]{20,120}$/.test(dep)) return text('ลิงก์ไม่ถูกต้อง', 400);

  let sales = [];
  try {
    const res = await fetch('https://script.google.com/macros/s/' + dep + '/exec?action=products', { redirect: 'follow', signal: AbortSignal.timeout(15000) });
    sales = (await res.json()).sales || [];
  } catch (e) {
    return text('โหลดข้อมูลเซลล์ไม่สำเร็จ กรุณาลองใหม่', 502);
  }
  const sale = sales.find(s => String(s.ID) === id);
  if (!sale) return text('ไม่พบข้อมูลเซลล์', 404);

  const card = buildVCard(sale, await photoBase64(sale.Photo), url.origin + '/');
  const fileName = (CONTACT_PREFIX + '-' + id).replace(/[^A-Za-z0-9_-]/g, '') + '.vcf';
  return new Response(card, {
    headers: {
      'content-type': 'text/vcard; charset=utf-8',
      'content-disposition': `inline; filename="${fileName}"; filename*=UTF-8''${encodeURIComponent(CONTACT_PREFIX + ' ' + sale.Name)}.vcf`,
      'cache-control': 'no-store'
    }
  });
};

export const config = { path: '/vcard' };
