"""Эфемерное runtime-состояние текущей игры с друзьями: соединения и rate limit.

При наличии Redis (REDIS_URL) данные дублируются в Redis для:
  - устойчивости к перезапускам сервера,
  - возможности горизонтального масштабирования.
Без Redis всё работает точно так же в in-memory режиме.
"""

from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
import logging
import time

from backend.app.redis_client import get_redis


logger = logging.getLogger(__name__)

_CONN_TTL = 3600  # 1 hour — автоочистка устаревших записей в Redis
_RATE_TTL_MULTIPLIER = 2  # TTL ключей rate limiter = time_window * multiplier


@dataclass
class ActiveConnection:
    """Связка активного sid с участником и игровой сессией friends_game."""

    sid: str
    participant_id: int
    quiz_id: int


class ConnectionRegistry:
    """Реестр активных Socket.IO-подключений с опциональным Redis-бэкендом."""

    def __init__(self) -> None:
        """Создаёт пустые индексы для поиска по sid, участнику и игровой сессии."""
        self._sid_to_connection: dict[str, ActiveConnection] = {}
        self._participant_to_sid: dict[int, str] = {}
        self._quiz_to_participants: dict[int, set[int]] = defaultdict(set)

    @staticmethod
    def _redis():
        return get_redis()

    # ---------- write operations ----------

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

        r = self._redis()
        if r is not None:
            try:
                pipe = r.pipeline()
                pipe.hset(f"qp:conn:sid:{sid}", mapping={
                    "participant_id": str(participant_id),
                    "quiz_id": str(quiz_id),
                })
                pipe.expire(f"qp:conn:sid:{sid}", _CONN_TTL)
                pipe.set(f"qp:conn:p2s:{participant_id}", sid, ex=_CONN_TTL)
                pipe.sadd(f"qp:conn:quiz:{quiz_id}", str(participant_id))
                pipe.expire(f"qp:conn:quiz:{quiz_id}", _CONN_TTL)
                pipe.execute()
            except Exception:
                logger.debug("Redis bind failed  sid=%s  participant=%s", sid, participant_id)

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

        r = self._redis()
        if r is not None:
            try:
                pipe = r.pipeline()
                pipe.delete(f"qp:conn:sid:{sid}")
                pipe.delete(f"qp:conn:p2s:{connection.participant_id}")
                pipe.srem(f"qp:conn:quiz:{connection.quiz_id}", str(connection.participant_id))
                pipe.execute()
            except Exception:
                logger.debug("Redis unbind failed  sid=%s", sid)

        return connection

    def clear_quiz(self, quiz_id: int) -> None:
        """Полностью очищает runtime-состояние по игровой сессии."""
        for participant_id in list(self._quiz_to_participants.get(quiz_id, set())):
            sid = self._participant_to_sid.get(participant_id)
            if sid:
                self.unbind_sid(sid)

    # ---------- read operations ----------

    def get_participant_id(self, sid: str) -> int | None:
        """Возвращает id участника по sid, если соединение ещё активно."""
        connection = self._sid_to_connection.get(sid)
        if connection:
            return connection.participant_id

        r = self._redis()
        if r is not None:
            try:
                data = r.hgetall(f"qp:conn:sid:{sid}")
                if data and "participant_id" in data:
                    return int(data["participant_id"])
            except Exception:
                pass

        return None

    def get_sid(self, participant_id: int) -> str | None:
        """Возвращает активный sid участника, если он сейчас онлайн."""
        local = self._participant_to_sid.get(participant_id)
        if local:
            return local

        r = self._redis()
        if r is not None:
            try:
                sid = r.get(f"qp:conn:p2s:{participant_id}")
                return sid
            except Exception:
                pass

        return None

    def is_connected(self, participant_id: int) -> bool:
        """Проверяет, есть ли у участника активное socket-подключение."""
        if participant_id in self._participant_to_sid:
            return True

        r = self._redis()
        if r is not None:
            try:
                return r.exists(f"qp:conn:p2s:{participant_id}") > 0
            except Exception:
                pass

        return False

    def get_connected_participants(self, quiz_id: int) -> set[int]:
        """Возвращает множество id участников, которые сейчас онлайн в игре."""
        local = self._quiz_to_participants.get(quiz_id, set())
        if local:
            return set(local)

        r = self._redis()
        if r is not None:
            try:
                members = r.smembers(f"qp:conn:quiz:{quiz_id}")
                if members:
                    return {int(m) for m in members}
            except Exception:
                pass

        return set()

    def get_connected_sids(self, quiz_id: int) -> list[str]:
        """Возвращает все активные sid внутри указанной игровой сессии."""
        participants = self._quiz_to_participants.get(quiz_id, set())
        return [
            sid
            for participant_id, sid in self._participant_to_sid.items()
            if participant_id in participants
        ]


class RateLimiter:
    """Rate limiter для realtime-событий с опциональным Redis-бэкендом."""

    def __init__(self, max_requests: int = 100, time_window: int = 60):
        """Создаёт лимитер по числу событий в скользящем временном окне."""
        self.max_requests = max_requests
        self.time_window = time_window
        self.requests = defaultdict(list)
        self._sid_to_key = {}
        self._call_count = 0

    @staticmethod
    def _redis():
        return get_redis()

    def register_identity(self, sid: str, persistent_key: str) -> None:
        """Привязывает временный sid к более стабильному identity-ключу."""
        self._sid_to_key[sid] = persistent_key

        r = self._redis()
        if r is not None:
            try:
                r.set(f"qp:rl:sidmap:{sid}", persistent_key, ex=self.time_window * _RATE_TTL_MULTIPLIER)
            except Exception:
                pass

    def _resolve_key(self, identifier: str) -> str:
        """Резолвит sid в persistent key, сначала локально, потом из Redis."""
        local = self._sid_to_key.get(identifier)
        if local:
            return local

        r = self._redis()
        if r is not None:
            try:
                remote = r.get(f"qp:rl:sidmap:{identifier}")
                if remote:
                    self._sid_to_key[identifier] = remote
                    return remote
            except Exception:
                pass

        return identifier

    def is_allowed(self, identifier: str) -> bool:
        """Проверяет, можно ли принять ещё одно событие от источника."""
        key = self._resolve_key(identifier)
        now = time.time()

        r = self._redis()
        if r is not None:
            return self._is_allowed_redis(r, key, now)

        return self._is_allowed_local(key, now)

    def _is_allowed_local(self, key: str, now: float) -> bool:
        """Чисто in-memory проверка rate limit."""
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

    def _is_allowed_redis(self, r, key: str, now: float) -> bool:
        """Redis-backed проверка rate limit через sorted set."""
        redis_key = f"qp:rl:events:{key}"
        try:
            pipe = r.pipeline()
            pipe.zremrangebyscore(redis_key, 0, now - self.time_window)
            pipe.zcard(redis_key)
            pipe.zadd(redis_key, {str(now): now})
            pipe.expire(redis_key, self.time_window * _RATE_TTL_MULTIPLIER)
            results = pipe.execute()
            current_count = results[1]

            if current_count >= self.max_requests:
                logger.warning(
                    "Rate limit exceeded  identifier=%s  requests=%d/%d",
                    key,
                    current_count,
                    self.max_requests,
                )
                # Откатываем добавленный элемент
                try:
                    r.zrem(redis_key, str(now))
                except Exception:
                    pass
                return False

            return True
        except Exception:
            # Redis недоступен — fallback на in-memory
            return self._is_allowed_local(key, now)

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
