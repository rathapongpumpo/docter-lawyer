"""
Doctor Lawyer - Passenger WSGI Entrypoint for Hostinger / cPanel / hPanel
Serves static frontend and handles complete two-tier legal consultation API + Auth & Daily Quotas.
"""

import sys
import os
import json
import urllib.parse
from pathlib import Path
from typing import Tuple, Optional, Dict, Any

# Add project root and backend to sys.path
PROJECT_ROOT = Path(__file__).resolve().parent
BACKEND_DIR = PROJECT_ROOT / "backend"
sys.path.insert(0, str(PROJECT_ROOT))
sys.path.insert(0, str(BACKEND_DIR))
sys.path.insert(0, str(BACKEND_DIR / "src"))

# Load .env file
env_file = PROJECT_ROOT / ".env"
if env_file.exists():
    with open(env_file, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            k = k.strip()
            v = v.strip().strip("'\"")
            if k not in os.environ:
                os.environ[k] = v

from src.services.rule_engine import RuleEngine
from src.services.ai_router import AIRouter
from src.services.auth_service import AuthService

rule_engine = RuleEngine()
ai_router = AIRouter(categories=rule_engine.categories)
auth_service = AuthService()

LINE_OA_ID = os.environ.get("LINE_OA_ID", "@doctorlawyer")
LINE_OA_URL = os.environ.get("LINE_OA_URL", "https://lin.ee/NQLCu3p")
LINE_LIFF_ID = os.environ.get("LINE_LIFF_ID", "2012301635-WMe8TR6J")
LINE_LIFF_URL = os.environ.get("LINE_LIFF_URL", "https://liff.line.me/2012301635-WMe8TR6J")


def _get_current_user_or_guest(environ) -> Tuple[Optional[Dict[str, Any]], Dict[str, Any]]:
    auth_header = environ.get("HTTP_AUTHORIZATION", "")
    token = auth_header.replace("Bearer ", "").strip() if "Bearer " in auth_header else ""
    user = auth_service.get_user_by_session(token) if token else None

    guest_id = environ.get("HTTP_X_GUEST_ID", "guest_default")
    x_forwarded_for = environ.get("HTTP_X_FORWARDED_FOR", "")
    ip = x_forwarded_for.split(",")[0].strip() if x_forwarded_for else environ.get("REMOTE_ADDR", "127.0.0.1")
    guest_info = auth_service.get_or_create_guest(guest_id, ip=ip)

    return user, guest_info


def application(environ, start_response):
    path = environ.get("PATH_INFO", "/")
    method = environ.get("REQUEST_METHOD", "GET")

    def json_response(payload_dict: Any, status="200 OK"):
        body = json.dumps(payload_dict, ensure_ascii=False).encode("utf-8")
        headers = [
            ("Content-Type", "application/json; charset=utf-8"),
            ("Content-Length", str(len(body))),
            ("Access-Control-Allow-Origin", "*"),
            ("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Guest-ID"),
            ("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        ]
        start_response(status, headers)
        return [body]

    # Handle CORS Preflight
    if method == "OPTIONS":
        headers = [
            ("Access-Control-Allow-Origin", "*"),
            ("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Guest-ID"),
            ("Access-Control-Allow-Methods", "GET, POST, OPTIONS"),
            ("Content-Length", "0")
        ]
        start_response("204 No Content", headers)
        return []

    # 1. Serve static frontend files
    if method == "GET" and (path == "/" or path == "/index.html" or not path.startswith("/api/")):
        frontend_file = PROJECT_ROOT / "frontend" / "index.html"
        if frontend_file.exists():
            data = frontend_file.read_bytes()
            start_response("200 OK", [
                ("Content-Type", "text/html; charset=utf-8"),
                ("Content-Length", str(len(data))),
                ("Access-Control-Allow-Origin", "*")
            ])
            return [data]

    # 2. Health check
    if method == "GET" and path == "/api/health":
        user, guest_info = _get_current_user_or_guest(environ)
        return json_response({
            "status": "healthy",
            "app_name": "ดอกเตอร์ลอว์เยอร์ (Doctor Lawyer)",
            "version": "2.3.0",
            "tiers": {
                "tier_1": {"name": "Rule Engine", "categories_loaded": len(rule_engine.categories)},
                "tier_2": ai_router.get_provider_status()
            },
            "partner_lawyer_handoff": {
                "channel": "LINE Official Account (LINE OA)",
                "line_oa_id": LINE_OA_ID,
                "line_oa_url": LINE_OA_URL
            },
            "session": {
                "user_type": "member" if user else "guest",
                "remaining": user["remaining"] if user else guest_info["remaining"]
            }
        })

    # 3. Config endpoint
    if method == "GET" and path == "/api/config":
        return json_response({
            "line_liff_id": LINE_LIFF_ID,
            "line_liff_url": LINE_LIFF_URL,
            "line_oa_url": LINE_OA_URL
        })

    # 4. Auth Me endpoint
    if method == "GET" and path == "/api/auth/me":
        user, guest_info = _get_current_user_or_guest(environ)
        if user:
            return json_response({"authenticated": True, "user": user})
        else:
            return json_response({"authenticated": False, "guest": guest_info})

    # Read body for POST requests
    body = b""
    body_data = {}
    if method == "POST":
        try:
            length = int(environ.get("CONTENT_LENGTH", 0))
            if length > 0:
                body = environ["wsgi.input"].read(length)
                body_data = json.loads(body.decode("utf-8") or "{}")
        except Exception:
            body_data = {}

    # 5. Request Email OTP
    if method == "POST" and path == "/api/auth/email/request-otp":
        email = body_data.get("email", "").strip()
        name = body_data.get("name", "").strip()
        if not email:
            return json_response({"success": False, "error": "กรุณากรอกอีเมล"}, status="400 Bad Request")
        res = auth_service.request_email_otp(email, name)
        status = "200 OK" if res.get("success") else "400 Bad Request"
        return json_response(res, status=status)

    # 6. Verify Email OTP
    if method == "POST" and path == "/api/auth/email/verify-otp":
        email = body_data.get("email", "").strip()
        otp = body_data.get("otp", "").strip()
        if not email or not otp:
            return json_response({"success": False, "error": "กรุณากรอกอีเมลและรหัส OTP"}, status="400 Bad Request")
        ok, msg, user_data = auth_service.verify_email_otp(email, otp)
        if ok:
            return json_response({
                "success": True,
                "message": msg,
                "user": user_data,
                "session_token": user_data["session_token"]
            })
        return json_response({"success": False, "error": msg}, status="400 Bad Request")

    # 7. Google Auth
    if method == "POST" and path == "/api/auth/google":
        email = body_data.get("email", "").strip()
        name = body_data.get("name", "").strip()
        google_sub = body_data.get("google_sub", body_data.get("credential", ""))
        if not email:
            return json_response({"success": False, "error": "ข้อมูล Google Account ไม่ถูกต้อง"}, status="400 Bad Request")
        ok, msg, user_data = auth_service.sign_in_with_google(email, name, google_sub)
        if ok:
            return json_response({
                "success": True,
                "message": msg,
                "user": user_data,
                "session_token": user_data["session_token"]
            })
        return json_response({"success": False, "error": msg}, status="400 Bad Request")

    # 8. LINE Auth
    if method == "POST" and path == "/api/auth/line":
        line_user_id = body_data.get("line_user_id", "").strip()
        name = body_data.get("name", "").strip()
        picture_url = body_data.get("picture_url", "").strip()
        if not line_user_id:
            return json_response({"success": False, "error": "ข้อมูล LINE User ID ไม่ถูกต้อง"}, status="400 Bad Request")
        ok, msg, user_data = auth_service.sign_in_with_line(line_user_id, name, picture_url)
        if ok:
            return json_response({
                "success": True,
                "message": msg,
                "user": user_data,
                "session_token": user_data["session_token"]
            })
        return json_response({"success": False, "error": msg}, status="400 Bad Request")

    # 9. Consult endpoint
    if method == "POST" and path == "/api/consult":
        query = body_data.get("query", "").strip()
        if not query:
            return json_response({"error": "Missing 'query' field"}, status="400 Bad Request")

        user, guest_info = _get_current_user_or_guest(environ)

        if user:
            allowed, remaining, _ = auth_service.consume_user_quota(user["id"])
            if not allowed:
                return json_response({
                    "status": "QUOTA_EXCEEDED",
                    "error": "QUOTA_EXCEEDED",
                    "message": "ท่านใช้สิทธิ์ปรึกษาฟรีสำหรับวันนี้ครบ 3 ครั้งแล้ว (รีเซ็ตใหม่ทุกวัน) กรุณาติดต่อทนายความพาร์ตเนอร์ผ่าน LINE OA",
                    "line_oa_url": LINE_OA_URL
                }, status="403 Forbidden")
        else:
            allowed, remaining = auth_service.consume_guest_quota(guest_info["guest_id"])
            if not allowed:
                return json_response({
                    "status": "AUTH_REQUIRED",
                    "error": "AUTH_REQUIRED",
                    "message": "ท่านใช้สิทธิ์ทดลองสำหรับวันนี้ครบ 1 ครั้งแล้ว (รีเซ็ตใหม่ทุกวัน) กรุณาเข้าสู่ระบบด้วยอีเมลหรือ LINE เพื่อรับสิทธิ์ 3 ครั้ง/วัน",
                    "line_oa_url": LINE_OA_URL
                }, status="403 Forbidden")

        t1 = rule_engine.evaluate(query)
        if t1.get("matched"):
            result = t1
        else:
            result = ai_router.analyze(query)

        result["line_oa_url"] = LINE_OA_URL
        result["quota"] = {"remaining": remaining, "user_type": "member" if user else "guest"}
        return json_response(result)

    # 404 Not Found
    return json_response({"error": "Endpoint not found"}, status="404 Not Found")
