"""
Doctor Lawyer - Free Tier Quota Manager
Tracks free AI consultations per client IP / session to prevent abuse and manage API costs.
"""

import time
from typing import Dict, Tuple, Any
from collections import defaultdict
import threading


class QuotaManager:
    """
    In-memory, thread-safe token / request quota tracker.
    - Default limit: 5 free AI requests per IP per day (resets every 24 hours).
    - Tier 1 (Rule Engine) queries are 100% free and do not consume quota.
    """

    def __init__(self, default_limit: int = 5, window_seconds: int = 86400):
        self.default_limit = default_limit
        self.window_seconds = window_seconds
        self._lock = threading.Lock()
        # Storage: ip -> {"count": int, "reset_at": float}
        self._usage: Dict[str, Dict[str, Any]] = defaultdict(dict)

    def _clean_ip(self, ip: str) -> str:
        if not ip or ip in ("127.0.0.1", "::1", "localhost"):
            return "demo-session"
        return ip.strip()

    def check_quota(self, ip: str) -> Tuple[bool, int, int]:
        """
        Checks if the client IP has remaining quota.
        Returns: (is_allowed, remaining_quota, total_limit)
        """
        ip = self._clean_ip(ip)
        now = time.time()

        with self._lock:
            record = self._usage.get(ip)
            if not record or now >= record.get("reset_at", 0):
                # New or expired window
                remaining = self.default_limit
                return True, remaining, self.default_limit

            count = record.get("count", 0)
            remaining = max(0, self.default_limit - count)
            return (remaining > 0), remaining, self.default_limit

    def consume_quota(self, ip: str) -> Tuple[bool, int, int]:
        """
        Consumes 1 quota credit for the client IP.
        Returns: (success, remaining_quota, total_limit)
        """
        ip = self._clean_ip(ip)
        now = time.time()

        with self._lock:
            record = self._usage.get(ip)
            if not record or now >= record.get("reset_at", 0):
                # Initialize new window
                self._usage[ip] = {
                    "count": 1,
                    "reset_at": now + self.window_seconds
                }
                remaining = self.default_limit - 1
                return True, remaining, self.default_limit

            count = record.get("count", 0)
            if count >= self.default_limit:
                # Quota exceeded
                return False, 0, self.default_limit

            record["count"] = count + 1
            remaining = self.default_limit - record["count"]
            return True, remaining, self.default_limit

    def reset_quota(self, ip: str):
        """Resets quota for an IP (useful for testing or admin overrides)."""
        ip = self._clean_ip(ip)
        with self._lock:
            if ip in self._usage:
                del self._usage[ip]
