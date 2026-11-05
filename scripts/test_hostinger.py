import urllib.request
import json
import ssl
import sys

sys.stdout.reconfigure(encoding='utf-8')

ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

BASE = "https://lawyer.buzlike.com"

def req(path, method="GET", data=None, headers=None):
    if headers is None:
        headers = {}
    url = BASE + path
    encoded_data = json.dumps(data).encode('utf-8') if data else None
    if data:
        headers["Content-Type"] = "application/json"
    r = urllib.request.Request(url, data=encoded_data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(r, context=ctx, timeout=30) as res:
            body = res.read().decode('utf-8')
            return res.status, body
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode('utf-8')
    except Exception as e:
        return 0, str(e)

print("=== 1. Test GET / ===")
status, body = req("/")
print(f"Status: {status}, Length: {len(body)}, Has Doctor Lawyer: {'ดอกเตอร์ลอว์เยอร์' in body}")

print("\n=== 2. Test GET /api/health ===")
status, body = req("/api/health")
print(f"Status: {status}\nBody: {body[:300]}")

print("\n=== 3. Test GET /api/config ===")
status, body = req("/api/config")
print(f"Status: {status}\nBody: {body}")

print("\n=== 4. Test GET /api/auth/me (Guest) ===")
status, body = req("/api/auth/me", headers={"X-Guest-ID": "test_guest_999"})
print(f"Status: {status}\nBody: {body}")

print("\n=== 5. Test POST /api/auth/email/request-otp ===")
status, body = req("/api/auth/email/request-otp", method="POST", data={"email": "tester@example.com", "name": "นายทดสอบ กฎหมาย"})
print(f"Status: {status}\nBody: {body}")
data = json.loads(body)
otp = data.get("demo_otp")

print(f"\n=== 6. Test POST /api/auth/email/verify-otp (OTP: {otp}) ===")
status, body = req("/api/auth/email/verify-otp", method="POST", data={"email": "tester@example.com", "otp": otp})
print(f"Status: {status}\nBody: {body}")
data = json.loads(body)
token = data.get("session_token")

print(f"\n=== 7. Test POST /api/consult (Tier 1: โอนเงิน บัญชีม้า) ===")
status, body = req("/api/consult", method="POST",
                   headers={"Authorization": f"Bearer {token}"},
                   data={"query": "โดนหลอกโอนเงินไปบัญชีม้า 50,000 บาท ทำอย่างไรดีครับ"})
print(f"Status: {status}")
consult_data = json.loads(body)
print(f"Tier: {consult_data.get('tier')}")
print(f"Category: {consult_data.get('category_name')}")
print(f"Steps count: {len(consult_data.get('consultation_parts', []))}")
print(f"Quota: {consult_data.get('quota')}")
print(f"Step 1 content preview: {consult_data.get('consultation_parts', [{}])[0].get('content', '')[:120]}")

print(f"\n=== 8. Test POST /api/consult (Tier 2: Gemini API test) ===")
status, body = req("/api/consult", method="POST",
                   headers={"Authorization": f"Bearer {token}"},
                   data={"query": "เพื่อนยืมแหวนเพชรไปถ่ายแบบแล้วไม่ยอมเอามาคืน อ้างว่าทำหาย จะแจ้งข้อหาอะไรได้บ้าง"})
print(f"Status: {status}")
consult_data2 = json.loads(body)
print(f"Tier: {consult_data2.get('tier')}")
print(f"Provider: {consult_data2.get('provider')}")
print(f"Category: {consult_data2.get('category_name')}")
print(f"Steps count: {len(consult_data2.get('consultation_parts', []))}")
print(f"Quota: {consult_data2.get('quota')}")
