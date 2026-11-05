"""
Unit tests for AuthService.
Tests Guest 1-query limit, Email OTP verification, Google sign-in, and Member 3-query limit.
"""

import unittest
import os
import tempfile
from pathlib import Path
from backend.src.services.auth_service import AuthService


class TestAuthService(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.db_path = Path(self.temp_dir.name) / "test_auth.db"
        self.auth = AuthService(db_path=str(self.db_path))

    def tearDown(self):
        self.temp_dir.cleanup()

    def test_guest_quota_one_time_limit(self):
        # 1. New guest has 1 remaining
        guest = self.auth.get_or_create_guest("guest_test_001")
        self.assertEqual(guest["remaining"], 1)
        self.assertEqual(guest["max_quota"], 1)

        # 2. 1st consume succeeds
        success, remaining = self.auth.consume_guest_quota("guest_test_001")
        self.assertTrue(success)
        self.assertEqual(remaining, 0)

        # 3. 2nd consume fails (Guest limit is 1)
        success, remaining = self.auth.consume_guest_quota("guest_test_001")
        self.assertFalse(success)
        self.assertEqual(remaining, 0)

    def test_email_registration_and_otp_verification(self):
        email = "somchai.test@example.com"

        # 1. Request OTP
        req_res = self.auth.request_email_otp(email, name="สมชาย ใจดี")
        self.assertTrue(req_res["success"])
        self.assertIn("demo_otp", req_res)
        otp = req_res["demo_otp"]
        self.assertEqual(len(otp), 6)

        # 2. Verify with wrong OTP -> Fails
        ok, msg, _ = self.auth.verify_email_otp(email, "000000")
        self.assertFalse(ok)
        self.assertIn("ไม่ถูกต้อง", msg)

        # 3. Verify with correct OTP -> Succeeds
        ok, msg, user_data = self.auth.verify_email_otp(email, otp)
        self.assertTrue(ok)
        self.assertTrue(user_data["is_verified"])
        self.assertEqual(user_data["free_quota"], 3)
        self.assertEqual(user_data["remaining"], 3)
        self.assertIsNotNone(user_data["session_token"])

        # 4. Check session token lookup
        session_user = self.auth.get_user_by_session(user_data["session_token"])
        self.assertIsNotNone(session_user)
        self.assertEqual(session_user["email"], email)

        # 5. Member 3-query limit test:
        user_id = user_data["id"]
        # Query 1
        ok, rem, _ = self.auth.consume_user_quota(user_id)
        self.assertTrue(ok)
        self.assertEqual(rem, 2)
        # Query 2
        ok, rem, _ = self.auth.consume_user_quota(user_id)
        self.assertTrue(ok)
        self.assertEqual(rem, 1)
        # Query 3
        ok, rem, _ = self.auth.consume_user_quota(user_id)
        self.assertTrue(ok)
        self.assertEqual(rem, 0)
        # Query 4 (Should fail - exceeded 3 queries)
        ok, rem, _ = self.auth.consume_user_quota(user_id)
        self.assertFalse(ok)
        self.assertEqual(rem, 0)

    def test_google_sign_in(self):
        google_email = "somying.google@gmail.com"
        ok, msg, user_data = self.auth.sign_in_with_google(
            email=google_email,
            name="สมหญิง Google",
            google_sub="1029384756"
        )
        self.assertTrue(ok)
        self.assertTrue(user_data["is_verified"])
        self.assertEqual(user_data["free_quota"], 3)
        self.assertEqual(user_data["remaining"], 3)
        self.assertEqual(user_data["auth_provider"], "google")

        # Session token works
        session_user = self.auth.get_user_by_session(user_data["session_token"])
        self.assertIsNotNone(session_user)
        self.assertEqual(session_user["name"], "สมหญิง Google")


    def test_line_sign_in(self):
        line_id = "U1234567890abcdef"
        ok, msg, user_data = self.auth.sign_in_with_line(
            line_user_id=line_id,
            name="สมศักดิ์ LINE"
        )
        self.assertTrue(ok)
        self.assertTrue(user_data["is_verified"])
        self.assertEqual(user_data["free_quota"], 3)
        self.assertEqual(user_data["remaining"], 3)
        self.assertEqual(user_data["auth_provider"], "line")
        self.assertEqual(user_data["email"], f"{line_id}@line.user")

        # Session token works
        session_user = self.auth.get_user_by_session(user_data["session_token"])
        self.assertIsNotNone(session_user)
        self.assertEqual(session_user["name"], "สมศักดิ์ LINE")


    def test_daily_quota_reset(self):
        # 1. Member consumes all 3 queries today
        ok, msg, user_data = self.auth.sign_in_with_google(email="daily_test@gmail.com", name="Daily User")
        user_id = user_data["id"]
        token = user_data["session_token"]

        for _ in range(3):
            self.auth.consume_user_quota(user_id)

        # Now quota is exhausted
        user_now = self.auth.get_user_by_session(token)
        self.assertEqual(user_now["remaining"], 0)

        # Simulate rollover to next day by backdating quota_reset_date in DB
        with self.auth._get_connection() as conn:
            conn.execute("UPDATE users SET quota_reset_date = '2020-01-01' WHERE id = ?", (user_id,))
            conn.commit()

        # Check session next day -> should automatically reset back to 3!
        user_next_day = self.auth.get_user_by_session(token)
        self.assertEqual(user_next_day["remaining"], 3)
        self.assertEqual(user_next_day["quota_used"], 0)

        # 2. Guest consumes 1 query today
        guest_id = "daily_guest_999"
        self.auth.get_or_create_guest(guest_id)
        self.auth.consume_guest_quota(guest_id)
        g_now = self.auth.get_or_create_guest(guest_id)
        self.assertEqual(g_now["remaining"], 0)

        # Simulate rollover to next day for guest
        with self.auth._get_connection() as conn:
            conn.execute("UPDATE guest_sessions SET quota_reset_date = '2020-01-01' WHERE guest_id = ?", (guest_id,))
            conn.commit()

        # Check guest next day -> should automatically reset back to 1!
        g_next_day = self.auth.get_or_create_guest(guest_id)
        self.assertEqual(g_next_day["remaining"], 1)
        self.assertEqual(g_next_day["quota_used"], 0)


if __name__ == "__main__":
    unittest.main()
