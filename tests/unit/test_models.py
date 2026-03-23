"""
Unit-тесты ORM-моделей Quiz и Player.

Проверяет создание объектов, значения по умолчанию, связи,
JSON-поля и каскадное удаление.
"""

import allure
import pytest
from datetime import datetime

from backend.models import Quiz, Player


@allure.feature("Models")
@allure.story("Quiz Model")
class TestQuizModel:
    """Тесты модели Quiz."""

    @allure.title("Новая викторина получает корректные значения по умолчанию")
    @allure.severity(allure.severity_level.CRITICAL)
    def test_create_quiz_defaults(self, db_session):
        """Создаём Quiz без явных полей — проверяем status='waiting',
        current_question=0, total_questions=0 и NULL-поля."""
        with allure.step("Создаём викторину без явных полей"):
            quiz = Quiz(title="Моя викторина", code="PARTY-ABCDE")
            db_session.add(quiz)
            db_session.commit()

        with allure.step("Проверяем значения по умолчанию"):
            assert quiz.id is not None
            assert quiz.status == "waiting"
            assert quiz.current_question == 0
            assert quiz.total_questions == 0
            assert quiz.winner_id is None
            assert quiz.started_at is None
            assert quiz.finished_at is None

    @allure.title("Викторина сохраняет JSON-данные вопросов")
    @allure.severity(allure.severity_level.CRITICAL)
    def test_quiz_with_questions(self, db_session):
        """questions_data (JSON) корректно пишется и читается из БД."""
        with allure.step("Создаём викторину с JSON-вопросами"):
            questions = [{"text": "Q1", "type": "text", "correct": "A1"}]
            quiz = Quiz(
                title="Тест",
                code="PARTY-Q1234",
                questions_data=questions,
                total_questions=1,
            )
            db_session.add(quiz)
            db_session.commit()
            db_session.refresh(quiz)

        with allure.step("Проверяем, что JSON корректно сохранился"):
            assert quiz.questions_data == questions
            assert quiz.total_questions == 1

    @allure.title("Код комнаты уникален — дубликат вызывает ошибку")
    @allure.severity(allure.severity_level.CRITICAL)
    def test_quiz_code_uniqueness(self, db_session):
        """Два Quiz с одинаковым code — IntegrityError при коммите."""
        with allure.step("Создаём первую викторину с кодом PARTY-UNIQ1"):
            q1 = Quiz(title="A", code="PARTY-UNIQ1")
            db_session.add(q1)
            db_session.commit()

        with allure.step("Пытаемся создать вторую с тем же кодом"):
            q2 = Quiz(title="B", code="PARTY-UNIQ1")
            db_session.add(q2)

        with allure.step("Проверяем, что возникает ошибка уникальности"):
            with pytest.raises(Exception):
                db_session.commit()
            db_session.rollback()

    @allure.title("quiz.players возвращает привязанных игроков")
    @allure.severity(allure.severity_level.NORMAL)
    def test_quiz_players_relationship(self, sample_quiz, sample_player):
        """Связь quiz.players возвращает привязанных игроков."""
        with allure.step("Получаем список игроков через связь quiz.players"):
            names = [p.name for p in sample_quiz.players]

        with allure.step("Проверяем, что Игрок1 в списке"):
            assert len(sample_quiz.players) >= 1
            assert "Игрок1" in names

    @allure.title("Каскадное удаление викторины удаляет игроков")
    @allure.severity(allure.severity_level.CRITICAL)
    def test_quiz_cascade_delete(self, db_session):
        """Удаление викторины каскадно удаляет связанных игроков."""
        with allure.step("Создаём викторину с игроком"):
            quiz = Quiz(title="Del", code="PARTY-DEL01")
            db_session.add(quiz)
            db_session.commit()

            player = Player(name="Ghost", sid="s1", quiz_id=quiz.id)
            db_session.add(player)
            db_session.commit()
            player_id = player.id

        with allure.step("Удаляем викторину"):
            db_session.delete(quiz)
            db_session.commit()

        with allure.step("Проверяем, что игрок тоже удалён"):
            assert db_session.get(Player, player_id) is None


@allure.feature("Models")
@allure.story("Player Model")
class TestPlayerModel:
    """Тесты модели Player."""

    @allure.title("Новый игрок получает корректные значения по умолчанию")
    @allure.severity(allure.severity_level.CRITICAL)
    def test_create_player_defaults(self, db_session, sample_quiz):
        """Player без явных полей — score=0, is_host=False, emoji=None."""
        with allure.step("Создаём игрока без явных полей"):
            p = Player(name="Тест", sid="sid-x", quiz_id=sample_quiz.id)
            db_session.add(p)
            db_session.commit()

        with allure.step("Проверяем значения по умолчанию"):
            assert p.id is not None
            assert p.score == 0
            assert p.is_host is False
            assert p.emoji is None
            assert p.device is None

    @allure.title("answers_history корректно сохраняет и читает JSON")
    @allure.severity(allure.severity_level.CRITICAL)
    def test_player_answers_history_json(self, db_session, sample_quiz):
        """JSON-поле answers_history корректно сохраняет и читает данные."""
        with allure.step("Создаём игрока с answers_history"):
            p = Player(
                name="JSON",
                sid="sid-json",
                quiz_id=sample_quiz.id,
                answers_history={"1": "Париж", "2": "4"},
            )
            db_session.add(p)
            db_session.commit()
            db_session.refresh(p)

        with allure.step("Проверяем, что JSON-данные читаются корректно"):
            assert p.answers_history["1"] == "Париж"
            assert p.answers_history["2"] == "4"

    @allure.title("scores_history хранит баллы за каждый вопрос")
    @allure.severity(allure.severity_level.NORMAL)
    def test_player_scores_history(self, db_session, sample_quiz):
        """Сумма scores_history совпадает с общим score."""
        with allure.step("Создаём игрока с scores_history"):
            p = Player(
                name="Scorer",
                sid="sid-sc",
                quiz_id=sample_quiz.id,
                scores_history={"1": 1, "2": 0, "3": 1},
                score=2,
            )
            db_session.add(p)
            db_session.commit()

        with allure.step("Проверяем, что сумма баллов совпадает со score"):
            assert sum(p.scores_history.values()) == p.score

    @allure.title("Информация об устройстве сохраняется")
    @allure.severity(allure.severity_level.MINOR)
    def test_player_device_info(self, db_session, sample_quiz):
        """Поля device, browser, browser_version, device_model записываются корректно."""
        with allure.step("Создаём игрока с данными устройства"):
            p = Player(
                name="Mobile",
                sid="sid-mob",
                quiz_id=sample_quiz.id,
                device="mobile",
                browser="Chrome",
                browser_version="124",
                device_model="Samsung SM-G991B",
            )
            db_session.add(p)
            db_session.commit()

        with allure.step("Проверяем данные устройства"):
            assert p.device == "mobile"
            assert p.browser == "Chrome"
            assert p.browser_version == "124"
            assert p.device_model == "Samsung SM-G991B"

    @allure.title("player.quiz возвращает родительскую викторину")
    @allure.severity(allure.severity_level.NORMAL)
    def test_player_quiz_relationship(self, sample_player, sample_quiz):
        """Обратная связь player.quiz возвращает родительскую викторину."""
        with allure.step("Проверяем обратную связь player → quiz"):
            assert sample_player.quiz.id == sample_quiz.id
            assert sample_player.quiz.code == "PARTY-TEST1"

    @allure.title("answer_times корректно хранит время ответов")
    @allure.severity(allure.severity_level.NORMAL)
    def test_player_answer_times(self, db_session, sample_quiz):
        """JSON-поле answer_times хранит float-значения времени."""
        with allure.step("Создаём игрока с answer_times"):
            p = Player(
                name="Speedy",
                sid="sid-sp",
                quiz_id=sample_quiz.id,
                answer_times={"1": 3.2, "2": 1.5},
            )
            db_session.add(p)
            db_session.commit()
            db_session.refresh(p)

        with allure.step("Проверяем, что время ответов сохранилось"):
            assert p.answer_times["1"] == 3.2
            assert p.answer_times["2"] == 1.5

    @allure.title("Хост имеет is_host=True")
    @allure.severity(allure.severity_level.NORMAL)
    def test_host_flag(self, sample_host):
        """Фикстура sample_host создаёт игрока с is_host=True."""
        with allure.step("Проверяем флаг is_host у хоста"):
            assert sample_host.is_host is True

    @allure.title("Несколько игроков могут быть в одной викторине")
    @allure.severity(allure.severity_level.NORMAL)
    def test_multiple_players_same_quiz(self, db_session, sample_quiz):
        """Несколько игроков могут быть в одной викторине."""
        with allure.step("Добавляем 5 игроков в викторину"):
            for i in range(5):
                db_session.add(Player(
                    name=f"P{i}", sid=f"sid-{i}", quiz_id=sample_quiz.id
                ))
            db_session.commit()

        with allure.step("Проверяем количество игроков"):
            count = db_session.query(Player).filter(
                Player.quiz_id == sample_quiz.id
            ).count()
            assert count >= 5
