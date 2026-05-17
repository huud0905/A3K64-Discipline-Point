# A3K64 Discipline Point

Ứng dụng React + Vite để quản lý điểm thi đua A3K64/12A3.

## Chạy local

```bash
npm install
npm run dev
```

Mặc định chạy ở:

```txt
http://localhost:5173
```

## Build

```bash
npm run build
```

## Firebase Google Login

Copy `.env.example` thành `.env` rồi điền các biến Firebase:

```txt
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_STORAGE_BUCKET=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
```

## Kết nối Google Apps Script + Google Sheets

### 1. Chuẩn bị Google Sheet

Tạo Google Sheet mới, sau đó tạo 3 sheet:

```txt
Students
ScoreEvents
Weeks
```

Có thể để trống, Apps Script sẽ tự tạo header nếu chưa có.

### 2. Cài Apps Script

Vào Google Sheet:

```txt
Extensions → Apps Script
```

Copy nội dung file:

```txt
gas/Api.gs
```

vào Apps Script, rồi sửa:

```js
const SPREADSHEET_ID = "PASTE_SPREADSHEET_ID_HERE";
```

thành ID Google Sheet của bạn.

### 3. Deploy Apps Script

```txt
Deploy → New deployment → Web app
Execute as: Me
Who has access: Anyone
Deploy
```

Copy Web App URL dạng:

```txt
https://script.google.com/macros/s/.../exec
```

### 4. Điền URL vào frontend

Trong file `.env`:

```txt
VITE_GAS_WEB_APP_URL=https://script.google.com/macros/s/.../exec
```

Nếu không có biến này, app vẫn chạy bằng localStorage/mock data.

## Deploy Render / static hosting

Build command:

```txt
npm install && npm run build
```

Publish directory:

```txt
dist
```

Nhớ thêm các biến môi trường Firebase và `VITE_GAS_WEB_APP_URL` nếu dùng Google Sheets.
