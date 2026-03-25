"""
Unit-тесты Pydantic-схем (schemas.py).

Покрывает валидацию QuestionSchema, QuizCreate, QuizResponse — 
допустимые/недопустимые значения, граничные случаи.
"""

import allure
import pytest
from pydantic import ValidationError
from datetime import datetime

from backend.schemas import QuestionSchema, QuizCreate, QuizResponse, UserCreate, UserResponse, UserTouch


# ═══════════════════════════════════════════════════════════════════════
#  QuestionSchema
# ═══════════════════════════════════════════════════════════════════════
@allure.feature("Schemas")
@allure.story("QuestionSchema")
class TestQuestionSchema:
    """Тесты валидации схемы вопроса."""

    @allure.title("Валидный текстовый вопрос")
    @allure.severity(allure.severity_level.CRITICAL)
    def test_valid_text_question(self):
        """type='text' без options — корректная схема."""
        with allure.step("Создаём текстовый вопрос"):
            q = QuestionSchema(text="Сколько?", type="text", correct="5")
        with allure.step("Проверяем поля"):
            assert q.text == "Сколько?"
            assert q.type == "text"
            assert q.options is None

    @allure.title("Валидный вопрос с вариантами ответов")
    @allure.severity(allure.severity_level.CRITICAL)
    def test_valid_options_question(self):
        """type='options' с массивом вариантов — корректная схема."""
        with allure.step("Создаём вопрос с вариантами ответов"):
            q = QuestionSchema(
                text="Столица?",
                type="options",
                correct="Париж",
                options=["Лондон", "Париж", "Берлин"],
            )
        with allure.step("Проверяем количество вариантов"):
            assert len(q.options) == 3

    @allure.title("Невалидный тип вопроса отклоняется")
    @allure.severity(allure.severity_level.CRITICAL)
    def test_invalid_type(self):
        """type='multi' не входит в допустимые значения."""
        with allure.step("Пытаемся создать вопрос с невалидным type='multi'"):
            with pytest.raises(ValidationError, match="type"):
                QuestionSchema(text="Q", type="multi", correct="A")

    @allure.title("Пустой текст вопроса отклоняется")
    @allure.severity(allure.severity_level.NORMAL)
    def test_empty_text_rejected(self):
        """Пустая строка в text невалидна (min_length=1)."""
        with pytest.raises(ValidationError):
            QuestionSchema(text="", type="text", correct="A")

    @allure.title("Слишком длинный текст вопроса (>500) отклоняется")
    @allure.severity(allure.severity_level.NORMAL)
    def test_text_too_long(self):
        """text длиннее 500 символов невалиден."""
        with pytest.raises(ValidationError):
            QuestionSchema(text="x" * 501, type="text", correct="A")

    @allure.title("Слишком длинный правильный ответ (>200) отклоняется")
    @allure.severity(allure.severity_level.NORMAL)
    def test_correct_too_long(self):
        """correct длиннее 200 символов невалиден."""
        with pytest.raises(ValidationError):
            QuestionSchema(text="Q", type="text", correct="x" * 201)

    @allure.title("Слишком много вариантов ответа (>6) отклоняется")
    @allure.severity(allure.severity_level.NORMAL)
    def test_too_many_options(self):
        """Более 6 вариантов невалидно."""
        with pytest.raises(ValidationError, match="6"):
            QuestionSchema(
                text="Q", type="options", correct="A",
                options=["1", "2", "3", "4", "5", "6", "7"],
            )

    @allure.title("Слишком мало вариантов ответа (<2) отклоняется")
    @allure.severity(allure.severity_level.NORMAL)
    def test_too_few_options(self):
        """Менее 2 вариантов невалидно."""
        with pytest.raises(ValidationError, match="2"):
            QuestionSchema(
                text="Q", type="options", correct="A",
                options=["A"],
            )

    @allure.title("Ровно 2 варианта ответа допустимо")
    @allure.severity(allure.severity_level.MINOR)
    def test_min_options_ok(self):
        """Граничное значение — 2 варианта — проходит."""
        q = QuestionSchema(
            text="Q", type="options", correct="A",
            options=["A", "B"],
        )
        assert len(q.options) == 2

    @allure.title("Ровно 6 вариантов ответа допустимо")
    @allure.severity(allure.severity_level.MINOR)
    def test_max_options_ok(self):
        """Граничное значение — 6 вариантов — проходит."""
        q = QuestionSchema(
            text="Q", type="options", correct="A",
            options=["A", "B", "C", "D", "E", "F"],
        )
        assert len(q.options) == 6

    @allure.title("Слишком длинный вариант ответа (>200) отклоняется")
    @allure.severity(allure.severity_level.NORMAL)
    def test_option_too_long(self):
        """Вариант длиннее 200 символов невалиден."""
        with pytest.raises(ValidationError, match="200"):
            QuestionSchema(
                text="Q", type="options", correct="A",
                options=["A", "x" * 201],
            )

    @allure.title("options=None допустим для текстовых вопросов")
    @allure.severity(allure.severity_level.MINOR)
    def test_none_options_allowed(self):
        """Для текстовых вопросов options может быть None."""
        q = QuestionSchema(text="Q", type="text", correct="A", options=None)
        assert q.options is None


# ═══════════════════════════════════════════════════════════════════════
#  QuizCreate
# ═══════════════════════════════════════════════════════════════════════
@allure.feature("Schemas")
@allure.story("QuizCreate")
class TestQuizCreate:
    """Тесты валидации схемы создания викторины."""

    @allure.title("Валидная викторина с вопросами")
    @allure.severity(allure.severity_level.CRITICAL)
    def test_valid_quiz(self):
        """Корректный title + список вопросов — валидная схема."""
        with allure.step("Создаём валидную викторину"):
            qc = QuizCreate(
                title="Моя викторина",
                questions=[
                    {"text": "Q1", "type": "text", "correct": "A1"},
                    {"text": "Q2", "type": "options", "correct": "B", "options": ["A", "B"]},
                ],
            )
        with allure.step("Проверяем поля"):
            assert qc.title == "Моя викторина"
            assert len(qc.questions) == 2

    @allure.title("Пустой title отклоняется")
    @allure.severity(allure.severity_level.CRITICAL)
    def test_empty_title_rejected(self):
        """Пустая строка в title невалидна."""
        with pytest.raises(ValidationError):
            QuizCreate(
                title="",
                questions=[{"text": "Q", "type": "text", "correct": "A"}],
            )

    @allure.title("Слишком длинный title (>100) отклоняется")
    @allure.severity(allure.severity_level.NORMAL)
    def test_title_too_long(self):
        """title длиннее 100 символов невалиден."""
        with pytest.raises(ValidationError):
            QuizCreate(
                title="x" * 101,
                questions=[{"text": "Q", "type": "text", "correct": "A"}],
            )

    @allure.title("Пустой список вопросов отклоняется")
    @allure.severity(allure.severity_level.CRITICAL)
    def test_empty_questions_rejected(self):
        """questions=[] невалиден (min_length=1)."""
        with pytest.raises(ValidationError):
            QuizCreate(title="T", questions=[])

    @allure.title("Более 50 вопросов отклоняется")
    @allure.severity(allure.severity_level.NORMAL)
    def test_too_many_questions(self):
        """Более 50 вопросов невалидно."""
        questions = [{"text": f"Q{i}", "type": "text", "correct": "A"} for i in range(51)]
        with pytest.raises(ValidationError):
            QuizCreate(title="Big", questions=questions)

    @allure.title("Ровно 50 вопросов допустимо")
    @allure.severity(allure.severity_level.MINOR)
    def test_max_questions_ok(self):
        """Граничное значение — 50 вопросов — проходит."""
        questions = [{"text": f"Q{i}", "type": "text", "correct": "A"} for i in range(50)]
        qc = QuizCreate(title="Max", questions=questions)
        assert len(qc.questions) == 50


# ═══════════════════════════════════════════════════════════════════════
#  QuizResponse
# ═══════════════════════════════════════════════════════════════════════
@allure.feature("Schemas")
@allure.story("QuizResponse")
class TestQuizResponse:
    """Тесты схемы ответа API."""

    @allure.title("Создание QuizResponse из ORM-атрибутов")
    @allure.severity(allure.severity_level.CRITICAL)
    def test_from_attributes(self):
        """QuizResponse.Config.from_attributes = True позволяет создание из ORM."""

        class FakeQuiz:
            id = 1
            code = "PARTY-12345"
            title = "Test"
            status = "waiting"
            created_at = None
            started_at = None
            finished_at = None
            winner_id = None

        with allure.step("Создаём QuizResponse из ORM-объекта"):
            resp = QuizResponse.model_validate(FakeQuiz())
        with allure.step("Проверяем поля ответа"):
            assert resp.code == "PARTY-12345"
            assert resp.status == "waiting"

    @allure.title("Необязательные поля по умолчанию None")
    @allure.severity(allure.severity_level.MINOR)
    def test_optional_fields(self):
        """created_at, started_at и т.д. — None по умолчанию."""
        resp = QuizResponse(
            id=1, code="PARTY-X", title="T", status="playing",
        )
        assert resp.created_at is None
        assert resp.winner_id is None


@allure.feature("Schemas")
@allure.story("User Schemas")
class TestUserSchemas:
    """Тесты схем профиля пользователя."""

    @allure.title("Валидный профиль пользователя проходит валидацию")
    @allure.severity(allure.severity_level.CRITICAL)
    def test_valid_user_create(self):
        payload = UserCreate(
            username="Алиса",
            avatar_emoji="🐱",
            device_platform="ios",
            device_brand="Apple",
        )
        assert payload.username == "Алиса"
        assert payload.avatar_emoji == "🐱"

    @allure.title("Пустое имя пользователя отклоняется")
    @allure.severity(allure.severity_level.NORMAL)
    def test_user_create_rejects_blank_username(self):
        with pytest.raises(ValidationError):
            UserCreate(username="   ", avatar_emoji="🐱")

    @allure.title("Недоступный эмодзи-аватар отклоняется")
    @allure.severity(allure.severity_level.NORMAL)
    def test_user_create_rejects_unknown_avatar(self):
        with pytest.raises(ValidationError):
            UserCreate(username="Алиса", avatar_emoji="🤖")

    @allure.title("UserResponse собирается из ORM-атрибутов")
    @allure.severity(allure.severity_level.CRITICAL)
    def test_user_response_from_attributes(self):
        class FakeUser:
            id = 7
            username = "Макс"
            avatar_emoji = "🐸"
            device_platform = "android"
            device_brand = "Samsung"
            created_at = datetime.now()
            last_login_at = datetime.now()

        resp = UserResponse.model_validate(FakeUser())
        assert resp.id == 7
        assert resp.username == "Макс"

    @allure.title("UserTouch допускает частичное обновление устройства")
    @allure.severity(allure.severity_level.MINOR)
    def test_user_touch_optional(self):
        touch = UserTouch(device_brand="Google")
        assert touch.device_brand == "Google"
        assert touch.device_platform is None
