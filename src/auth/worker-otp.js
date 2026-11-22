/* ============================================================
   A3K64 Worker — OTP handlers
   Thêm vào file worker hiện tại (api.gs / worker.js / ok.js)
   ------------------------------------------------------------
   Biến môi trường cần khai báo trong Cloudflare Dashboard:
     BREVO_API_KEY              — API key từ Brevo
     BREVO_FROM_EMAIL           — Email đã verify trong Brevo (vd: gvcn@gmail.com)
     BREVO_FROM_NAME            — Tên hiển thị (vd: "Lớp 12A3 A3K64")
     TURSO_DATABASE_URL / TURSO_URL     — libSQL URL (https://xxx.turso.io)
     TURSO_AUTH_TOKEN / TURSO_TOKEN     — Auth token Turso
     CLASS_ORIGIN / GITHUB_PAGES_ORIGIN / CUSTOM_DOMAIN /
     CORS_ALLOWED_ORIGINS / ALLOWED_ORIGINS — Whitelist CORS (cách nhau dấu phẩy)
   ------------------------------------------------------------
   v3 — Siết chặt CORS whitelist & chuẩn hóa HTTP Status Codes (401/403/429)
*/

/* ──────────────────────────────────────────────────────────
   CORS WHITELIST & HTTP RESPONSE HELPERS
   ────────────────────────────────────────────────────────── */
function normalizeOrigin(origin) {
  const s = String(origin || '').trim().replace(/\/$/, '');
  if (!s) return '';
  try { return new URL(s).origin.toLowerCase(); } catch (_) { return s.toLowerCase(); }
}

export function isOriginAllowed(origin, env = {}) {
  const norm = normalizeOrigin(origin);
  if (!norm) return false;
  // Dev local: http(s)://localhost:* hoặc http(s)://127.0.0.1:*
  if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(norm)) return true;
  // GitHub Pages của A3K64 (*.github.io) & Custom domain (a3k64.pages.dev)
  if (/^https:\/\/[a-z0-9-]+\.github\.io$/.test(norm)) return true;
  if (/^https:\/\/([a-z0-9-]+\.)?a3k64\.pages\.dev$/.test(norm)) return true;

  const allowed = new Set();
  const add = (val) => {
    const o = normalizeOrigin(val);
    if (o) allowed.add(o);
  };

  add(env.CLASS_ORIGIN);
  add(env.GITHUB_PAGES_ORIGIN);
  add(env.CUSTOM_DOMAIN);
  for (const item of String(env.CORS_ALLOWED_ORIGINS || env.ALLOWED_ORIGINS || '').split(/[\s,;]+/)) {
    add(item);
  }
  return allowed.has(norm);
}

export function getCorsHeaders(request, env = {}, extra = {}) {
  const rawOrigin = String(request?.headers?.get('Origin') || '').trim().replace(/\/$/, '');
  const headers = { ...extra };
  if (rawOrigin && isOriginAllowed(rawOrigin, env)) {
    headers['Access-Control-Allow-Origin'] = rawOrigin;
    headers['Vary'] = 'Origin';
    headers['Access-Control-Allow-Credentials'] = 'true';
  }
  return headers;
}

export function otpJsonResponse(payload, status = 200, request = null, env = {}) {
  const body = { ...payload };
  delete body.httpStatus;
  return new Response(JSON.stringify(body), {
    status,
    headers: getCorsHeaders(request, env, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    }),
  });
}

/* ──────────────────────────────────────────────────────────
   TURSO HELPER — gọi HTTP API của Turso (libSQL)
   ────────────────────────────────────────────────────────── */
async function tursoQuery(env, sql, args = []) {
  const dbUrl = String(env.TURSO_DATABASE_URL || env.TURSO_URL || '').replace(/\/$/, '');
  const dbToken = String(env.TURSO_AUTH_TOKEN || env.TURSO_TOKEN || '');
  if (!dbUrl || !dbToken) {
    throw new Error('Thiếu biến môi trường Turso (TURSO_DATABASE_URL / TURSO_AUTH_TOKEN).');
  }

  const res = await fetch(`${dbUrl}/v2/pipeline`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${dbToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      requests: [
        {
          type: 'execute',
          stmt: {
            sql,
            args: args.map(v => (v === null || v === undefined
              ? { type: 'null' }
              : { type: 'text', value: String(v) })),
          },
        },
        { type: 'close' },
      ],
    }),
  });
  if (!res.ok) throw new Error(`Turso HTTP ${res.status}`);
  const data = await res.json();
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
      id                 TEXT PRIMARY KEY,
      student_id         TEXT NOT NULL,
      account_username   TEXT NOT NULL,
      otp_hash           TEXT NOT NULL,
      session_token_hash TEXT,
      attempts           INTEGER DEFAULT 0,
      verified           INTEGER DEFAULT 0,
      created_at         INTEGER NOT NULL,
      expires_at         INTEGER NOT NULL
    )
  `);
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
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}

/** Tạo session token ngẫu nhiên 32 bytes hex */
function generateToken() {
  const arr = new Uint8Array(32);
  crypto.getRandomValues(arr);
  return Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');
}

/** Hash session token bằng SHA-256 trước khi lưu DB (không lưu token gốc) */
async function hashToken(raw) {
  const buf  = new TextEncoder().encode(raw);
  const hash = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}

/** Băm mật khẩu chuẩn Web Crypto PBKDF2-HMAC-SHA256 (100,000 vòng) kèm salt: pbkdf2$<salt>$<hash> */
async function hashPassword(plain, salt) {
  const rawSalt = salt || Array.from(
    crypto.getRandomValues(new Uint8Array(16)),
    b => b.toString(16).padStart(2, '0')
  ).join('');
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(String(plain)),
    'PBKDF2',
    false,
    ['deriveBits']
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: enc.encode(rawSalt),
      iterations: 100000,
      hash: 'SHA-256',
    },
    keyMaterial,
    256
  );
  const hashHex = Array.from(new Uint8Array(bits), b => b.toString(16).padStart(2, '0')).join('');
  return `pbkdf2$${rawSalt}$${hashHex}`;
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
 *  học sinh đó qua student_id. */
async function findStudentAccount(env, fullname, phone) {
  const cleanPhone = String(phone || '').replace(/[\s\-]/g, '');
  const studResult = await tursoQuery(env, `
    SELECT id, full_name, phone_self, phone_father, phone_mother
    FROM students
    WHERE LOWER(TRIM(full_name)) = LOWER(TRIM(?))
  `, [String(fullname || '').trim()]);
  const studs = tursoRows(studResult);
  if (!studs.length) return { error: 'Thông tin xác minh không khớp hoặc học sinh chưa có tài khoản đăng nhập.', httpStatus: 400 };

  const student = studs.find(s => [s.phone_self, s.phone_father, s.phone_mother]
    .filter(Boolean)
    .map(p => String(p).replace(/[\s\-]/g, ''))
    .includes(cleanPhone));
  if (!student) return { error: 'Thông tin xác minh không khớp hoặc học sinh chưa có tài khoản đăng nhập.', httpStatus: 400 };

  const acctResult = await tursoQuery(env,
    'SELECT username FROM accounts WHERE student_id = ?', [student.id]);
  const account = tursoRows(acctResult)[0];
  if (!account || !account.username || !account.username.includes('@')) {
    return { error: 'Thông tin xác minh không khớp hoặc học sinh chưa có email đăng nhập. Liên hệ GVCN để được hỗ trợ.', httpStatus: 400 };
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
   ────────────────────────────────────────────────────────── */
export async function handleSendOTP(env, payload) {
  const { fullname, phone } = payload || {};

  if (!fullname?.trim() || !phone?.trim()) {
    return { ok: false, error: 'Thiếu họ tên hoặc số điện thoại.', httpStatus: 400 };
  }

  // ── 1. Tìm đúng học sinh + tài khoản đăng nhập ──
  const found = await findStudentAccount(env, fullname, phone);
  if (found.error) return { ok: false, error: found.error, httpStatus: found.httpStatus || 400 };
  const { studentId, fullName, username } = found;

  // ── 2. Rate limit: tối đa 3 OTP/10 phút/học sinh -> 429 Too Many Requests ──
  const now       = Date.now();
  const tenMinAgo = now - 10 * 60 * 1000;
  const recentResult = await tursoQuery(env, `
    SELECT COUNT(*) as cnt FROM otp_sessions
    WHERE student_id = ? AND created_at > ?
  `, [studentId, String(tenMinAgo)]);

  const recentCount = parseInt(tursoRows(recentResult)[0]?.cnt ?? '0', 10);
  if (recentCount >= 3) {
    return { ok: false, error: 'Bạn đã gửi quá nhiều yêu cầu OTP. Vui lòng thử lại sau 10 phút.', httpStatus: 429 };
  }

  // ── 3. Tạo OTP ──
  const otp       = generateOTP();
  const otpHash   = await hashOTP(otp);
  const sessionId = generateToken();
  const expiresAt = now + 5 * 60 * 1000; // 5 phút

  await tursoQuery(env, `
    UPDATE otp_sessions
    SET verified = -1, expires_at = 0
    WHERE student_id = ? AND verified = 0 AND expires_at > ?
  `, [studentId, String(now)]);

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
    httpStatus: 200,
  };
}

/* ──────────────────────────────────────────────────────────
   ACTION: verifyOTP
   payload: { fullname, phone, otp }
   ────────────────────────────────────────────────────────── */
export async function handleVerifyOTP(env, payload) {
  const { fullname, phone, otp } = payload || {};

  if (!fullname?.trim() || !phone?.trim() || !otp?.trim()) {
    return { ok: false, error: 'Thiếu thông tin xác minh.', httpStatus: 400 };
  }

  const now = Date.now();

  const found = await findStudentAccount(env, fullname, phone);
  if (found.error) return { ok: false, error: found.error, httpStatus: found.httpStatus || 400 };
  const { studentId } = found;

  const sessResult = await tursoQuery(env, `
    SELECT * FROM otp_sessions
    WHERE student_id = ? AND verified = 0 AND expires_at > ?
    ORDER BY created_at DESC
    LIMIT 1
  `, [studentId, String(now)]);

  const sessions = tursoRows(sessResult);
  if (!sessions.length) {
    return { ok: false, error: 'Mã OTP đã hết hạn hoặc không tồn tại. Vui lòng yêu cầu mã mới.', httpStatus: 401 };
  }

  const sess = sessions[0];

  // Kiểm tra số lần sai -> 429 Too Many Requests
  if (parseInt(sess.attempts, 10) >= 5) {
    return { ok: false, error: 'Đã nhập sai quá 5 lần. Vui lòng yêu cầu mã OTP mới.', httpStatus: 429 };
  }

  // Tăng attempts nguyên tử ở DB trước khi so mã (chống race condition)
  const incResult = await tursoQuery(env, `
    UPDATE otp_sessions
    SET attempts = attempts + 1
    WHERE id = ? AND attempts < 5
    RETURNING attempts
  `, [sess.id]);
  const incRows = tursoRows(incResult);
  if (!incRows.length) {
    return { ok: false, error: 'Đã nhập sai quá 5 lần. Vui lòng yêu cầu mã OTP mới.', httpStatus: 429 };
  }
  const newAttempts = parseInt(incRows[0].attempts, 10);

  const inputHash = await hashOTP(otp.trim());
  if (inputHash !== sess.otp_hash) {
    const remaining = Math.max(0, 5 - newAttempts);
    return { ok: false, error: `Mã OTP không đúng. Còn ${remaining} lần thử.`, httpStatus: 401 };
  }

  // ── OTP đúng: tạo sessionToken, đánh dấu verified ──
  const sessionToken = generateToken();
  const sessionTokenHash = await hashToken(sessionToken);
  const tokenExpires = now + 10 * 60 * 1000;

  await tursoQuery(env, `
    UPDATE otp_sessions
    SET verified = 1, session_token_hash = ?, expires_at = ?
    WHERE id = ?
  `, [sessionTokenHash, String(tokenExpires), sess.id]);

  return {
    ok: true,
    sessionToken,
    httpStatus: 200,
  };
}

/* ──────────────────────────────────────────────────────────
   ACTION: resetPassword
   payload: { fullname, phone, sessionToken, email, password }
   ────────────────────────────────────────────────────────── */
export async function handleResetPassword(env, payload) {
  const { fullname, phone, sessionToken, email, password } = payload || {};

  if (!sessionToken) {
    return { ok: false, error: 'Thiếu token xác thực OTP.', httpStatus: 401 };
  }
  if (!fullname?.trim() || !phone?.trim() || !password) {
    return { ok: false, error: 'Thiếu thông tin cập nhật.', httpStatus: 400 };
  }
  if (password.length < 6) {
    return { ok: false, error: 'Mật khẩu phải có ít nhất 6 ký tự.', httpStatus: 400 };
  }

  const now = Date.now();

  // ── 1. Xác định đúng học sinh + tài khoản đăng nhập ──
  const found = await findStudentAccount(env, fullname, phone);
  if (found.error) return { ok: false, error: found.error, httpStatus: found.httpStatus || 400 };
  const { studentId, username: currentUsername } = found;

  // ── 2. Verify session token -> 401 nếu không hợp lệ / hết hạn ──
  const sessionTokenHash = await hashToken(sessionToken);
  const sessResult = await tursoQuery(env, `
    SELECT * FROM otp_sessions
    WHERE student_id = ? AND session_token_hash = ? AND verified = 1 AND expires_at > ?
    LIMIT 1
  `, [studentId, sessionTokenHash, String(now)]);

  const sessions = tursoRows(sessResult);
  if (!sessions.length) {
    return { ok: false, error: 'Phiên xác thực hết hạn hoặc không hợp lệ. Vui lòng bắt đầu lại.', httpStatus: 401 };
  }
  const sess = sessions[0];

  // ── 3. (Tuỳ chọn) Đổi email đăng nhập ──
  let finalUsername = currentUsername;
  if (email && email.trim() && email.trim().toLowerCase() !== currentUsername.toLowerCase()) {
    const newEmail = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) {
      return { ok: false, error: 'Địa chỉ email mới không hợp lệ.', httpStatus: 400 };
    }
    const takenResult = await tursoQuery(env,
      'SELECT username FROM accounts WHERE LOWER(username) = ? AND username != ?',
      [newEmail, currentUsername]);
    if (tursoRows(takenResult).length) {
      return { ok: false, error: 'Email này đã được dùng cho tài khoản khác.', httpStatus: 400 };
    }
    await tursoQuery(env, 'UPDATE accounts SET username = ? WHERE username = ?',
      [newEmail, currentUsername]);
    finalUsername = newEmail;
  }

  // ── 4. Băm mật khẩu PBKDF2-SHA256 kèm salt & cập nhật vào accounts ──
  const hashedPassword = await hashPassword(password);
  await tursoQuery(env,
    'UPDATE accounts SET password = ? WHERE username = ?',
    [hashedPassword, finalUsername]);

  // Thu hồi các phiên đăng nhập cũ (nếu bảng sessions tồn tại)
  await tursoQuery(env,
    'UPDATE sessions SET revoked = 1 WHERE LOWER(username) = ? AND revoked = 0',
    [finalUsername.toLowerCase()]).catch(() => {});

  // ── 5. Đánh dấu session OTP đã sử dụng ──
  await tursoQuery(env,
    `UPDATE otp_sessions SET verified = 2, session_token_hash = NULL, expires_at = 0 WHERE id = ?`,
    [sess.id]);

  // ── 6. Cleanup OTP cũ ──
  const cleanupCutoff = now - 15 * 60 * 1000;
  await tursoQuery(env,
    `DELETE FROM otp_sessions WHERE expires_at < ? AND created_at < ?`,
    [String(now), String(cleanupCutoff)]).catch(() => {});

  return { ok: true, username: finalUsername, httpStatus: 200 };
}

/* ──────────────────────────────────────────────────────────
   HTTP ROUTER (dùng khi mount độc lập hoặc chuyển tiếp từ Worker)
   ────────────────────────────────────────────────────────── */
export async function handleOTPRequest(request, env) {
  const rawOrigin = String(request.headers.get('Origin') || '').trim().replace(/\/$/, '');

  if (request.method === 'OPTIONS') {
    if (rawOrigin && !isOriginAllowed(rawOrigin, env)) {
      return otpJsonResponse({ ok: false, error: 'Origin không được phép.' }, 403, request, env);
    }
    return new Response(null, {
      status: 204,
      headers: getCorsHeaders(request, env, {
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Max-Age': '86400',
      }),
    });
  }

  if (rawOrigin && !isOriginAllowed(rawOrigin, env)) {
    return otpJsonResponse({ ok: false, error: 'Origin không được phép.' }, 403, request, env);
  }

  if (request.method !== 'POST') {
    return otpJsonResponse({ ok: false, error: 'Method not allowed.' }, 405, request, env);
  }

  let body;
  try {
    body = await request.json();
  } catch (_) {
    return otpJsonResponse({ ok: false, error: 'Payload JSON không hợp lệ.' }, 400, request, env);
  }

  const action = String(body?.action || '').trim();
  const payload = (body?.payload && typeof body.payload === 'object') ? body.payload : body;

  try {
    let result;
    switch (action) {
      case 'sendOTP':
        result = await handleSendOTP(env, payload);
        break;
      case 'verifyOTP':
        result = await handleVerifyOTP(env, payload);
        break;
      case 'resetPassword':
        result = await handleResetPassword(env, payload);
        break;
      default:
        return otpJsonResponse({ ok: false, error: 'Unknown action.' }, 400, request, env);
    }
    const status = result?.httpStatus || (result?.ok ? 200 : 400);
    return otpJsonResponse(result, status, request, env);
  } catch (err) {
    return otpJsonResponse({ ok: false, error: String(err?.message || 'Lỗi máy chủ OTP.') }, 500, request, env);
  }
}

export default {
  async fetch(request, env) {
    return handleOTPRequest(request, env);
  },
};
