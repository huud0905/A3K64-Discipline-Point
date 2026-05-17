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

## Ghi chú Google Sheets

Nếu link GAS trả về `"students":[]`, web sẽ không tự dùng dữ liệu mẫu nữa. Khi đó cần điền dữ liệu vào đúng các tab:

### Students
`id | name | group | role | avatarInitial`

### ScoreEvents
`id | studentId | week | title | points | type | category | note | createdBy | createdAt`

### Weeks
`week`

## Tài khoản local tạm thời

Các tài khoản local trong `src/components/Login.tsx`:

- `gvcn` / `123456`
- `lop_truong` / `123456`
- `bi_thu` / `123456`
- `hoc_sinh` / `123456`

Đây chỉ là chặn nhập bậy ở frontend. Khi dùng thật nên chuyển đăng nhập sang Firebase hoặc xác thực qua Google Apps Script.

## Cấu trúc Google Sheet hiện tại

Bản này đọc trực tiếp 3 sheet hiện có:

### ACCOUNTS
Header cần có:
`username | password | role | to | hoten`

- `username`: email hoặc tên đăng nhập
- `password`: mật khẩu tạm thời
- `role`: `gvcn`, `lop_truong`, `bi_thu`, `to_truong`, `hoc_sinh`
- `to`: tổ 1/2/3/4
- `hoten`: họ tên hiển thị

### VI_PHAM
Header cần có:
`Tên | Điểm | Tính | Phân loại | Ghi chú`

### TUẦN
Bảng tuần đang dùng các cột:
`STT | Họ và tên | ND điểm cộng | Tổng cộng | Nội dung điểm trừ | Tổng trừ | Tổng điểm | Xếp Loại | Người chỉnh sửa`

Tab có thể tên `TUẦN`, `TUAN`, hoặc chứa chữ `Tuần`.

## GAS tuần v2

Bản này đọc học sinh từ các sheet `TUẦN n`, ví dụ `TUẦN 1`, `TUẦN 2`.

- `TUẦN 0` luôn bị bỏ qua.
- `ACCOUNTS` chỉ dùng cho đăng nhập, không dùng làm danh sách học sinh.
- Tổ được xác định bằng dòng `Tổ 1`, `Tổ 2`, `Tổ 3`, `Tổ 4` trong sheet tuần.
- Khi gặp `Tổ 2` thì kết thúc tổ 1; tương tự cho các tổ còn lại.
- Khi hết dữ liệu thì dừng.

## GAS tuần v3

- Chỉ đọc bảng chấm bên phải trong `TUẦN n`: `STT | Họ và tên | ND điểm cộng | Tổng cộng | Nội dung điểm trừ | Tổng trừ | Tổng điểm | Xếp Loại`.
- `TUẦN 0` luôn bị bỏ qua.
- `ACCOUNTS` chỉ dùng đăng nhập, không dùng để chia tổ học sinh.
- Tổ được xác định theo dòng `Tổ 1`, `Tổ 2`, `Tổ 3`, `Tổ 4` trong chính bảng tuần.
- Tổng điểm lấy từ cột `Tổng điểm` (cột N trong ảnh), xếp loại lấy từ cột `Xếp Loại` (cột O trong ảnh).
- Điểm mặc định 50 không hiện ở cột `Cộng (+)` / `Điểm +`; nó chỉ dùng để tính `Tổng`.
