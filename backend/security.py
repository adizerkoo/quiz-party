"""Утилиты безопасности и валидации для backend Quiz Party."""

from collections import defaultdict
import logging
import re
import time

logger = logging.getLogger(__name__)


class RateLimiter:
    """Простой in-memory rate limiter для HTTP/socket-событий.

    Лимитер умеет маппить временный `sid` на более стабильный ключ участника.
    Это позволяет не сбрасывать лимит полностью при реконнекте.
    """

    def __init__(self, max_requests: int = 100, time_window: int = 60):
        """Создаёт лимитер с ограничением по числу запросов в окне времени."""
        self.max_requests = max_requests
        self.time_window = time_window
        self.requests = defaultdict(list)
        self._sid_to_key = {}
        self._call_count = 0

    def register_identity(self, sid: str, persistent_key: str) -> None:
        """Привязывает socket sid к более стабильному identity-ключу участника."""
        self._sid_to_key[sid] = persistent_key

    def is_allowed(self, identifier: str) -> bool:
        """Проверяет, можно ли принять ещё один запрос от данного источника."""
        key = self._sid_to_key.get(identifier, identifier)
        now = time.time()

        # Перед проверкой лимита вычищаем старые отметки вне текущего окна.
        self.requests[key] = [
            req_time for req_time in self.requests[key]
            if now - req_time < self.time_window
        ]

        if len(self.requests[key]) >= self.max_requests:
            logger.warning(
                "Rate limit exceeded  identifier=%s  requests=%d/%d",
                key,
                len(self.requests[key]),
                self.max_requests,
            )
            return False

        self.requests[key].append(now)

        # Полную уборку делаем лениво, чтобы не платить её цену на каждый вызов.
        self._call_count += 1
        if self._call_count >= 500:
            self._call_count = 0
            self._cleanup(now)

        return True

    def _cleanup(self, now: float) -> None:
        """Удаляет устаревшие записи и orphaned sid из внутренних индексов."""
        stale = [
            key
            for key, values in self.requests.items()
            if not values or now - values[-1] > self.time_window * 2
        ]
        for key in stale:
            del self.requests[key]

        active_keys = set(self.requests.keys())
        orphaned = [
            sid
            for sid, key in self._sid_to_key.items()
            if key not in active_keys
        ]
        for sid in orphaned:
            del self._sid_to_key[sid]


rate_limiter = RateLimiter(max_requests=100, time_window=60)


def validate_quiz_code(code: str) -> bool:
    """Проверяет, что код комнаты не пустой и содержит только безопасные символы."""
    if not code or len(code) > 20:
        return False
    return all(char.isalnum() or char == "-" for char in code)


def validate_player_name(name: str) -> bool:
    """Проверяет длину имени игрока без попытки задавать identity по username."""
    if not name or len(name) < 1 or len(name) > 15:
        return False
    return True


def validate_answer(answer: str) -> bool:
    """Проверяет, что ответ не пустой и не превышает допустимую длину."""
    if not answer or len(str(answer)) > 500:
        return False
    return True


def sanitize_text(text: str) -> str:
    """Удаляет HTML-теги из пользовательского текста как базовую защиту от XSS."""
    if not text:
        return text
    return re.sub(r"<[^>]*?>", "", str(text))
