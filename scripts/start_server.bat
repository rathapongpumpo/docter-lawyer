@echo off
chcp 65001 > nul
echo ======================================================================
echo    🏥⚖️  สตาร์ทเซิร์ฟเวอร์: ดอกเตอร์ลอว์เยอร์ (Doctor Lawyer)
echo    Tier 1: Built-in Rule Engine (11 หมวดหมู่, 33 ฎีกา, 0 Token Cost)
echo ======================================================================
echo.
cd /d "%~dp0\.."
python -X utf8 backend\main.py
pause
