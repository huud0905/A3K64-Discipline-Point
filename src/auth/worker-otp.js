/* ============================================================
   A3K64 Worker — OTP handlers
   Thêm vào file worker hiện tại (api.gs / worker.js / ok.js)
   ------------------------------------------------------------
   Biến môi trường cần khai báo trong Cloudflare Dashboard:
     BREVO_API_KEY   — API key từ Brevo
     BREVO_FROM_EMAIL — Email đã verify trong Brevo (vd: gvcn@gmail.com)
     BREVO_FROM_NAME  — Tên hiển thị (vd: "Lớp 12A3 A3K64")
     TURSO_URL        — libSQL URL (https://xxx.turso.io)
     TURSO_TOKEN      — Auth token Turso
   ------------------------------------------------------------
   v2 — ĐÃ SỬA LỖI SCHEMA NGHIÊM TRỌNG so với bản gốc:
     Bản gốc đọc/ghi vào 1 bảng "users" với cột fullname/email/phone —
     bảng này KHÔNG TỒN TẠI trong DB thật (ok.js dùng 2 bảng riêng:
     "students" — hồ sơ học sinh, có phone_self/phone_father/phone_mother,
     KHÔNG có cột email; và "accounts" — tài khoản đăng nhập, cột
     "username" chính là email dùng để login, có "student_id" trỏ sang
     students.id). Nếu deploy bản gốc, sendOTP sẽ luôn báo "không tìm
     thấy tài khoản" (vì bảng users rỗng/không tồn tại), và nếu có ai đó
     lỡ tạo bảng "users" riêng thì resetPassword cũng chỉ đổi mật khẩu
     trong bảng users đó — KHÔNG đổi được accounts.password mà loginAction
     thực sự kiểm tra — người dùng "đặt lại mật khẩu" xong vẫn không đăng
     nhập được. Bản này đã trỏ lại đúng 2 bảng "students" + "accounts".
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
      id                TEXT PRIMARY KEY,
      student_id        TEXT NOT NULL,
      account_username  TEXT NOT NULL,
      otp_hash          TEXT NOT NULL,
      session_token_hash TEXT,
      attempts          INTEGER DEFAULT 0,
      verified          INTEGER DEFAULT 0,
      created_at        INTEGER NOT NULL,
      expires_at        INTEGER NOT NULL
    )
  `);
  // Index để cleanup nhanh + tra cứu theo học sinh
  await tursoQuery(env, `
    CREATE INDEX IF NOT EXISTS idx_otp_expires ON otp_sessions(expires_at)
  `);
  await tursoQuery(env, `
    CREATE INDEX IF NOT EXISTS idx_otp_student ON otp_sessions(student_id)
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

/** Hash session token bằng SHA-256 trước khi lưu DB (không lưu token gốc) */
async function hashToken(raw) {
  const buf  = new TextEncoder().encode(raw);
  const hash = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2,'0')).join('');
}

/** Mask email: nguyen.van.a@gmail.com → ng***@gmail.com */
function maskEmail(email) {
  if (!email || !email.includes('@')) return '***@***.com';
  const [local, domain] = email.split('@');
  const show = local.slice(0, Math.min(2, local.length));
  return `${show}***@${domain}`;
}

/** Tìm đúng học sinh (bảng students) khớp fullname + 1-trong-3-SĐT, rồi lấy
 *  tài khoản đăng nhập (bảng accounts, cột username chính là email) gắn với
 *  học sinh đó qua student_id. So khớp SĐT trên TOÀN BỘ học sinh trùng tên
 *  (không LIMIT 1 theo tên trước) để tránh bắt nhầm khi lớp có 2 bạn trùng
 *  họ tên nhưng khác SĐT phụ huynh. */
async function findStudentAccount(env, fullname, phone) {
  const cleanPhone = String(phone || '').replace(/[\s\-]/g, '');
  const studResult = await tursoQuery(env, `
    SELECT id, full_name, phone_self, phone_father, phone_mother
    FROM students
    WHERE LOWER(TRIM(full_name)) = LOWER(TRIM(?))
  `, [String(fullname || '').trim()]);
  const studs = tursoRows(studResult);
  if (!studs.length) return { error: 'Không tìm thấy học sinh với họ tên này.' };

  const student = studs.find(s => [s.phone_self, s.phone_father, s.phone_mother]
    .filter(Boolean)
    .map(p => String(p).replace(/[\s\-]/g, ''))
    .includes(cleanPhone));
  if (!student) return { error: 'Số điện thoại không khớp với thông tin trong hồ sơ.' };

  const acctResult = await tursoQuery(env,
    'SELECT username FROM accounts WHERE student_id = ?', [student.id]);
  const account = tursoRows(acctResult)[0];
  if (!account || !account.username) {
    return { error: 'Học sinh này chưa có tài khoản đăng nhập. Liên hệ GVCN để được hỗ trợ.' };
  }
  if (!account.username.includes('@')) {
    return { error: 'Tài khoản này chưa có email đăng nhập. Liên hệ GVCN để được hỗ trợ.' };
  }

  return { studentId: student.id, fullName: student.full_name, username: account.username };
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
   - Tìm học sinh (bảng students) + tài khoản đăng nhập (bảng accounts)
   - Tạo OTP, hash, lưu vào otp_sessions (TTL 5 phút)
   - Gửi email qua Brevo đến username (= email đăng nhập) của tài khoản
   - Trả về { ok, emailMasked }
   ────────────────────────────────────────────────────────── */
export async function handleSendOTP(env, payload) {
  const { fullname, phone } = payload || {};

  if (!fullname?.trim() || !phone?.trim()) {
    return { ok: false, error: 'Thiếu họ tên hoặc số điện thoại.' };
  }

  // ── 1. Tìm đúng học sinh + tài khoản đăng nhập (bảng students + accounts) ──
  const found = await findStudentAccount(env, fullname, phone);
  if (found.error) return { ok: false, error: found.error };
  const { studentId, fullName, username } = found;

  // ── 2. Rate limit: tối đa 3 OTP/10 phút/học sinh ──
  const tenMinAgo = Date.now() - 10 * 60 * 1000;
  const recentResult = await tursoQuery(env, `
    SELECT COUNT(*) as cnt FROM otp_sessions
    WHERE student_id = ? AND created_at > ?
  `, [studentId, String(tenMinAgo)]);

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

  // Xoá OTP cũ của học sinh này (còn hạn, chưa verify) trước khi tạo mới
  await tursoQuery(env, `
    DELETE FROM otp_sessions WHERE student_id = ? AND verified = 0
  `, [studentId]);

  // Lưu OTP mới
  await tursoQuery(env, `
    INSERT INTO otp_sessions (id, student_id, account_username, otp_hash, attempts, verified, created_at, expires_at)
    VALUES (?, ?, ?, ?, 0, 0, ?, ?)
  `, [sessionId, studentId, username, otpHash, String(now), String(expiresAt)]);

  // ── 4. Gửi email ──
  await sendBrevoEmail(env, {
    to: username,
    toName: fullName,
    subject: `[A3K64] Mã OTP đặt lại mật khẩu: ${otp}`,
    html: otpEmailHTML(otp, fullName, 5),
  });

  return {
    ok: true,
    emailMasked: maskEmail(username),
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

  const now = Date.now();

  // Xác định đúng student_id từ fullname+phone (giống bước sendOTP)
  const found = await findStudentAccount(env, fullname, phone);
  if (found.error) return { ok: false, error: found.error };
  const { studentId } = found;

  // Tìm session còn hạn, chưa verified
  const sessResult = await tursoQuery(env, `
    SELECT * FROM otp_sessions
    WHERE student_id = ? AND verified = 0 AND expires_at > ?
    ORDER BY created_at DESC
    LIMIT 1
  `, [studentId, String(now)]);

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
  const sessionTokenHash = await hashToken(sessionToken);
  // Session token có hiệu lực thêm 10 phút để bước 3 hoàn thành
  const tokenExpires = now + 10 * 60 * 1000;

  await tursoQuery(env, `
    UPDATE otp_sessions
    SET verified = 1, session_token_hash = ?, expires_at = ?
    WHERE id = ?
  `, [sessionTokenHash, String(tokenExpires), sess.id]);

  return {
    ok: true,
    sessionToken,
  };
}

/* ──────────────────────────────────────────────────────────
   ACTION: resetPassword
   payload: { fullname, phone, sessionToken, email, password }
   - Verify sessionToken còn hạn (so khớp bản hash, không lưu token gốc)
   - Cập nhật password (và username/email nếu có đổi) vào bảng accounts —
     ĐÂY MỚI LÀ BẢNG loginAction() THỰC SỰ KIỂM TRA KHI ĐĂNG NHẬP.
   - Xoá session đã dùng
   ────────────────────────────────────────────────────────── */
export async function handleResetPassword(env, payload) {
  const { fullname, phone, sessionToken, email, password } = payload || {};

  if (!fullname?.trim() || !phone?.trim() || !sessionToken || !password) {
    return { ok: false, error: 'Thiếu thông tin cập nhật.' };
  }
  if (password.length < 6) {
    return { ok: false, error: 'Mật khẩu phải có ít nhất 6 ký tự.' };
  }

  const now = Date.now();

  // ── 1. Xác định đúng học sinh + tài khoản đăng nhập ──
  const found = await findStudentAccount(env, fullname, phone);
  if (found.error) return { ok: false, error: found.error };
  const { studentId, username: currentUsername } = found;

  // ── 2. Verify session token (so khớp bản hash) ──
  const sessionTokenHash = await hashToken(sessionToken);
  const sessResult = await tursoQuery(env, `
    SELECT * FROM otp_sessions
    WHERE student_id = ? AND session_token_hash = ? AND verified = 1 AND expires_at > ?
    LIMIT 1
  `, [studentId, sessionTokenHash, String(now)]);

  const sessions = tursoRows(sessResult);
  if (!sessions.length) {
    return { ok: false, error: 'Phiên xác thực hết hạn hoặc không hợp lệ. Vui lòng bắt đầu lại.' };
  }
  const sess = sessions[0];

  // ── 3. (Tuỳ chọn) Đổi email đăng nhập ──
  // accounts KHÔNG có cột "email" riêng — "username" chính là email dùng để
  // login, nên đổi email nghĩa là đổi username. Kiểm tra trùng trước khi đổi,
  // giống hệt logic updateAccountAction trong ok.js.
  let finalUsername = currentUsername;
  if (email && email.trim() && email.trim().toLowerCase() !== currentUsername.toLowerCase()) {
    const newEmail = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) {
      return { ok: false, error: 'Địa chỉ email mới không hợp lệ.' };
    }
    const takenResult = await tursoQuery(env,
      'SELECT username FROM accounts WHERE LOWER(username) = ? AND username != ?',
      [newEmail, currentUsername]);
    if (tursoRows(takenResult).length) {
      return { ok: false, error: 'Email này đã được dùng cho tài khoản khác.' };
    }
    await tursoQuery(env, 'UPDATE accounts SET username = ? WHERE username = ?',
      [newEmail, currentUsername]);
    finalUsername = newEmail;
  }

  // ── 4. Cập nhật mật khẩu ──
  // ⚠ CẢNH BÁO: hệ thống (ok.js loginAction) HIỆN ĐANG so sánh mật khẩu dạng
  // PLAINTEXT (không hash) — nên ở đây bắt buộc lưu plaintext để khớp, nếu
  // không người dùng reset xong sẽ KHÔNG BAO GIỜ đăng nhập lại được. Đây là
  // rủi ro bảo mật riêng, có thật, nhưng phải sửa ĐỒNG BỘ cả loginAction +
  // migrate toàn bộ password cũ trong DB — ngoài phạm vi file này. Xem phần
  // trả lời kèm theo để biết thêm.
  await tursoQuery(env,
    'UPDATE accounts SET password = ? WHERE username = ?',
    [password, finalUsername]);

  // ── 5. Xoá session đã dùng ──
  await tursoQuery(env, `DELETE FROM otp_sessions WHERE id = ?`, [sess.id]);

  // ── 6. Cleanup OTP cũ đã hết hạn (housekeeping) ──
  await tursoQuery(env, `DELETE FROM otp_sessions WHERE expires_at < ?`, [String(now)]).catch(() => {});

  return { ok: true, username: finalUsername };
}

/* ──────────────────────────────────────────────────────────
   HASH PASSWORD — HIỆN KHÔNG ĐƯỢC GỌI Ở ĐÂU TRONG FILE NÀY.
   Giữ lại để dùng SAU KHI migrate accounts.password sang dạng hash (xem
   cảnh báo ở handleResetPassword). Nếu dùng bcrypt thay vì SHA-256, đổi
   bằng: import { hash } from 'bcryptjs'.
   ────────────────────────────────────────────────────────── */
async function hashPassword(password) {
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