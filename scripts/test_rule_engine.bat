@echo off
chcp 65001 > nul
echo ======================================================================
echo    ⚡  ทดสอบ Built-in Rule Engine (เฟส 2)
echo    ดอกเตอร์ลอว์เยอร์ (Doctor Lawyer)
echo    Zero-Cost, Zero-Token, Sub-50ms Precision Engine + Lawyer Handoff
echo ======================================================================
echo.
cd /d "%~dp0\.."
python -X utf8 backend\tests\test_rule_engine.py
echo.
echo ======================================================================
echo    การทดสอบเสร็จสมบูรณ์
echo ======================================================================
pause
