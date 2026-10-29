@echo off
chcp 65001 > nul
echo ===========================================================================
echo  🚀 ดอกเตอร์ลอว์เยอร์ (Doctor Lawyer) - Instant Public HTTPS Tunnel
echo ===========================================================================
echo.
echo กำลังสร้าง Public HTTPS URL สำหรับแสดง Live Demo ให้ลูกค้า หรือเชื่อมต่อ LINE LIFF...
echo [Local Server: http://127.0.0.1:3000]
echo.
echo * หมายเหตุ: เมื่อได้ HTTPS URL แล้ว สามารถนำไปใส่ใน LINE Developers Console:
echo   - Channel ID: 2011732178
echo   - LIFF ID: 2011732178-nMl0LXMq
echo.
echo กำลังเชื่อมต่อ Secure Tunnel... (กด Ctrl+C เพื่อหยุด)
echo ===========================================================================
ssh -o StrictHostKeyChecking=no -R 80:127.0.0.1:3000 nokey@localhost.run
pause
