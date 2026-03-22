"""
Security utilities for Quiz Party API
- Rate limiting
- Input validation
- Quiz protection
"""

import logging
import re
from functools import wraps
import time
from collections import defaultdict

logger = logging.getLogger(__name__)


class RateLimiter:
    """Simple in-memory rate limiter with persistent identity support."""
    
    def __init__(self, max_requests: int = 100, time_window: int = 60):
        self.max_requests = max_requests
        self.time_window = time_window
        self.requests = defaultdict(list)
        self._sid_to_key = {}       # sid → persistent key (survives reconnects)
        self._call_count = 0
    
    def register_identity(self, sid: str, persistent_key: str) -> None:
        """Map a socket sid to a persistent identity so rate limits survive reconnects."""
        self._sid_to_key[sid] = persistent_key
    
    def is_allowed(self, identifier: str) -> bool:
        """Check if request is allowed for identifier (IP, user, etc)"""
        key = self._sid_to_key.get(identifier, identifier)
        now = time.time()
        
        # Clean old requests outside time window
        self.requests[key] = [
            req_time for req_time in self.requests[key]
            if now - req_time < self.time_window
        ]
        
        # Check limit
        if len(self.requests[key]) >= self.max_requests:
            logger.warning("Rate limit exceeded  identifier=%s  requests=%d/%d", key, len(self.requests[key]), self.max_requests)
            return False
        
        # Add current request
        self.requests[key].append(now)
        
        # Lazy cleanup of stale entries
        self._call_count += 1
        if self._call_count >= 500:
            self._call_count = 0
            self._cleanup(now)
        
        return True
    
    def _cleanup(self, now: float) -> None:
        """Remove stale entries to prevent memory leak."""
        stale = [k for k, v in self.requests.items()
                 if not v or now - v[-1] > self.time_window * 2]
        for k in stale:
            del self.requests[k]
        active_keys = set(self.requests.keys())
        orphaned = [sid for sid, key in self._sid_to_key.items()
                    if key not in active_keys]
        for sid in orphaned:
            del self._sid_to_key[sid]


# Global rate limiter instance
rate_limiter = RateLimiter(max_requests=100, time_window=60)


def validate_quiz_code(code: str) -> bool:
    """Validate quiz code format (e.g. PARTY-ABCDE)"""
    if not code or len(code) > 20:
        return False
    return all(c.isalnum() or c == '-' for c in code)


def validate_player_name(name: str) -> bool:
    """Validate player name"""
    if not name or len(name) < 1 or len(name) > 15:
        return False
    return True


def validate_answer(answer: str) -> bool:
    """Validate answer format"""
    if not answer or len(str(answer)) > 500:
        return False
    return True


def sanitize_text(text: str) -> str:
    """Strip HTML tags from user input to prevent XSS"""
    if not text:
        return text
    return re.sub(r'<[^>]*?>', '', str(text))
