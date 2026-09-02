/* ============================================================
   A3K64 Worker — OTP handlers
   Thêm vào file worker hiện tại (api.gs / worker.js)
   ------------------------------------------------------------
   Biến môi trường cần khai báo trong Cloudflare Dashboard:
     BREVO_API_KEY   — API key từ Brevo
     BREVO_FROM_EMAIL — Email đã verify trong Brevo (vd: gvcn@gmail.com)
     BREVO_FROM_NAME  — Tên hiển thị (vd: "Lớp 12A3 A3K64")
     TURSO_URL        — libSQL URL (https://xxx.turso.io)
     TURSO_TOKEN      — Auth token Turso
   ============================================================ */

/* ──────────────────────────────────────────────────────────
   TURSO HELPER — gọi HTTP API của Turso (libSQL)
   ────────────────────────────────────────────────────────── */
async function tursoQuery(env, sql, args = []) {
  const res = await fetch(`${env.TURSO_URL}/v2/pipeline`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.TURSO_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      requests: [
        { type: 'execute', stmt: { sql, args: args.map(v => ({ type: 'text', value: String(v ?? '') })) } },
        { type: 'close' },
      ],
    }),
  });
  if (!res.ok) throw new Error(`Turso HTTP ${res.status}`);
  const data = await res.json();
  // Trả về rows của lệnh execute đầu tiên
  const result = data.results?.[0];
  if (result?.type === 'error') throw new Error(result.error?.message || 'Turso error');
  return result?.response?.result ?? null;
}

/* Đọc rows dưới dạng mảng object */
function tursoRows(result) {
  if (!result?.rows) return [];
  const cols = result.cols.map(c => c.name);
  return result.rows.map(row =>
    Object.fromEntries(cols.map((c, i) => [c, row[i]?.value ?? null]))
  );
}

/* ──────────────────────────────────────────────────────────
   SETUP — tạo bảng otp_sessions nếu chưa có
   Gọi 1 lần khi deploy hoặc trong scheduled handler
   ────────────────────────────────────────────────────────── */
export async function setupOTPTable(env) {
  await tursoQuery(env, `
    CREATE TABLE IF NOT EXISTS otp_sessions (
      id            TEXT PRIMARY KEY,
      fullname      TEXT NOT NULL,
      phone         TEXT NOT NULL,
      otp_hash      TEXT NOT NULL,
      session_token TEXT,
      email_target  TEXT NOT NULL,
      attempts      INTEGER DEFAULT 0,
      verified      INTEGER DEFAULT 0,
      created_at    INTEGER NOT NULL,
      expires_at    INTEGER NOT NULL
    )
  `);
  // Index để cleanup nhanh
  await tursoQuery(env, `
    CREATE INDEX IF NOT EXISTS idx_otp_expires ON otp_sessions(expires_at)
  `);
}

/* ──────────────────────────────────────────────────────────
   HELPERS
   ────────────────────────────────────────────────────────── */

/** Tạo OTP 6 chữ số ngẫu nhiên */
function generateOTP() {
  const arr = new Uint32Array(1);
  crypto.getRandomValues(arr);
  return String(arr[0] % 1000000).padStart(6, '0');
}

/** Hash OTP bằng SHA-256 (không lưu plain text vào DB) */
async function hashOTP(otp) {
  const buf  = new TextEncoder().encode(otp);
  const hash = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2,'0')).join('');
}

/** Tạo session token ngẫu nhiên 32 bytes hex */
function generateToken() {
  const arr = new Uint8Array(32);
  crypto.getRandomValues(arr);
  return Array.from(arr).map(b => b.toString(16).padStart(2,'0')).join('');
}

/** Mask email: nguyen.van.a@gmail.com → ng***@gmail.com */
function maskEmail(email) {
  if (!email || !email.includes('@')) return '***@***.com';
  const [local, domain] = email.split('@');
  const show = local.slice(0, Math.min(2, local.length));
  return `${show}***@${domain}`;
}

/** Gửi email qua Brevo API */
async function sendBrevoEmail(env, { to, toName, subject, html }) {
  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'api-key': env.BREVO_API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      sender: { email: env.BREVO_FROM_EMAIL, name: env.BREVO_FROM_NAME || 'A3K64' },
      to: [{ email: to, name: toName || to }],
      subject,
      htmlContent: html,
    }),
  });
  if (!res.ok) {
    const err = await res.text().catch(() => res.status);
    throw new Error(`Brevo error: ${err}`);
  }
  return true;
}

/** Template email OTP */
function otpEmailHTML(otp, fullname, expiresMinutes = 5) {
  return `
<!DOCTYPE html>
<html lang="vi">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f7fc;font-family:'Inter',system-ui,sans-serif">
  <div style="max-width:480px;margin:32px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.08)">
    <!-- Header -->
    <div style="background:linear-gradient(135deg,#2f6fed,#1d4ed8);padding:28px 32px;text-align:center">
      <div style="font-size:28px;margin-bottom:8px">🛡</div>
      <h1 style="margin:0;color:#fff;font-size:20px;font-weight:800;letter-spacing:-.02em">A3K64</h1>
      <p style="margin:4px 0 0;color:rgba(255,255,255,.75);font-size:12px">Bảng điểm thi đua lớp 12A3</p>
    </div>
    <!-- Body -->
    <div style="padding:32px">
      <p style="margin:0 0 8px;color:#101828;font-size:15px">Xin chào <strong>${fullname}</strong>,</p>
      <p style="margin:0 0 24px;color:#5c6b81;font-size:13px;line-height:1.6">
        Bạn đã yêu cầu đặt lại mật khẩu. Dùng mã OTP bên dưới — có hiệu lực trong <strong>${expiresMinutes} phút</strong>.
      </p>
      <!-- OTP box -->
      <div style="background:#f0f5ff;border:2px dashed #93b4f8;border-radius:12px;padding:20px;text-align:center;margin-bottom:24px">
        <div style="font-size:36px;font-weight:800;letter-spacing:.25em;color:#2f6fed;font-family:monospace">${otp}</div>
        <div style="font-size:11px;color:#8b98af;margin-top:6px">Mã xác nhận 6 chữ số</div>
      </div>
      <div style="background:#fff8f0;border:1px solid #fde68a;border-radius:10px;padding:12px 14px;font-size:12px;color:#92400e;line-height:1.5">
        ⚠ <strong>Không chia sẻ</strong> mã này với bất kỳ ai, kể cả giáo viên hay quản trị viên.<br>
        Nếu bạn không yêu cầu đặt lại mật khẩu, hãy bỏ qua email này.
      </div>
    </div>
    <!-- Footer -->
    <div style="padding:16px 32px;border-top:1px solid #f0f0f0;text-align:center">
      <p style="margin:0;font-size:11px;color:#94a1b5">Lớp 12A3 · NDT · A3K64 System</p>
    </div>
  </div>
</body>
</html>`;
}

/* ──────────────────────────────────────────────────────────
   ACTION: sendOTP
   payload: { fullname, phone }
   - Tìm học sinh trong DB chính theo fullname + phone
   - Tạo OTP, hash, lưu vào otp_sessions (TTL 5 phút)
   - Gửi email qua Brevo đến email cũ của học sinh
   - Trả về { ok, emailMasked }
   ────────────────────────────────────────────────────────── */
export async function handleSendOTP(env, payload) {
  const { fullname, phone } = payload || {};

  if (!fullname?.trim() || !phone?.trim()) {
    return { ok: false, error: 'Thiếu họ tên hoặc số điện thoại.' };
  }

  // ── 1. Tìm học sinh trong bảng users / students của DB chính ──
  // Điều chỉnh tên bảng và cột cho phù hợp với schema Turso của bạn
  const userResult = await tursoQuery(env, `
    SELECT id, fullname, email, phone, phone_father, phone_mother
    FROM users
    WHERE LOWER(TRIM(fullname)) = LOWER(TRIM(?))
    LIMIT 1
  `, [fullname.trim()]);

  const users = tursoRows(userResult);
  if (!users.length) {
    return { ok: false, error: 'Không tìm thấy tài khoản với họ tên này.' };
  }

  const user = users[0];
  const cleanPhone = phone.replace(/[\s\-]/g, '');

  // Kiểm tra SĐT khớp với 1 trong 3 số
  const phonesOk = [user.phone, user.phone_father, user.phone_mother]
    .filter(Boolean)
    .map(p => p.replace(/[\s\-]/g, ''))
    .some(p => p === cleanPhone);

  if (!phonesOk) {
    return { ok: false, error: 'Số điện thoại không khớp với thông tin trong hồ sơ.' };
  }

  if (!user.email) {
    return { ok: false, error: 'Tài khoản này chưa có email. Liên hệ GVCN để được hỗ trợ.' };
  }

  // ── 2. Rate limit: tối đa 3 OTP/10 phút/user ──
  const tenMinAgo = Date.now() - 10 * 60 * 1000;
  const recentResult = await tursoQuery(env, `
    SELECT COUNT(*) as cnt FROM otp_sessions
    WHERE fullname = ? AND phone = ? AND created_at > ?
  `, [fullname.trim(), cleanPhone, String(tenMinAgo)]);

  const recentCount = parseInt(tursoRows(recentResult)[0]?.cnt ?? '0', 10);
  if (recentCount >= 3) {
    return { ok: false, error: 'Bạn đã gửi quá nhiều yêu cầu. Thử lại sau 10 phút.' };
  }

  // ── 3. Tạo OTP ──
  const otp       = generateOTP();
  const otpHash   = await hashOTP(otp);
  const sessionId = generateToken();
  const now       = Date.now();
  const expiresAt = now + 5 * 60 * 1000; // 5 phút

  // Xoá OTP cũ của user này (còn hạn) trước khi tạo mới
  await tursoQuery(env, `
    DELETE FROM otp_sessions WHERE fullname = ? AND phone = ? AND verified = 0
  `, [fullname.trim(), cleanPhone]);

  // Lưu OTP mới
  await tursoQuery(env, `
    INSERT INTO otp_sessions (id, fullname, phone, otp_hash, email_target, attempts, verified, created_at, expires_at)
    VALUES (?, ?, ?, ?, ?, 0, 0, ?, ?)
  `, [sessionId, fullname.trim(), cleanPhone, otpHash, user.email, String(now), String(expiresAt)]);

  // ── 4. Gửi email ──
  await sendBrevoEmail(env, {
    to: user.email,
    toName: user.fullname,
    subject: `[A3K64] Mã OTP đặt lại mật khẩu: ${otp}`,
    html: otpEmailHTML(otp, user.fullname, 5),
  });

  return {
    ok: true,
    emailMasked: maskEmail(user.email),
  };
}

/* ──────────────────────────────────────────────────────────
   ACTION: verifyOTP
   payload: { fullname, phone, otp }
   - Tìm session OTP còn hạn
   - So sánh hash
   - Nếu đúng: đánh dấu verified, trả về sessionToken
   - Nếu sai: tăng attempts, khoá sau 5 lần sai
   ────────────────────────────────────────────────────────── */
export async function handleVerifyOTP(env, payload) {
  const { fullname, phone, otp } = payload || {};

  if (!fullname?.trim() || !phone?.trim() || !otp?.trim()) {
    return { ok: false, error: 'Thiếu thông tin xác minh.' };
  }

  const cleanPhone = phone.replace(/[\s\-]/g, '');
  const now        = Date.now();

  // Tìm session còn hạn, chưa verified
  const sessResult = await tursoQuery(env, `
    SELECT * FROM otp_sessions
    WHERE fullname = ? AND phone = ? AND verified = 0 AND expires_at > ?
    ORDER BY created_at DESC
    LIMIT 1
  `, [fullname.trim(), cleanPhone, String(now)]);

  const sessions = tursoRows(sessResult);
  if (!sessions.length) {
    return { ok: false, error: 'Mã OTP đã hết hạn hoặc không tồn tại. Vui lòng yêu cầu mã mới.' };
  }

  const sess = sessions[0];

  // Kiểm tra số lần sai
  if (parseInt(sess.attempts, 10) >= 5) {
    return { ok: false, error: 'Đã nhập sai quá 5 lần. Vui lòng yêu cầu mã OTP mới.' };
  }

  // So sánh hash
  const inputHash = await hashOTP(otp.trim());
  if (inputHash !== sess.otp_hash) {
    // Tăng attempts
    await tursoQuery(env, `
      UPDATE otp_sessions SET attempts = attempts + 1 WHERE id = ?
    `, [sess.id]);
    const remaining = 4 - parseInt(sess.attempts, 10);
    return { ok: false, error: `Mã OTP không đúng. Còn ${remaining} lần thử.` };
  }

  // ── OTP đúng: tạo sessionToken, đánh dấu verified ──
  const sessionToken = generateToken();
  // Session token có hiệu lực thêm 10 phút để bước 3 hoàn thành
  const tokenExpires = now + 10 * 60 * 1000;

  await tursoQuery(env, `
    UPDATE otp_sessions
    SET verified = 1, session_token = ?, expires_at = ?
    WHERE id = ?
  `, [sessionToken, String(tokenExpires), sess.id]);

  return {
    ok: true,
    sessionToken,
  };
}

/* ──────────────────────────────────────────────────────────
   ACTION: resetPassword
   payload: { fullname, phone, sessionToken, email, password }
   - Verify sessionToken còn hạn
   - Cập nhật email (nếu có) và password vào bảng users
   - Xoá session
   ────────────────────────────────────────────────────────── */
export async function handleResetPassword(env, payload) {
  const { fullname, phone, sessionToken, email, password } = payload || {};

  if (!fullname?.trim() || !phone?.trim() || !sessionToken || !password) {
    return { ok: false, error: 'Thiếu thông tin cập nhật.' };
  }
  if (password.length < 6) {
    return { ok: false, error: 'Mật khẩu phải có ít nhất 6 ký tự.' };
  }

  const cleanPhone = phone.replace(/[\s\-]/g, '');
  const now        = Date.now();

  // ── 1. Verify session token ──
  const sessResult = await tursoQuery(env, `
    SELECT * FROM otp_sessions
    WHERE fullname = ? AND phone = ? AND session_token = ? AND verified = 1 AND expires_at > ?
    LIMIT 1
  `, [fullname.trim(), cleanPhone, sessionToken, String(now)]);

  const sessions = tursoRows(sessResult);
  if (!sessions.length) {
    return { ok: false, error: 'Phiên xác thực hết hạn hoặc không hợp lệ. Vui lòng bắt đầu lại.' };
  }

  const sess = sessions[0];

  // ── 2. Hash mật khẩu mới ──
  // Dùng SHA-256 đơn giản — nếu DB đang dùng bcrypt thì thay bằng
  // thư viện tương ứng (bcryptjs chạy được trong Workers)
  const pwHash = await hashPassword(password);

  // ── 3. Cập nhật user ──
  // Nếu email truyền lên là null/rỗng → chỉ đổi password, giữ nguyên email
  if (email && email.trim()) {
    await tursoQuery(env, `
      UPDATE users
      SET password = ?, email = ?, updated_at = ?
      WHERE LOWER(TRIM(fullname)) = LOWER(TRIM(?))
    `, [pwHash, email.trim(), String(now), fullname.trim()]);
  } else {
    await tursoQuery(env, `
      UPDATE users
      SET password = ?, updated_at = ?
      WHERE LOWER(TRIM(fullname)) = LOWER(TRIM(?))
    `, [pwHash, String(now), fullname.trim()]);
  }

  // ── 4. Xoá session đã dùng ──
  await tursoQuery(env, `DELETE FROM otp_sessions WHERE id = ?`, [sess.id]);

  // ── 5. Cleanup OTP cũ đã hết hạn (housekeeping) ──
  await tursoQuery(env, `DELETE FROM otp_sessions WHERE expires_at < ?`, [String(now)]).catch(() => {});

  return { ok: true };
}

/* ──────────────────────────────────────────────────────────
   HASH PASSWORD
   Nếu hệ thống hiện tại dùng SHA-256 thì giữ nguyên hàm này.
   Nếu dùng bcrypt, thay bằng: import { hash } from 'bcryptjs'
   ────────────────────────────────────────────────────────── */
async function hashPassword(password) {
  // ⚠ Đổi sang bcrypt nếu DB đang lưu bcrypt hash
  const buf  = new TextEncoder().encode(password);
  const hash = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2,'0')).join('');
}

/* ──────────────────────────────────────────────────────────
   CÁCH TÍCH HỢP VÀO WORKER CHÍNH
   Trong hàm handleRequest() / switch(action) thêm:

   case 'sendOTP':
     result = await handleSendOTP(env, payload);
     break;
   case 'verifyOTP':
     result = await handleVerifyOTP(env, payload);
     break;
   case 'resetPassword':
     result = await handleResetPassword(env, payload);
     break;
   ────────────────────────────────────────────────────────── */