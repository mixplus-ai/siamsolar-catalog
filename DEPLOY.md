# คู่มือติดตั้งแบบละเอียด (ทีละคลิก)

ทำ **ส่วน A (Apps Script) ก่อน** แล้วค่อยทำ **ส่วน B (Netlify)** ใช้คอมพิวเตอร์จะง่ายกว่ามือถือ

---

## ส่วน A: อัปเดต Google Apps Script

### A1. คัดลอกโค้ดใหม่จาก GitHub
1. เปิด https://github.com/mixplus-ai/siamsolar-catalog/blob/main/apps-script/Code.gs
2. มุมขวาบนของกล่องโค้ด มีไอคอนรูป **สี่เหลี่ยมซ้อนกัน 2 อัน** (ชื่อปุ่ม *Copy raw file*) กด 1 ครั้ง โค้ดทั้งหมดจะถูกคัดลอก

### A2. วางโค้ดทับของเดิม
1. เปิด https://script.google.com แล้วคลิกโปรเจกต์ที่ใช้ทำแคตตาล็อกอยู่
2. แถบซ้ายสุด กดไอคอน **`< >` (Editor)**
3. ในรายการไฟล์ คลิก **Code.gs**
4. คลิกในช่องโค้ด กด `Ctrl + A` (Mac: `Cmd + A`) เพื่อเลือกทั้งหมด แล้วกด `Ctrl + V` วางโค้ดใหม่ทับ
5. กด `Ctrl + S` หรือไอคอน **💾 Save**
6. **อย่าลบไฟล์ Index.html** ใน Apps Script ปล่อยไว้เหมือนเดิม

### A3. ตั้งชื่อผู้ใช้และรหัสผ่านแอดมิน
1. แถบซ้ายสุด กดไอคอน **⚙️ (Project Settings / การตั้งค่าโปรเจ็กต์)**
2. เลื่อนลงล่างสุด จะเจอหัวข้อ **Script Properties (พร็อพเพอร์ตี้ของสคริปต์)**
3. กด **Edit script properties** แล้วกด **Add script property**
4. ช่อง Property ใส่ `ADMIN_USER` ช่อง Value ใส่ชื่อผู้ใช้ เช่น `admin`
5. กด **Add script property** อีกครั้ง ช่อง Property ใส่ `ADMIN_PASS` ช่อง Value ใส่รหัสผ่านใหม่ (ไม่ควรใช้ solar1234)
6. กด **Save script properties**

> ชื่อ `ADMIN_USER` และ `ADMIN_PASS` ต้องพิมพ์ตัวพิมพ์ใหญ่ตรงตามนี้ทุกตัว

### A4. อนุญาตสิทธิ์ (ทำครั้งเดียว)
1. กลับไปที่ไอคอน **`< >` Editor**
2. แถบด้านบนช่องโค้ด มีช่องเลือกฟังก์ชัน (อยู่ข้างปุ่ม ▶ Run / Debug) เลือก **setupPermissions**
3. กด **▶ Run**
4. ถ้าขึ้นหน้าต่าง *Authorization required* ให้กด **Review permissions** แล้วเลือกบัญชี Google ของคุณ
5. ถ้าขึ้น *Google hasn't verified this app* ให้กด **Advanced (ขั้นสูง)** แล้วกด **Go to ... (unsafe)** จากนั้นกด **Allow (อนุญาต)**
6. ด้านล่างจะขึ้น Execution log ว่า *ได้รับสิทธิ์เรียบร้อยแล้ว* ถือว่าผ่าน

### A5. Deploy เวอร์ชันใหม่ (URL เดิมไม่เปลี่ยน)
1. มุมขวาบน กดปุ่มสีน้ำเงิน **Deploy (การทำให้ใช้งานได้)** แล้วเลือก **Manage deployments (จัดการการทำให้ใช้งานได้)**
2. ด้านซ้ายของหน้าต่าง คลิก deployment ที่ใช้อยู่ (ที่มี URL ลงท้าย `.../exec` ตัวเดิม)
3. มุมขวาบนของหน้าต่าง กดไอคอน **✏️ ดินสอ (Edit)**
4. ช่อง **Version** กดเลือก **New version**
5. ช่อง **Execute as** เลือก **Me (อีเมลของคุณ)**
6. ช่อง **Who has access** เลือก **Anyone (ทุกคน)**
   ต้องเป็น *Anyone* เท่านั้น ห้ามเลือก *Anyone with Google account* ไม่งั้นหน้าเว็บบน Netlify จะโหลดสินค้าไม่ได้
7. กด **Deploy** แล้วกด **Done**

### A6. ทดสอบว่าใช้ได้
เปิดลิงก์นี้ในเบราว์เซอร์:

```
https://script.google.com/macros/s/AKfycbxIlMZClbBFfPlHSWOzVrGUWfzBiCASUQ-Zs3Bu65J2LbqrcFtCKkaMP0qS3xHdfI7n/exec?action=products
```

ถ้าเห็นตัวหนังสือขึ้นต้นด้วย `{"success":true,"data":[...` แปลว่าผ่าน

> ถ้าตอน A5 คุณเผลอกด **New deployment** แทน จะได้ URL ใหม่ ให้ส่ง URL ใหม่มาให้ผม เพื่อแก้ใน index.html

---

## ส่วน B: เอาเว็บขึ้น Netlify จาก GitHub

### B1. สมัคร / เข้าสู่ระบบ Netlify
1. เปิด https://app.netlify.com
2. กด **Sign up** หรือ **Log in** แล้วเลือก **GitHub** (ใช้บัญชี GitHub `mixplus-ai`) กด **Authorize Netlify** ถ้าถูกถาม

### B2. สร้างเว็บจาก repo
1. หน้าแรกของ Netlify กดปุ่ม **Add new project** (บางบัญชีเขียนว่า *Add new site*) แล้วเลือก **Import an existing project**
2. หัวข้อ *Connect to Git provider* กด **GitHub**
3. จะเด้งหน้าต่าง GitHub ให้ติดตั้ง Netlify ถ้าถามว่าให้เข้าถึง repo ไหน เลือก **Only select repositories** แล้วเลือก `siamsolar-catalog` กด **Install / Save**
4. กลับมาที่ Netlify จะเห็นรายชื่อ repo คลิก **siamsolar-catalog**
   - ถ้าไม่เห็น ให้กดลิงก์ **Configure the Netlify app on GitHub** ด้านล่างรายการ แล้วเพิ่ม repo นี้

### B3. ตั้งค่าก่อน Deploy
ระบบจะอ่านค่าจากไฟล์ `netlify.toml` ให้เองแล้ว ให้ตรวจแค่ว่า

| ช่อง | ค่า |
|---|---|
| Branch to deploy | `main` |
| Base directory | ปล่อยว่าง |
| Build command | ปล่อยว่าง |
| Publish directory | `.` (จุดเดียว) หรือปล่อยว่าง |

ช่องตั้งชื่อเว็บ (*Project name*) ถ้ามี ใส่ชื่อที่อยากได้ เช่น `siamsolar` เว็บจะเป็น `siamsolar.netlify.app` (ถ้าชื่อซ้ำกับคนอื่น ระบบจะให้เปลี่ยน)

กดปุ่ม **Deploy siamsolar-catalog** รอประมาณ 10 ถึง 30 วินาที จนขึ้นสถานะ **Published**

### B4. เปิดดูเว็บ
- หน้าลูกค้า: ลิงก์สีเขียวด้านบน เช่น `https://siamsolar.netlify.app`
- หน้าแอดมิน: เติม `/admin` ท้ายลิงก์ เช่น `https://siamsolar.netlify.app/admin` แล้วล็อกอินด้วย ADMIN_USER / ADMIN_PASS ที่ตั้งในขั้น A3

### B5. เปลี่ยนชื่อเว็บภายหลัง (ถ้าต้องการ)
**Project configuration** (หรือ *Site configuration*) > **General** > **Project details** > **Change project name**

---

## ปัญหาที่เจอบ่อย

| อาการ | วิธีแก้ |
|---|---|
| หน้าเว็บขึ้น "โหลดข้อมูลไม่สำเร็จ" | ตรวจขั้น A5 ว่าเลือก **New version** และ **Anyone** แล้ว และลองลิงก์ทดสอบในขั้น A6 |
| ล็อกอินแอดมินแล้วขึ้น "ยังไม่ได้ตั้งรหัสผ่านแอดมิน" | ทำขั้น A3 แล้วทำ A5 ซ้ำ |
| ล็อกอินแล้วขึ้น "Username หรือ Password ไม่ถูกต้อง" | ตรวจตัวพิมพ์เล็กใหญ่ใน Script Properties |
| รูปสินค้าไม่ขึ้น | ไฟล์ใน Drive ต้องแชร์เป็น *Anyone with the link* (ไฟล์ที่อัปโหลดผ่านหน้าแอดมินตั้งให้อัตโนมัติ) |
| เข้า `/admin` แล้วขึ้น Page not found | ตรวจว่าไฟล์ `netlify.toml` อยู่ใน repo (มีอยู่แล้ว) แล้วกด **Deploys > Trigger deploy** |

## เวลาแก้ไขในอนาคต
- **แก้สินค้า:** ใช้หน้า `/admin` หรือแก้ใน Google Sheet ได้เลย ไม่ต้อง deploy ใหม่
- **แก้หน้าเว็บ (index.html):** แก้ไฟล์บน GitHub แล้ว Netlify จะอัปเดตเองใน 1 นาที
- **แก้ Code.gs:** ต้องทำขั้น A2 และ A5 ใหม่ทุกครั้ง
