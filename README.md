# Điểm thi đua 12A3 - Login source gốc

## Chạy thử

```bash
npm install
npm run dev
```

Mở địa chỉ Vite hiện ra, thường là:

```txt
http://localhost:5173
```

## Google Login

Giao diện vẫn chạy nếu chưa cấu hình Firebase. Nhưng để đăng nhập Google thật, tạo file `.env` từ `.env.example` và điền cấu hình Firebase.

Nếu deploy Render bị `origin_mismatch`, thêm domain Render vào:

- Google Cloud Console > OAuth Client > Authorized JavaScript origins
- Firebase Console > Authentication > Settings > Authorized domains

## Deploy GitHub + Render

### Render Static Site

```txt
Build Command: npm install && npm run build
Publish Directory: dist
```

### Environment Variable

```txt
VITE_GAS_WEB_APP_URL=https://script.google.com/macros/s/.../exec
```

### Push lên GitHub

```bash
git init
git remote add origin https://github.com/huud0905/A3K64-Discipline-Point.git
git branch -M main
git add .
git commit -m "Update A3K64 web source"
git push -u origin main --force
```
