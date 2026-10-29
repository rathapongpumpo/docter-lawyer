"""
Doctor Lawyer - Authentication & User Quota Service
Handles:
1. Member verification via Google Account (instant verified) or Email (6-digit OTP verification)
2. Member Free Quota: 3 free queries per verified user
3. Guest Trial Quota: 1 free query for unregistered guests
4. Persistent SQLite storage for users, sessions, and guest records
"""

import os
import re
import time
import secrets
import sqlite3
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from pathlib import Path
from typing import Dict, Any, Tuple, Optional
from contextlib import contextmanager


class AuthService:
    """
    Manages user authentication, email OTP verification, and tier quotas.
    """

    def __init__(self, db_path: Optional[str] = None):
        if db_path:
            self.db_path = Path(db_path)
        else:
            data_dir = Path(__file__).resolve().parent.parent / "data"
            data_dir.mkdir(parents=True, exist_ok=True)
            self.db_path = data_dir / "doctor_lawyer.db"

        # SMTP Configuration (optional)
        self.smtp_host = os.environ.get("SMTP_HOST", "").strip()
        self.smtp_port = int(os.environ.get("SMTP_PORT", 587))
        self.smtp_user = os.environ.get("SMTP_USER", "").strip()
        self.smtp_password = os.environ.get("SMTP_PASSWORD", "").strip()
        self.smtp_from = os.environ.get("SMTP_FROM", "Doctor Lawyer <no-reply@doctorlawyer.ai>").strip()
        self.google_client_id = os.environ.get("GOOGLE_CLIENT_ID", "").strip()

        self._init_db()

    @contextmanager
    def _get_connection(self):
        conn = sqlite3.connect(str(self.db_path))
        conn.row_factory = sqlite3.Row
        try:
            yield conn
        finally:
            conn.close()

    def _init_db(self):
        """Initializes database tables if they do not exist."""
        with self._get_connection() as conn:
            cursor = conn.cursor()

            # Users table
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS users (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    email TEXT UNIQUE NOT NULL,
                    name TEXT,
                    auth_provider TEXT DEFAULT 'email',
                    is_verified INTEGER DEFAULT 0,
                    verification_code TEXT,
                    code_expires_at REAL,
                    free_quota INTEGER DEFAULT 3,
                    quota_used INTEGER DEFAULT 0,
                    created_at REAL NOT NULL,
                    last_login_at REAL
                )
            """)

            # Sessions table
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS sessions (
                    token TEXT PRIMARY KEY,
                    user_id INTEGER NOT NULL,
                    expires_at REAL NOT NULL,
                    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
                )
            """)

            # Guest sessions table (1 free trial query)
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS guest_sessions (
                    guest_id TEXT PRIMARY KEY,
                    quota_used INTEGER DEFAULT 0,
                    max_quota INTEGER DEFAULT 1,
                    created_at REAL NOT NULL,
                    last_active_at REAL NOT NULL,
                    ip_address TEXT
                )
            """)

            conn.commit()

    # -------------------------------------------------------------
    # Guest Quota Handling (1 Free Trial Query)
    # -------------------------------------------------------------
    def get_or_create_guest(self, guest_id: str, ip: str = "127.0.0.1") -> Dict[str, Any]:
        """Retrieves or registers a guest session with a 1-query limit."""
        if not guest_id:
            guest_id = f"guest_{secrets.token_hex(12)}"

        now = time.time()
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM guest_sessions WHERE guest_id = ?", (guest_id,))
            row = cursor.fetchone()

            if not row:
                cursor.execute("""
                    INSERT INTO guest_sessions (guest_id, quota_used, max_quota, created_at, last_active_at, ip_address)
                    VALUES (?, 0, 1, ?, ?, ?)
                """, (guest_id, now, now, ip))
                conn.commit()
                return {
                    "guest_id": guest_id,
                    "is_guest": True,
                    "quota_used": 0,
                    "max_quota": 1,
                    "remaining": 1
                }
            else:
                cursor.execute("""
                    UPDATE guest_sessions SET last_active_at = ?, ip_address = ? WHERE guest_id = ?
                """, (now, ip, guest_id))
                conn.commit()
                quota_used = row["quota_used"]
                max_quota = row["max_quota"]
                return {
                    "guest_id": guest_id,
                    "is_guest": True,
                    "quota_used": quota_used,
                    "max_quota": max_quota,
                    "remaining": max(0, max_quota - quota_used)
                }

    def consume_guest_quota(self, guest_id: str) -> Tuple[bool, int]:
        """
        Consumes 1 quota credit for guest.
        Returns: (success, remaining)
        """
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM guest_sessions WHERE guest_id = ?", (guest_id,))
            row = cursor.fetchone()

            if not row:
                return False, 0

            quota_used = row["quota_used"]
            max_quota = row["max_quota"]

            if quota_used >= max_quota:
                return False, 0

            new_used = quota_used + 1
            cursor.execute("UPDATE guest_sessions SET quota_used = ? WHERE guest_id = ?", (new_used, guest_id))
            conn.commit()
            return True, max(0, max_quota - new_used)

    # -------------------------------------------------------------
    # Email OTP Registration & Verification (3 Free Queries)
    # -------------------------------------------------------------
    def request_email_otp(self, email: str, name: str = "") -> Dict[str, Any]:
        """
        Generates a 6-digit OTP and sends it to the user's email address.
        Prevents fake emails by requiring OTP verification before account activation.
        """
        clean_email = email.strip().lower()
        if not re.match(r"^[^@]+@[^@]+\.[^@]+$", clean_email):
            return {"success": False, "error": "รูปแบบอีเมลไม่ถูกต้อง"}

        # Generate 6-digit numeric OTP (e.g. 100000 - 999999)
        otp = str(secrets.randbelow(900000) + 100000)
        expires_at = time.time() + 900  # 15 minutes
        now = time.time()

        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM users WHERE email = ?", (clean_email,))
            existing = cursor.fetchone()

            if existing:
                # Update OTP
                cursor.execute("""
                    UPDATE users 
                    SET verification_code = ?, code_expires_at = ?, name = COALESCE(NULLIF(?, ''), name)
                    WHERE email = ?
                """, (otp, expires_at, name.strip(), clean_email))
            else:
                # Create unverified user
                cursor.execute("""
                    INSERT INTO users (email, name, auth_provider, is_verified, verification_code, code_expires_at, free_quota, quota_used, created_at)
                    VALUES (?, ?, 'email', 0, ?, ?, 3, 0, ?)
                """, (clean_email, name.strip() or clean_email.split("@")[0], otp, expires_at, now))

            conn.commit()

        # Send email via SMTP or fallback to demo log
        email_sent = self._send_otp_email(clean_email, otp)

        response = {
            "success": True,
            "message": f"ระบบได้ส่งรหัสยืนยัน OTP 6 หลัก ไปที่ {clean_email} แล้ว (มีอายุ 15 นาที)",
            "email": clean_email,
            "email_sent": email_sent
        }

        # If SMTP is not set up, surface the OTP in response for seamless client demos
        if not self.smtp_host or not self.smtp_user:
            response["demo_otp"] = otp
            response["notice"] = "⚡ [Demo Mode] แสดงรหัส OTP สำหรับทดสอบทันที (สามารถต่อ SMTP ใน .env สำหรับส่งเมลจริง)"

        print(f"📧 [Doctor Lawyer Auth] OTP for {clean_email}: {otp} (Expires in 15 mins)", flush=True)
        return response

    def verify_email_otp(self, email: str, otp: str) -> Tuple[bool, str, Optional[Dict[str, Any]]]:
        """
        Verifies the 6-digit OTP code.
        Activates user and grants 3 free queries.
        """
        clean_email = email.strip().lower()
        clean_otp = otp.strip()
        now = time.time()

        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM users WHERE email = ?", (clean_email,))
            user = cursor.fetchone()

            if not user:
                return False, "ไม่พบอีเมลนี้ในระบบ กรุณากรอกอีเมลเพื่อขอรับรหัส OTP ก่อน", None

            if not user["verification_code"]:
                return False, "รหัส OTP หมดอายุหรือถูกใช้งานแล้ว กรุณากดขอรหัสใหม่", None

            if now > user["code_expires_at"]:
                return False, "รหัส OTP หมดอายุแล้ว (เกิน 15 นาที) กรุณากดขอรหัสใหม่", None

            if user["verification_code"] != clean_otp:
                return False, "รหัส OTP ไม่ถูกต้อง กรุณาตรวจสอบรหัส 6 หลักอีกครั้ง", None

            # Mark user as verified and clear OTP
            cursor.execute("""
                UPDATE users 
                SET is_verified = 1, verification_code = NULL, code_expires_at = NULL, last_login_at = ?
                WHERE id = ?
            """, (now, user["id"]))

            # Create session token (valid for 30 days)
            token = secrets.token_hex(24)
            expires_at = now + (30 * 86400)
            cursor.execute("""
                INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)
            """, (token, user["id"], expires_at))

            conn.commit()

            user_data = {
                "id": user["id"],
                "email": user["email"],
                "name": user["name"] or user["email"].split("@")[0],
                "auth_provider": "email",
                "is_verified": True,
                "free_quota": user["free_quota"],
                "quota_used": user["quota_used"],
                "remaining": max(0, user["free_quota"] - user["quota_used"]),
                "session_token": token
            }
            return True, "ยืนยันตัวตนสำเร็จ! ได้รับสิทธิ์ปรึกษาฟรี 3 ครั้ง", user_data

    # -------------------------------------------------------------
    # Google Account Sign-In (Instant Verified, 3 Free Queries)
    # -------------------------------------------------------------
    def sign_in_with_google(self, email: str, name: str = "", google_sub: str = "") -> Tuple[bool, str, Dict[str, Any]]:
        """
        Signs in or registers via Google Account.
        Google accounts are inherently verified by Google, granting instant 3 free queries.
        """
        clean_email = email.strip().lower()
        if not re.match(r"^[^@]+@[^@]+\.[^@]+$", clean_email):
            return False, "อีเมล Google ไม่ถูกต้อง", {}

        now = time.time()
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM users WHERE email = ?", (clean_email,))
            user = cursor.fetchone()

            if user:
                user_id = user["id"]
                cursor.execute("""
                    UPDATE users 
                    SET is_verified = 1, auth_provider = 'google', name = COALESCE(NULLIF(?, ''), name), last_login_at = ?
                    WHERE id = ?
                """, (name.strip(), now, user_id))
                free_quota = user["free_quota"]
                quota_used = user["quota_used"]
            else:
                cursor.execute("""
                    INSERT INTO users (email, name, auth_provider, is_verified, free_quota, quota_used, created_at, last_login_at)
                    VALUES (?, ?, 'google', 1, 3, 0, ?, ?)
                """, (clean_email, name.strip() or clean_email.split("@")[0], now, now))
                user_id = cursor.lastrowid
                free_quota = 3
                quota_used = 0

            # Create session
            token = secrets.token_hex(24)
            expires_at = now + (30 * 86400)
            cursor.execute("""
                INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)
            """, (token, user_id, expires_at))

            conn.commit()

            user_data = {
                "id": user_id,
                "email": clean_email,
                "name": name.strip() or clean_email.split("@")[0],
                "auth_provider": "google",
                "is_verified": True,
                "free_quota": free_quota,
                "quota_used": quota_used,
                "remaining": max(0, free_quota - quota_used),
                "session_token": token
            }
            return True, "เข้าสู่ระบบด้วย Google สำเร็จ! ได้รับสิทธิ์ปรึกษาฟรี 3 ครั้ง", user_data

    # -------------------------------------------------------------
    # Session & User Quota Check / Consume
    # -------------------------------------------------------------
    def get_user_by_session(self, token: str) -> Optional[Dict[str, Any]]:
        """Resolves active user session."""
        if not token:
            return None

        now = time.time()
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                SELECT u.* FROM users u
                JOIN sessions s ON u.id = s.user_id
                WHERE s.token = ? AND s.expires_at > ?
            """, (token.strip(), now))
            row = cursor.fetchone()

            if not row:
                return None

            return {
                "id": row["id"],
                "email": row["email"],
                "name": row["name"],
                "auth_provider": row["auth_provider"],
                "is_verified": bool(row["is_verified"]),
                "free_quota": row["free_quota"],
                "quota_used": row["quota_used"],
                "remaining": max(0, row["free_quota"] - row["quota_used"])
            }

    def consume_user_quota(self, user_id: int) -> Tuple[bool, int, int]:
        """
        Consumes 1 consultation credit for a registered verified user.
        Returns: (success, remaining, limit)
        """
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT free_quota, quota_used, is_verified FROM users WHERE id = ?", (user_id,))
            user = cursor.fetchone()

            if not user or not user["is_verified"]:
                return False, 0, 3

            free_quota = user["free_quota"]
            quota_used = user["quota_used"]

            if quota_used >= free_quota:
                return False, 0, free_quota

            new_used = quota_used + 1
            cursor.execute("UPDATE users SET quota_used = ? WHERE id = ?", (new_used, user_id))
            conn.commit()
            return True, max(0, free_quota - new_used), free_quota

    # -------------------------------------------------------------
    # Email Delivery Helper
    # -------------------------------------------------------------
    def _send_otp_email(self, to_email: str, otp: str) -> bool:
        """Sends OTP verification email via SMTP if configured."""
        if not self.smtp_host or not self.smtp_user or not self.smtp_password:
            return False

        try:
            msg = MIMEMultipart("alternative")
            msg["Subject"] = f"รหัสยืนยันตัวตนของคุณคือ {otp} — ดอกเตอร์ลอว์เยอร์ (Doctor Lawyer)"
            msg["From"] = self.smtp_from
            msg["To"] = to_email

            html_body = f"""
            <div style="font-family: 'Helvetica Neue', Arial, sans-serif; max-width: 520px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 16px; background-color: #ffffff;">
                <div style="text-align: center; margin-bottom: 24px;">
                    <h2 style="color: #0b2a4a; margin: 0 0 6px 0;">ดอกเตอร์ลอว์เยอร์ (Doctor Lawyer)</h2>
                    <p style="color: #64748b; font-size: 14px; margin: 0;">AI Legal Assistant & Partner Lawyer Network</p>
                </div>
                <div style="background-color: #f8fafc; border-radius: 12px; padding: 20px; text-align: center; margin-bottom: 20px;">
                    <p style="color: #334155; font-size: 15px; margin: 0 0 12px 0;">รหัสยืนยันตัวตน (OTP) ของคุณคือ:</p>
                    <div style="font-size: 34px; font-weight: 700; letter-spacing: 6px; color: #0066cc; margin: 10px 0;">{otp}</div>
                    <p style="color: #64748b; font-size: 13px; margin: 12px 0 0 0;">รหัสนี้มีอายุการใช้งาน 15 นาที</p>
                </div>
                <p style="color: #475569; font-size: 14px; line-height: 1.6; margin-bottom: 20px;">
                    เมื่อยืนยันอีเมลเรียบร้อยแล้ว ท่านจะได้รับสิทธิ์ปรึกษาข้อกฎหมายฟรี <b>3 ครั้ง</b> พร้อมระบบวิเคราะห์ความเร่งด่วนและส่งต่อทนายความพาร์ตเนอร์
                </p>
                <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;">
                <p style="color: #94a3b8; font-size: 12px; text-align: center; margin: 0;">
                    หากท่านไม่ได้เป็นผู้ทำรายการนี้ กรุณาเพิกเฉยต่ออีเมลฉบับนี้
                </p>
            </div>
            """
            msg.attach(MIMEText(html_body, "html", "utf-8"))

            with smtplib.SMTP(self.smtp_host, self.smtp_port, timeout=10) as server:
                server.starttls()
                server.login(self.smtp_user, self.smtp_password)
                server.sendmail(self.smtp_from, [to_email], msg.as_string())

            print(f"✅ [Doctor Lawyer Auth] OTP email delivered to {to_email}", flush=True)
            return True
        except Exception as e:
            print(f"⚠️ [Doctor Lawyer Auth] Failed to deliver SMTP email: {e}", flush=True)
            return False
