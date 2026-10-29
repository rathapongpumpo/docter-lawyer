@echo off
chcp 65001 > nul
echo ===========================================================================
echo  🧪 ดอกเตอร์ลอว์เยอร์ (Doctor Lawyer) - End-to-End System Test
echo ===========================================================================
echo.
python -X utf8 scripts\test_two_tier_pipeline.py
echo.
pause
