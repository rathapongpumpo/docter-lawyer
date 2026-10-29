"""
Unit tests for QuotaManager.
"""

import unittest
from backend.src.services.quota_manager import QuotaManager


class TestQuotaManager(unittest.TestCase):
    def setUp(self):
        self.qm = QuotaManager(default_limit=3, window_seconds=60)

    def test_initial_quota(self):
        allowed, remaining, limit = self.qm.check_quota("192.168.1.50")
        self.assertTrue(allowed)
        self.assertEqual(remaining, 3)
        self.assertEqual(limit, 3)

    def test_consume_quota(self):
        # 1st consume
        ok, rem, _ = self.qm.consume_quota("192.168.1.50")
        self.assertTrue(ok)
        self.assertEqual(rem, 2)

        # 2nd consume
        ok, rem, _ = self.qm.consume_quota("192.168.1.50")
        self.assertTrue(ok)
        self.assertEqual(rem, 1)

        # 3rd consume
        ok, rem, _ = self.qm.consume_quota("192.168.1.50")
        self.assertTrue(ok)
        self.assertEqual(rem, 0)

        # 4th consume (should fail)
        ok, rem, _ = self.qm.consume_quota("192.168.1.50")
        self.assertFalse(ok)
        self.assertEqual(rem, 0)

    def test_reset_quota(self):
        self.qm.consume_quota("192.168.1.50")
        self.qm.consume_quota("192.168.1.50")
        self.qm.consume_quota("192.168.1.50")
        allowed, rem, _ = self.qm.check_quota("192.168.1.50")
        self.assertFalse(allowed)

        self.qm.reset_quota("192.168.1.50")
        allowed, rem, _ = self.qm.check_quota("192.168.1.50")
        self.assertTrue(allowed)
        self.assertEqual(rem, 3)


if __name__ == "__main__":
    unittest.main()
