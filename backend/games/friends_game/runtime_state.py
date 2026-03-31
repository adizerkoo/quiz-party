"""Эфемерное runtime-состояние текущей игры с друзьями: соединения и rate limit."""

from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
import logging
import time


logger = logging.getLogger(__name__)


@dataclass
class ActiveConnection:
    """Связка активного sid с участником и игровой сессией friends_game."""

    sid: str
    participant_id: int
    quiz_id: int


class ConnectionRegistry:
    """In-memory-реестр активных Socket.IO-подключений текущей игры."""

    def __init__(self) -> None:
        """Создаёт пустые индексы для поиска по sid, участнику и игровой сессии."""
        self._sid_to_connection: dict[str, ActiveConnection] = {}
        self._participant_to_sid: dict[int, str] = {}
        self._quiz_to_participants: dict[int, set[int]] = defaultdict(set)

    def bind(self, sid: str, participant_id: int, quiz_id: int) -> None:
        """Привязывает sid к участнику и вытесняет предыдущий sid при наличии."""
        old_sid = self._participant_to_sid.get(participant_id)
        if old_sid:
            self.unbind_sid(old_sid)

        self._sid_to_connection[sid] = ActiveConnection(
            sid=sid,
            participant_id=participant_id,
            quiz_id=quiz_id,
        )
        self._participant_to_sid[participant_id] = sid
        self._quiz_to_participants[quiz_id].add(participant_id)

    def unbind_sid(self, sid: str) -> ActiveConnection | None:
        """Удаляет sid из runtime-индексов и возвращает прежнюю связь, если она была."""
        connection = self._sid_to_connection.pop(sid, None)
        if not connection:
            return None

        self._participant_to_sid.pop(connection.participant_id, None)
        participants = self._quiz_to_participants.get(connection.quiz_id)
        if participants is not None:
            participants.discard(connection.participant_id)
            if not participants:
                self._quiz_to_participants.pop(connection.quiz_id, None)
        return connection

    def get_participant_id(self, sid: str) -> int | None:
        """Возвращает id участника по sid, если соединение ещё активно."""
        connection = self._sid_to_connection.get(sid)
        return connection.participant_id if connection else None

    def get_sid(self, participant_id: int) -> str | None:
        """Возвращает активный sid участника, если он сейчас онлайн."""
        return self._participant_to_sid.get(participant_id)

    def is_connected(self, participant_id: int) -> bool:
        """Проверяет, есть ли у участника активное socket-подключение."""
        return participant_id in self._participant_to_sid

    def get_connected_participants(self, quiz_id: int) -> set[int]:
        """Возвращает множество id участников, которые сейчас онлайн в игре."""
        return set(self._quiz_to_participants.get(quiz_id, set()))

    def get_connected_sids(self, quiz_id: int) -> list[str]:
        """Возвращает все активные sid внутри указанной игровой сессии."""
        participants = self._quiz_to_participants.get(quiz_id, set())
        return [
            sid
            for participant_id, sid in self._participant_to_sid.items()
            if participant_id in participants
        ]

    def clear_quiz(self, quiz_id: int) -> None:
        """Полностью очищает runtime-состояние по игровой сессии."""
        for participant_id in list(self._quiz_to_participants.get(quiz_id, set())):
            sid = self._participant_to_sid.get(participant_id)
            if sid:
                self.unbind_sid(sid)


class RateLimiter:
    """Простой in-memory rate limiter для realtime-событий текущей игры."""

    def __init__(self, max_requests: int = 100, time_window: int = 60):
        """Создаёт лимитер по числу событий в скользящем временном окне."""
        self.max_requests = max_requests
        self.time_window = time_window
        self.requests = defaultdict(list)
        self._sid_to_key = {}
        self._call_count = 0

    def register_identity(self, sid: str, persistent_key: str) -> None:
        """Привязывает временный sid к более стабильному identity-ключу."""
        self._sid_to_key[sid] = persistent_key

    def is_allowed(self, identifier: str) -> bool:
        """Проверяет, можно ли принять ещё одно событие от источника."""
        key = self._sid_to_key.get(identifier, identifier)
        now = time.time()
        self.requests[key] = [
            req_time for req_time in self.requests[key] if now - req_time < self.time_window
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
        orphaned = [sid for sid, key in self._sid_to_key.items() if key not in active_keys]
        for sid in orphaned:
            del self._sid_to_key[sid]


connection_registry = ConnectionRegistry()
rate_limiter = RateLimiter(max_requests=100, time_window=60)
