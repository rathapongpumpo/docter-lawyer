"""
Unit tests for AIRouter.
"""

import unittest
from backend.src.services.ai_router import AIRouter


class TestAIRouter(unittest.TestCase):
    def setUp(self):
        self.router = AIRouter()

    def test_provider_status(self):
        status = self.router.get_provider_status()
        self.assertIn("provider", status)
        self.assertIn("status", status)

    def test_smart_heuristic_response(self):
        query = "โดนเวนคืนที่ดินสร้างทางด่วนพิเศษ ได้เงินค่าทดแทนน้อยเกินไป อยากอุทธรณ์"
        result = self.router.analyze(query)
        self.assertIn("tier", result)
        self.assertIn("consultation_parts", result)
        self.assertEqual(len(result["consultation_parts"]), 6)
        self.assertIn("partner_lawyer_brief", result)
        self.assertEqual(result["partner_lawyer_brief"]["brief_status"], "READY_FOR_LINE_OA_HANDOFF")


if __name__ == "__main__":
    unittest.main()
