"""Эфемерное runtime-хранилище активных socket-подключений."""

from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass


@dataclass
class ActiveConnection:
    """Связка активного sid с участником и игровой сессией."""

    sid: str
    participant_id: int
    quiz_id: int


class ConnectionRegistry:
    def __init__(self) -> None:
        """Создаёт пустые индексы для быстрых lookup-операций по sid и participant."""
        self._sid_to_connection: dict[str, ActiveConnection] = {}
        self._participant_to_sid: dict[int, str] = {}
        self._quiz_to_participants: dict[int, set[int]] = defaultdict(set)

    def bind(self, sid: str, participant_id: int, quiz_id: int) -> None:
        """Привязывает текущий sid к участнику и при необходимости вытесняет старый sid."""
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
        """Возвращает множество id участников, которые сейчас онлайн в конкретной игре."""
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


connection_registry = ConnectionRegistry()
