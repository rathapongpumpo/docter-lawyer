"""
End-to-End API Test for:
1. Guest 1 free trial limit (2nd request blocked with AUTH_REQUIRED)
2. Email registration & 6-digit OTP verification
3. Google account sign-in
4. Registered member 3 free queries limit (4th request blocked with QUOTA_EXCEEDED)
"""

import unittest
import json
import urllib.request
import secrets

SERVER_URL = "http://127.0.0.1:3000"
opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))


class TestAuthAPI(unittest.TestCase):
    def test_01_health_and_quota_rules(self):
        req = urllib.request.Request(f"{SERVER_URL}/api/health")
        with opener.open(req, timeout=5) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            self.assertEqual(data["status"], "healthy")
            self.assertEqual(data["quota_rules"]["registered_member_limit"], 3)
            self.assertEqual(data["quota_rules"]["unregistered_guest_limit"], 1)

    def test_02_guest_one_trial_only(self):
        guest_id = f"test_guest_{secrets.token_hex(6)}"

        # 1st Query as Guest -> Allowed
        payload = json.dumps({"query": "โดนโกงโอนเงิน 10,000 บาท"}).encode("utf-8")
        req = urllib.request.Request(
            f"{SERVER_URL}/api/consult",
            data=payload,
            headers={"Content-Type": "application/json", "X-Guest-ID": guest_id}
        )
        with opener.open(req, timeout=5) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            self.assertIn("consultation_parts", data)
            self.assertEqual(data["quota"]["user_type"], "guest")
            self.assertEqual(data["quota"]["remaining"], 0)

        # 2nd Query as Guest -> BLOCKED with AUTH_REQUIRED!
        req2 = urllib.request.Request(
            f"{SERVER_URL}/api/consult",
            data=payload,
            headers={"Content-Type": "application/json", "X-Guest-ID": guest_id}
        )
        with opener.open(req2, timeout=5) as resp:
            data2 = json.loads(resp.read().decode("utf-8"))
            self.assertEqual(data2.get("status"), "AUTH_REQUIRED")
            self.assertTrue(data2.get("show_auth_modal"))
            self.assertIn("เข้าสู่ระบบด้วย Google", data2.get("message"))

    def test_03_email_registration_and_three_queries_limit(self):
        test_email = f"client_{secrets.token_hex(4)}@example.com"

        # 1. Request OTP
        req_body = json.dumps({"email": test_email, "name": "ทดสอบ สมาชิก"}).encode("utf-8")
        req = urllib.request.Request(
            f"{SERVER_URL}/api/auth/email/request-otp",
            data=req_body,
            headers={"Content-Type": "application/json"}
        )
        with opener.open(req, timeout=5) as resp:
            res_data = json.loads(resp.read().decode("utf-8"))
            self.assertTrue(res_data["success"])
            otp = res_data["demo_otp"]
            self.assertEqual(len(otp), 6)

        # 2. Verify OTP
        verify_body = json.dumps({"email": test_email, "otp": otp}).encode("utf-8")
        req_v = urllib.request.Request(
            f"{SERVER_URL}/api/auth/email/verify-otp",
            data=verify_body,
            headers={"Content-Type": "application/json"}
        )
        with opener.open(req_v, timeout=5) as resp:
            v_data = json.loads(resp.read().decode("utf-8"))
            self.assertTrue(v_data["success"])
            self.assertTrue(v_data["user"]["is_verified"])
            self.assertEqual(v_data["user"]["free_quota"], 3)
            self.assertEqual(v_data["user"]["remaining"], 3)
            token = v_data["session_token"]

        # 3. Check /api/auth/me
        me_req = urllib.request.Request(
            f"{SERVER_URL}/api/auth/me",
            headers={"Authorization": f"Bearer {token}"}
        )
        with opener.open(me_req, timeout=5) as resp:
            me_data = json.loads(resp.read().decode("utf-8"))
            self.assertTrue(me_data["authenticated"])
            self.assertEqual(me_data["user"]["email"], test_email)

        # 4. Member Query 1/3 -> Allowed, remaining = 2
        q_body = json.dumps({"query": "รถชนท้าย เรียกค่าขาดประโยชน์ 500 บาทต่อวัน"}).encode("utf-8")
        req_q1 = urllib.request.Request(
            f"{SERVER_URL}/api/consult",
            data=q_body,
            headers={"Content-Type": "application/json", "Authorization": f"Bearer {token}"}
        )
        with opener.open(req_q1, timeout=5) as resp:
            d1 = json.loads(resp.read().decode("utf-8"))
            self.assertEqual(d1["quota"]["remaining"], 2)

        # 5. Member Query 2/3 -> Allowed, remaining = 1
        with opener.open(req_q1, timeout=5) as resp:
            d2 = json.loads(resp.read().decode("utf-8"))
            self.assertEqual(d2["quota"]["remaining"], 1)

        # 6. Member Query 3/3 -> Allowed, remaining = 0
        with opener.open(req_q1, timeout=5) as resp:
            d3 = json.loads(resp.read().decode("utf-8"))
            self.assertEqual(d3["quota"]["remaining"], 0)

        # 7. Member Query 4 (Exceeded 3 queries) -> BLOCKED with QUOTA_EXCEEDED!
        with opener.open(req_q1, timeout=5) as resp:
            d4 = json.loads(resp.read().decode("utf-8"))
            self.assertEqual(d4.get("status"), "QUOTA_EXCEEDED")
            self.assertEqual(d4["quota"]["remaining"], 0)
            self.assertIn("ครบ 3 ครั้งแล้ว", d4.get("message"))
            self.assertIn("line_oa_url", d4)

    def test_04_google_sign_in_gets_three_queries(self):
        google_email = f"google_{secrets.token_hex(4)}@gmail.com"
        g_body = json.dumps({"email": google_email, "name": "Google User Test"}).encode("utf-8")
        req = urllib.request.Request(
            f"{SERVER_URL}/api/auth/google",
            data=g_body,
            headers={"Content-Type": "application/json"}
        )
        with opener.open(req, timeout=5) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            self.assertTrue(data["success"])
            self.assertEqual(data["user"]["auth_provider"], "google")
            self.assertEqual(data["user"]["free_quota"], 3)
            self.assertEqual(data["user"]["remaining"], 3)


if __name__ == "__main__":
    unittest.main()
