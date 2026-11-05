"""
Doctor Lawyer - Web API & Standalone Demo Server
Two-Tier Architecture with User Authentication & Tier Quota Controls:
- Tier 1: Built-in Rule Engine (11 Categories, 33 ฎีกา, 0 Tokens, 0 THB, <1ms)
- Tier 2: AI Router & Fallback Layer (Low-Cost / Free-Tier LLM or Smart Heuristic)
- User Authentication:
  1. Google Account Sign-In (Instant verified, 3 free queries)
  2. Email Registration with 6-digit OTP verification (Prevents fake emails, 3 free queries)
  3. Unregistered Guests (1 free trial query limit)
- Partner Lawyer Handoff via LINE Official Account (LINE OA)
"""

import os
import json
import urllib.parse
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
import sys
from typing import Tuple, Optional, Dict, Any

# Ensure paths are in sys.path
API_DIR = Path(__file__).resolve().parent
SRC_DIR = API_DIR.parent
BACKEND_DIR = SRC_DIR.parent
PROJECT_ROOT = BACKEND_DIR.parent

for p in [str(PROJECT_ROOT), str(BACKEND_DIR), str(SRC_DIR)]:
    if p not in sys.path:
        sys.path.insert(0, p)

from src.services.rule_engine import RuleEngine
from src.services.ai_router import AIRouter
from src.services.auth_service import AuthService

def _load_env_file():
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

_load_env_file()


# Configuration
LINE_OA_ID = os.environ.get("LINE_OA_ID", "@doctorlawyer")
LINE_OA_URL = os.environ.get("LINE_OA_URL", "https://lin.ee/NQLCu3p")
LINE_LIFF_ID = os.environ.get("LINE_LIFF_ID", "2012301635-WMe8TR6J")
LINE_LIFF_URL = os.environ.get("LINE_LIFF_URL", "https://liff.line.me/2012301635-WMe8TR6J")
LINE_CHANNEL_ID = os.environ.get("LINE_CHANNEL_ID", "2012301635")
LINE_CHANNEL_SECRET = os.environ.get("LINE_CHANNEL_SECRET", "82b5a8addcad17c5555adf9ec429a281")

# Initialize Engines
rule_engine = RuleEngine()
ai_router = AIRouter(categories=rule_engine.categories)
auth_service = AuthService()

print(f"⚖️ Tier 1 Rule Engine loaded: {len(rule_engine.categories)} categories, 33 precedents.", flush=True)
print(f"🤖 Tier 2 AI Router active: {ai_router.get_provider_status()['provider']}", flush=True)
print(f"👤 User Auth & Quota: 1 trial for Guests, 3 free for Google/Verified Email Members.", flush=True)
print(f"💬 Partner Lawyer LINE OA Target: {LINE_OA_URL}", flush=True)


class DoctorLawyerHTTPHandler(SimpleHTTPRequestHandler):
    """
    HTTP Request Handler:
    - POST /api/consult: Evaluates query with user/guest quota rules
    - POST /api/auth/email/request-otp: Sends OTP to verify email (prevents fake emails)
    - POST /api/auth/email/verify-otp: Verifies OTP, activates account with 3 free queries
    - POST /api/auth/google: Signs in via Google Account, activates account with 3 free queries
    - GET /api/auth/me: Returns current user or guest profile and remaining quota
    - GET /api/health: Full system diagnostics
    - GET /api/statutes: Catalog of 11 legal categories
    - GET /api/quota: Checks quota for current user or guest
    - Serves static files from frontend/
    """
    protocol_version = "HTTP/1.1"

    def __init__(self, *args, **kwargs):
        frontend_dir = PROJECT_ROOT / "frontend"
        super().__init__(*args, directory=str(frontend_dir), **kwargs)

    def _get_client_ip(self) -> str:
        """Extracts client IP, respecting proxy headers if behind reverse proxy."""
        x_forwarded_for = self.headers.get("X-Forwarded-For")
        if x_forwarded_for:
            return x_forwarded_for.split(",")[0].strip()
        return self.client_address[0] if self.client_address else "127.0.0.1"

    def _get_current_user_or_guest(self) -> Tuple[Optional[Dict[str, Any]], Dict[str, Any]]:
        """
        Extracts authenticated member user or guest session.
        Returns: (user_or_none, guest_info)
        """
        auth_header = self.headers.get("Authorization", "")
        token = ""
        if auth_header.startswith("Bearer "):
            token = auth_header[7:].strip()
        if not token:
            token = self.headers.get("X-Session-Token", "").strip()

        user = auth_service.get_user_by_session(token) if token else None

        guest_id = self.headers.get("X-Guest-ID", "").strip()
        client_ip = self._get_client_ip()
        guest_info = auth_service.get_or_create_guest(guest_id, client_ip)

        return user, guest_info

    def end_headers(self):
        # Enable CORS for local web dev and LINE LIFF
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Client-Session, X-Session-Token, X-Guest-ID")
        self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(200)
        self.end_headers()

    def do_GET(self):
        try:
            parsed = urllib.parse.urlparse(self.path)
            path = parsed.path

            if path == "/api/health":
                self._handle_health()
            elif path == "/api/statutes":
                self._handle_statutes()
            elif path == "/api/quota":
                self._handle_quota()
            elif path == "/api/config":
                self._handle_config()
            elif path == "/api/auth/me":
                self._handle_auth_me()
            elif path == "/" or path == "":
                self.path = "/index.html"
                super().do_GET()
            else:
                super().do_GET()
        except Exception as e:
            import traceback
            traceback.print_exc()
            self._send_json({"error": str(e)}, status=500)

    def do_POST(self):
        try:
            parsed = urllib.parse.urlparse(self.path)
            path = parsed.path

            if path == "/api/consult":
                self._handle_consult()
            elif path == "/api/auth/email/request-otp":
                self._handle_request_otp()
            elif path == "/api/auth/email/verify-otp":
                self._handle_verify_otp()
            elif path == "/api/auth/google":
                self._handle_google_auth()
            elif path == "/api/auth/line":
                self._handle_line_auth()
            else:
                self._send_json({"error": "Endpoint not found"}, status=404)
        except Exception as e:
            import traceback
            traceback.print_exc()
            self._send_json({"error": str(e)}, status=500)

    def _read_json_body(self) -> Dict[str, Any]:
        content_length = int(self.headers.get("Content-Length", 0))
        if content_length <= 0:
            return {}
        body = self.rfile.read(content_length)
        return json.loads(body.decode("utf-8"))

    def _handle_health(self):
        user, guest_info = self._get_current_user_or_guest()
        status_payload = {
            "status": "healthy",
            "app_name": "ดอกเตอร์ลอว์เยอร์ (Doctor Lawyer)",
            "version": "2.3.0",
            "tiers": {
                "tier_1": {
                    "name": "Built-in Rule & Keyword Engine",
                    "status": "Active (Zero-Cost, Sub-Millisecond)",
                    "categories_loaded": len(rule_engine.categories),
                    "cost": "0.00 THB (0 Tokens)"
                },
                "tier_2": {
                    "name": "AI Router & Fallback Layer",
                    "provider": ai_router.get_provider_status()["provider"],
                    "status": ai_router.get_provider_status()["status"]
                }
            },
            "quota_rules": {
                "registered_member_limit": 3,
                "unregistered_guest_limit": 1,
                "reset_frequency": "daily (รีเซ็ตใหม่ทุกวันเที่ยงคืน)",
                "email_verification": "Required (6-digit OTP)"
            },
            "current_session": {
                "user_type": "member" if user else "guest",
                "remaining": user["remaining"] if user else guest_info["remaining"]
            },
            "partner_lawyer_handoff": {
                "channel": "LINE Official Account (LINE OA)",
                "line_oa_id": LINE_OA_ID,
                "line_oa_url": LINE_OA_URL
            }
        }
        self._send_json(status_payload)

    def _handle_statutes(self):
        categories_list = []
        for cat_id, cat_data in rule_engine.categories.items():
            categories_list.append({
                "id": cat_id,
                "name_th": cat_data.get("category_name_th"),
                "name_en": cat_data.get("category_name_en"),
                "statutes_count": len(cat_data.get("statutes", [])),
                "precedents_count": len(cat_data.get("supreme_court_judgments", [])),
                "keywords": cat_data.get("keywords", [])
            })
        self._send_json({"categories": categories_list, "total": len(categories_list)})

    def _handle_quota(self):
        user, guest_info = self._get_current_user_or_guest()
        if user:
            self._send_json({
                "user_type": "member",
                "email": user["email"],
                "name": user["name"],
                "is_verified": user["is_verified"],
                "auth_provider": user["auth_provider"],
                "quota_remaining": user["remaining"],
                "quota_limit": user["free_quota"],
                "reset_frequency": "daily"
            })
        else:
            self._send_json({
                "user_type": "guest",
                "guest_id": guest_info["guest_id"],
                "quota_remaining": guest_info["remaining"],
                "quota_limit": guest_info["max_quota"],
                "reset_frequency": "daily"
            })

    def _handle_auth_me(self):
        user, guest_info = self._get_current_user_or_guest()
        if user:
            self._send_json({
                "authenticated": True,
                "user": user
            })
        else:
            self._send_json({
                "authenticated": False,
                "guest": guest_info
            })

    def _handle_request_otp(self):
        data = self._read_json_body()
        email = data.get("email", "").strip()
        name = data.get("name", "").strip()

        if not email:
            self._send_json({"success": False, "error": "กรุณากรอกอีเมล"}, status=400)
            return

        res = auth_service.request_email_otp(email, name)
        status_code = 200 if res.get("success") else 400
        self._send_json(res, status=status_code)

    def _handle_verify_otp(self):
        data = self._read_json_body()
        email = data.get("email", "").strip()
        otp = data.get("otp", "").strip()

        if not email or not otp:
            self._send_json({"success": False, "error": "กรุณากรอกอีเมลและรหัส OTP"}, status=400)
            return

        ok, msg, user_data = auth_service.verify_email_otp(email, otp)
        if ok:
            self._send_json({
                "success": True,
                "message": msg,
                "user": user_data,
                "session_token": user_data["session_token"]
            })
        else:
            self._send_json({"success": False, "error": msg}, status=400)

    def _handle_config(self):
        self._send_json({
            "line_liff_id": LINE_LIFF_ID,
            "line_liff_url": LINE_LIFF_URL,
            "line_oa_url": LINE_OA_URL
        })

    def _handle_line_auth(self):
        data = self._read_json_body()
        line_user_id = data.get("line_user_id", "").strip()
        name = data.get("name", "").strip()
        picture_url = data.get("picture_url", "").strip()

        if not line_user_id:
            self._send_json({"success": False, "error": "ข้อมูล LINE User ID ไม่ถูกต้อง"}, status=400)
            return

        ok, msg, user_data = auth_service.sign_in_with_line(line_user_id, name, picture_url)
        if ok:
            self._send_json({
                "success": True,
                "message": msg,
                "user": user_data,
                "session_token": user_data["session_token"]
            })
        else:
            self._send_json({"success": False, "error": msg}, status=400)

    def _handle_google_auth(self):
        data = self._read_json_body()
        email = data.get("email", "").strip()
        name = data.get("name", "").strip()
        google_sub = data.get("google_sub", data.get("credential", ""))

        if not email:
            self._send_json({"success": False, "error": "ข้อมูล Google Account ไม่ครบถ้วน"}, status=400)
            return

        ok, msg, user_data = auth_service.sign_in_with_google(email, name, google_sub)
        if ok:
            self._send_json({
                "success": True,
                "message": msg,
                "user": user_data,
                "session_token": user_data["session_token"]
            })
        else:
            self._send_json({"success": False, "error": msg}, status=400)

    def _handle_consult(self):
        req_data = self._read_json_body()
        query = req_data.get("query", "").strip()
        if not query:
            self._send_json({"error": "Missing 'query' field"}, status=400)
            return

        user, guest_info = self._get_current_user_or_guest()

        # Enforce Quota Rules:
        # Rule 1: Registered verified member gets max 3 queries
        # Rule 2: Unregistered guest gets max 1 query
        if user:
            if user["remaining"] <= 0:
                self._send_json({
                    "status": "QUOTA_EXCEEDED",
                    "user_type": "member",
                    "message": "ท่านได้ใช้งานโควตาปรึกษากฎหมายฟรีครบ 3 ครั้งแล้ว หากต้องการปรึกษาเชิงลึกจากทนายความมืออาชีพ กรุณาส่งต่อเคสให้ทนายความพาร์ตเนอร์ผ่าน LINE Official Account",
                    "confidence": 0.0,
                    "matched_category_id": "CAT-SPECIALIZED",
                    "category_name": "โควตาสมาชิกครบ 3 ครั้งแล้ว",
                    "urgency": {
                        "score": 2,
                        "label": "🟡 โควตาฟรีครบแล้ว แนะนำปรึกษาทนายความพาร์ตเนอร์"
                    },
                    "consultation_parts": [
                        {
                            "step": 1,
                            "title": "⚠️ ท่านได้ใช้งานโควตาปรึกษากฎหมายฟรีครบ 3 ครั้งแล้ว",
                            "content": "ท่านได้ใช้สิทธิ์ปรึกษากฎหมายฟรีครบตามโควตาสมาชิก (3/3 ครั้ง) เรียบร้อยแล้วครับ"
                        },
                        {
                            "step": 2,
                            "title": "👨‍⚖️ ส่งเรื่องให้ทนายความพาร์ตเนอร์ผ่าน LINE OA",
                            "content": "หากต้องการคำปรึกษาเชิงลึกจากทนายความวิชาชีพ สามารถกดปุ่ม **'ส่งต่อให้ทนายพาร์ตเนอร์ผ่าน LINE OA'** เพื่อให้ทนายความตรวจเอกสารและรับงานต่อได้ทันที"
                        }
                    ],
                    "partner_lawyer_brief": {
                        "brief_status": "READY_FOR_LINE_OA_HANDOFF",
                        "category_id": "CAT-SPECIALIZED",
                        "category_name": "คดีขอรับคำปรึกษาจากทนายความ",
                        "masked_client_statement": rule_engine.mask_pii(query),
                        "recommended_statutes": ["ข้อพิพาทเฉพาะทางที่ต้องให้ทนายความวิเคราะห์"],
                        "relevant_precedents": ["ตรวจสอบพยานหลักฐานเบื้องต้น"],
                        "required_documents": ["เอกสารสัญญาหรือสลิปหลักฐานที่เกี่ยวข้อง"]
                    },
                    "quota": {
                        "user_type": "member",
                        "remaining": 0,
                        "limit": user["free_quota"],
                        "note": "โควตาสมาชิกฟรีครบ 3 ครั้งแล้ว กรุณาติดต่อทนายความผ่าน LINE OA"
                    },
                    "line_oa_url": LINE_OA_URL
                })
                return
        else:
            # Guest check
            if guest_info["remaining"] <= 0:
                self._send_json({
                    "status": "AUTH_REQUIRED",
                    "user_type": "guest",
                    "message": "ท่านได้ใช้สิทธิ์ทดลองใช้งานฟรีสำหรับวันนี้ครบ 1 ครั้งแล้ว (รีเซ็ตใหม่ทุกวัน) เพื่อรับสิทธิ์ปรึกษาเพิ่มเป็น 3 ครั้ง/วัน กรุณาเข้าสู่ระบบด้วย Google Account หรือลงทะเบียนด้วย Email หรือ LINE",
                    "confidence": 0.0,
                    "matched_category_id": "CAT-SPECIALIZED",
                    "category_name": "เข้าสู่ระบบเพื่อรับฟรี 3 ครั้ง/วัน",
                    "show_auth_modal": True,
                    "urgency": {
                        "score": 1,
                        "label": "🔵 ต้องเข้าสู่ระบบเพื่อรับสิทธิ์ 3 ครั้ง/วัน"
                    },
                    "consultation_parts": [
                        {
                            "step": 1,
                            "title": "🔒 สิทธิ์ทดลองใช้งานฟรีสำหรับวันนี้ครบ 1 ครั้งแล้ว",
                            "content": "สำหรับผู้ใช้งานทั่วไป ระบบเปิดให้ทดลองใช้งานฟรีได้ 1 ครั้งต่อวันครับ (ระบบจะรีเซ็ตใหม่ในวันพรุ่งนี้)"
                        },
                        {
                            "step": 2,
                            "title": "🎁 สมัครสมาชิกหรือเข้าสู่ระบบ เพื่อรับฟรี 3 ครั้ง/วัน ทุกวัน!",
                            "content": "ท่านสามารถเข้าสู่ระบบด้วย **LINE Account**, **Google Account** หรือลงทะเบียนด้วย **Email (พร้อมยืนยันรหัส OTP)** เพื่อรับสิทธิ์ปรึกษากฎหมายฟรีเพิ่มเป็น **3 ครั้งต่อวัน (รีเซ็ตใหม่ทุกวัน)** ได้ทันทีครับ"
                        }
                    ],
                    "quota": {
                        "user_type": "guest",
                        "remaining": 0,
                        "limit": 1,
                        "reset_frequency": "daily",
                        "note": "ใช้สิทธิ์ทดลองฟรีสำหรับวันนี้ครบ 1 ครั้งแล้ว (รีเซ็ตใหม่ทุกวัน) กรุณาเข้าสู่ระบบเพื่อรับ 3 ครั้ง/วัน"
                    },
                    "line_oa_url": LINE_OA_URL
                })
                return

        # Perform Legal Evaluation
        # 1. First attempt via Tier 1 Rule Engine
        rule_result = rule_engine.evaluate(query)

        if (rule_result.get("confidence", 0) >= 0.50 and 
            rule_result.get("matched_category_id") != "CAT-SPECIALIZED"):
            consult_result = rule_result
        else:
            # 2. Ambiguous/complex query -> Tier 2 AI Router
            client_ip = self._get_client_ip()
            consult_result = ai_router.analyze(query, client_ip)

        # Deduct Quota:
        if user:
            ok, new_rem, limit = auth_service.consume_user_quota(user["id"])
            consult_result["quota"] = {
                "user_type": "member",
                "email": user["email"],
                "remaining": new_rem,
                "limit": limit,
                "reset_frequency": "daily",
                "note": f"สมาชิกยืนยันตัวตนแล้ว (เหลือโควตาวันนี้ {new_rem}/{limit} ครั้ง - รีเซ็ตใหม่ทุกวัน)"
            }
        else:
            ok, new_rem = auth_service.consume_guest_quota(guest_info["guest_id"])
            consult_result["quota"] = {
                "user_type": "guest",
                "guest_id": guest_info["guest_id"],
                "remaining": new_rem,
                "limit": guest_info["max_quota"],
                "reset_frequency": "daily",
                "note": f"ทดลองใช้งานฟรี (เหลือโควตาวันนี้ {new_rem}/{guest_info['max_quota']} ครั้ง - รีเซ็ตใหม่ทุกวัน หรือเข้าสู่ระบบเพื่อรับ 3 ครั้ง/วัน)"
            }

        consult_result["line_oa_url"] = LINE_OA_URL
        self._send_json(consult_result)

    def _send_json(self, data: dict, status: int = 200):
        resp_bytes = json.dumps(data, ensure_ascii=False, indent=2).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(resp_bytes)))
        self.send_header("Connection", "close")
        self.end_headers()
        self.wfile.write(resp_bytes)
        self.wfile.flush()


def run_server(port: int = 3000, host: str = None):
    if host is None:
        host = os.environ.get("HOST", "0.0.0.0" if os.environ.get("PORT") else "127.0.0.1")
    server_address = (host, port)
    ThreadingHTTPServer.allow_reuse_address = (sys.platform != "win32")
    try:
        httpd = ThreadingHTTPServer(server_address, DoctorLawyerHTTPHandler)
    except OSError as e:
        print(f"⚠️ Port {port} is busy ({e}), trying port {port + 1}...", flush=True)
        port += 1
        server_address = (host, port)
        httpd = ThreadingHTTPServer(server_address, DoctorLawyerHTTPHandler)

    display_host = "localhost" if host in ("0.0.0.0", "127.0.0.1") else host
    print("=" * 75, flush=True)
    print(f"🚀 ดอกเตอร์ลอว์เยอร์ (Doctor Lawyer) Server running on http://{display_host}:{port}", flush=True)
    print(f"📱 Web & LIFF Simulator: http://{display_host}:{port}/index.html", flush=True)
    print(f"🩺 Health Check: http://{display_host}:{port}/api/health", flush=True)
    print(f"⚡ Tier 1: Built-in Rule Engine (11 Categories, 33 ฎีกา, 0 Token Cost)", flush=True)
    print(f"🤖 Tier 2: AI Router ({ai_router.get_provider_status()['provider']})", flush=True)
    print(f"👤 Auth: Guest 1 Trial, Google / Verified Email Members 3 Free Queries", flush=True)
    print(f"💬 Partner Lawyer LINE OA: {LINE_OA_URL}", flush=True)
    print("=" * 75, flush=True)
    httpd.serve_forever()


if __name__ == "__main__":
    port = int(os.environ.get("PORT", os.environ.get("APP_PORT", 3000)))
    run_server(port)
