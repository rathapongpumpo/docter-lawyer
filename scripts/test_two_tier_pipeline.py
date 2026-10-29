"""
End-to-End Verification Test for Doctor Lawyer 2-Tier Architecture, User Auth & LINE OA Handoff
"""

import sys
import json
import urllib.request
import secrets

SERVER_URL = "http://127.0.0.1:3000"

# Direct connection handler to prevent Windows registry proxy interception
opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))


def test_health():
    print("Testing GET /api/health ...", end=" ")
    req = urllib.request.Request(f"{SERVER_URL}/api/health")
    with opener.open(req, timeout=5) as resp:
        assert resp.status == 200
        data = json.loads(resp.read().decode("utf-8"))
        assert data["status"] == "healthy"
        assert "tier_1" in data["tiers"]
        assert "tier_2" in data["tiers"]
        assert data["quota_rules"]["registered_member_limit"] == 3
        assert data["quota_rules"]["unregistered_guest_limit"] == 1
        assert "LINE Official Account (LINE OA)" in data["partner_lawyer_handoff"]["channel"]
    print("PASSED [OK]")


def test_static_frontend():
    print("Testing GET /index.html ...", end=" ")
    req = urllib.request.Request(f"{SERVER_URL}/index.html")
    with opener.open(req, timeout=5) as resp:
        assert resp.status == 200
        content = resp.read().decode("utf-8")
        assert "ดอกเตอร์ลอว์เยอร์" in content
        assert "authModal" in content
        assert "handoffToLineOA" in content
    print("PASSED [Frontend Web & Auth Modal Ready]")


def test_guest_one_trial_and_blocking():
    print("Testing Guest 1-Trial Limit & Auth Prompt ...", end=" ")
    guest_id = f"pipeline_guest_{secrets.token_hex(4)}"
    payload = json.dumps({"query": "ขายของออนไลน์ใน TikTok ยอดขายเกิน 1.8 ล้านบาท สรรพากรเรียกตรวจ VAT"}).encode("utf-8")

    # 1st query: Allowed
    req1 = urllib.request.Request(
        f"{SERVER_URL}/api/consult",
        data=payload,
        headers={"Content-Type": "application/json", "X-Guest-ID": guest_id}
    )
    with opener.open(req1, timeout=5) as resp:
        d1 = json.loads(resp.read().decode("utf-8"))
        assert "Tier 1" in d1["tier"]
        assert d1["quota"]["remaining"] == 0
        assert d1["quota"]["limit"] == 1

    # 2nd query: Blocked with AUTH_REQUIRED!
    req2 = urllib.request.Request(
        f"{SERVER_URL}/api/consult",
        data=payload,
        headers={"Content-Type": "application/json", "X-Guest-ID": guest_id}
    )
    with opener.open(req2, timeout=5) as resp:
        d2 = json.loads(resp.read().decode("utf-8"))
        assert d2.get("status") == "AUTH_REQUIRED"
        assert d2.get("show_auth_modal") is True
    print("PASSED [Guest 1-Trial Enforced]")


def test_member_three_queries_limit():
    print("Testing Member 3-Queries Limit & LINE OA Handoff ...", end=" ")
    member_email = f"pipeline_user_{secrets.token_hex(4)}@gmail.com"

    # Quick Google / Verified Sign-in
    g_body = json.dumps({"email": member_email, "name": "ทดสอบ สมาชิก 3 ครั้ง"}).encode("utf-8")
    req_auth = urllib.request.Request(
        f"{SERVER_URL}/api/auth/google",
        data=g_body,
        headers={"Content-Type": "application/json"}
    )
    with opener.open(req_auth, timeout=5) as resp:
        auth_data = json.loads(resp.read().decode("utf-8"))
        token = auth_data["session_token"]
        assert auth_data["user"]["free_quota"] == 3
        assert auth_data["user"]["remaining"] == 3

    # Query 1/3
    q_body = json.dumps({"query": "รถชนท้าย เรียกค่าขาดประโยชน์จากการใช้รถระหว่างซ่อม"}).encode("utf-8")
    req_q = urllib.request.Request(
        f"{SERVER_URL}/api/consult",
        data=q_body,
        headers={"Content-Type": "application/json", "Authorization": f"Bearer {token}"}
    )
    with opener.open(req_q, timeout=5) as resp:
        d1 = json.loads(resp.read().decode("utf-8"))
        assert d1["quota"]["remaining"] == 2

    # Query 2/3
    with opener.open(req_q, timeout=5) as resp:
        d2 = json.loads(resp.read().decode("utf-8"))
        assert d2["quota"]["remaining"] == 1

    # Query 3/3
    with opener.open(req_q, timeout=5) as resp:
        d3 = json.loads(resp.read().decode("utf-8"))
        assert d3["quota"]["remaining"] == 0

    # Query 4 (Exceeded -> QUOTA_EXCEEDED)
    with opener.open(req_q, timeout=5) as resp:
        d4 = json.loads(resp.read().decode("utf-8"))
        assert d4.get("status") == "QUOTA_EXCEEDED"
        assert d4["quota"]["remaining"] == 0
        assert "line_oa_url" in d4
    print("PASSED [Member 3-Queries Enforced + Line OA Prompt]")


def test_email_otp_flow():
    print("Testing Email Registration & OTP Verification ...", end=" ")
    email = f"otp_client_{secrets.token_hex(4)}@example.com"

    # Request OTP
    req_body = json.dumps({"email": email, "name": "ทดสอบ OTP"}).encode("utf-8")
    req_otp = urllib.request.Request(
        f"{SERVER_URL}/api/auth/email/request-otp",
        data=req_body,
        headers={"Content-Type": "application/json"}
    )
    with opener.open(req_otp, timeout=5) as resp:
        otp_data = json.loads(resp.read().decode("utf-8"))
        assert otp_data["success"] is True
        otp = otp_data["demo_otp"]
        assert len(otp) == 6

    # Verify OTP
    v_body = json.dumps({"email": email, "otp": otp}).encode("utf-8")
    req_v = urllib.request.Request(
        f"{SERVER_URL}/api/auth/email/verify-otp",
        data=v_body,
        headers={"Content-Type": "application/json"}
    )
    with opener.open(req_v, timeout=5) as resp:
        v_data = json.loads(resp.read().decode("utf-8"))
        assert v_data["success"] is True
        assert v_data["user"]["is_verified"] is True
        assert v_data["user"]["remaining"] == 3
    print("PASSED [Email OTP Verified -> 3 Queries Granted]")


if __name__ == "__main__":
    print("=" * 65)
    print("  Running End-to-End Test Suite for Doctor Lawyer Auth & Quota")
    print("=" * 65)
    test_health()
    test_static_frontend()
    test_guest_one_trial_and_blocking()
    test_email_otp_flow()
    test_member_three_queries_limit()
    print("=" * 65)
    print("  🎉 ALL 5 E2E TESTS PASSED 100%!")
    print("=" * 65)
