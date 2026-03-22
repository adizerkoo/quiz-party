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
    """Simple in-memory rate limiter"""
    
    def __init__(self, max_requests: int = 100, time_window: int = 60):
        self.max_requests = max_requests
        self.time_window = time_window
        self.requests = defaultdict(list)
    
    def is_allowed(self, identifier: str) -> bool:
        """Check if request is allowed for identifier (IP, user, etc)"""
        now = time.time()
        
        # Clean old requests outside time window
        self.requests[identifier] = [
            req_time for req_time in self.requests[identifier]
            if now - req_time < self.time_window
        ]
        
        # Check limit
        if len(self.requests[identifier]) >= self.max_requests:
            logger.warning("Rate limit exceeded  identifier=%s  requests=%d/%d", identifier, len(self.requests[identifier]), self.max_requests)
            return False
        
        # Add current request
        self.requests[identifier].append(now)
        return True


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
