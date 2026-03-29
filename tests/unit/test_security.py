"""
Unit-тесты модуля безопасности (security.py).

Покрывает: RateLimiter, валидацию кода/имени/ответа, санитизацию текста.
"""

import time
import allure
import pytest
from fastapi import HTTPException

from backend import models
from backend.security import (
    AuthenticatedUserContext,
    RateLimiter,
    ensure_authenticated_identity_matches,
    hash_session_token,
    issue_installation_session_token,
    issue_session_token,
    validate_quiz_code,
    validate_player_name,
    validate_answer,
    sanitize_text,
)


# ═══════════════════════════════════════════════════════════════════════
#  RateLimiter
# ═══════════════════════════════════════════════════════════════════════
@allure.feature("Security")
@allure.story("Rate Limiter")
class TestRateLimiter:
    """Тесты ограничителя частоты запросов."""

    @allure.title("Разрешает запросы в пределах лимита")
    @allure.severity(allure.severity_level.CRITICAL)
    def test_allows_within_limit(self):
        """5 запросов при max_requests=5 — все проходят."""
        with allure.step("Создаём RateLimiter с лимитом 5"):
            rl = RateLimiter(max_requests=5, time_window=60)
        with allure.step("Отправляем 5 запросов"):
            for _ in range(5):
                assert rl.is_allowed("user1") is True

    @allure.title("Блокирует запросы сверх лимита")
    @allure.severity(allure.severity_level.CRITICAL)
    def test_blocks_over_limit(self):
        """4-й запрос при max_requests=3 — блокируется."""
        with allure.step("Исчерпываем лимит в 3 запроса"):
            rl = RateLimiter(max_requests=3, time_window=60)
            for _ in range(3):
                rl.is_allowed("user1")
        with allure.step("Проверяем блокировку 4-го запроса"):
            assert rl.is_allowed("user1") is False

    @allure.title("Лимиты раздельны для разных идентификаторов")
    @allure.severity(allure.severity_level.NORMAL)
    def test_separate_identifiers(self):
        """Исчерпание лимита для 'a' не влияет на 'b'."""
        with allure.step("Исчерпываем лимит для пользователя 'a'"):
            rl = RateLimiter(max_requests=2, time_window=60)
            rl.is_allowed("a")
            rl.is_allowed("a")
            assert rl.is_allowed("a") is False
        with allure.step("Проверяем, что 'b' не заблокирован"):
            assert rl.is_allowed("b") is True

    @allure.title("Лимит сбрасывается после истечения окна")
    @allure.severity(allure.severity_level.NORMAL)
    def test_window_expiry(self):
        """После time_window секунд счётчик обнуляется."""
        with allure.step("Создаём лимитер с окном 1 секунда"):
            rl = RateLimiter(max_requests=1, time_window=1)
        with allure.step("Исчерпываем лимит"):
            assert rl.is_allowed("user") is True
            assert rl.is_allowed("user") is False
        with allure.step("Ждём истечения окна"):
            time.sleep(1.1)
        with allure.step("Проверяем сброс лимита"):
            assert rl.is_allowed("user") is True

    @allure.title("register_identity связывает sid с persistent key")
    @allure.severity(allure.severity_level.NORMAL)
    def test_register_identity_links_sid_to_key(self):
        """Новый sid наследует счётчик запросов старого sid через общий ключ."""
        with allure.step("Регистрируем старый sid и исчерпываем лимит"):
            rl = RateLimiter(max_requests=2, time_window=60)
            rl.register_identity("sid-old", "player:42")
            rl.is_allowed("sid-old")
            rl.is_allowed("sid-old")

        with allure.step("Привязываем новый sid к тому же ключу"):
            rl.register_identity("sid-new", "player:42")

        with allure.step("Проверяем, что новый sid заблокирован"):
            assert rl.is_allowed("sid-new") is False

    @allure.title("Периодическая очистка старых записей")
    @allure.severity(allure.severity_level.MINOR)
    def test_cleanup_runs(self):
        """При достижении 500 вызовов запускается _cleanup()."""
        with allure.step("Устанавливаем счётчик на 499"):
            rl = RateLimiter(max_requests=1000, time_window=1)
            rl._call_count = 499
        with allure.step("Триггерим очистку 500-м вызовом"):
            rl.is_allowed("trigger")
        with allure.step("Проверяем сброс счётчика"):
            assert rl._call_count == 0


@allure.feature("Security")
@allure.story("Profile Sessions")
class TestProfileSessions:
    @allure.title("Session token hashing is deterministic and opaque")
    @allure.severity(allure.severity_level.CRITICAL)
    def test_hash_session_token(self):
        token = issue_session_token()

        assert hash_session_token(token) == hash_session_token(token)
        assert hash_session_token(token) != token

    @allure.title("Installation session token is stored as a hash")
    @allure.severity(allure.severity_level.CRITICAL)
    def test_issue_installation_session_token_stores_hash(self):
        installation = models.UserInstallation(public_id=models._public_id(), platform="web")

        token = issue_installation_session_token(installation)

        assert token
        assert installation.session_token_hash == hash_session_token(token)
        assert installation.session_token_hash != token
        assert installation.session_token_issued_at is not None

    @allure.title("Authenticated identity mismatch raises 403")
    @allure.severity(allure.severity_level.CRITICAL)
    def test_ensure_authenticated_identity_matches(self):
        user = models.User(id=7, username="Alice", avatar_emoji="x")
        installation = models.UserInstallation(public_id="install-123", platform="web")
        auth = AuthenticatedUserContext(user=user, installation=installation)

        ensure_authenticated_identity_matches(auth, user_id=7, installation_public_id="install-123")

        with pytest.raises(HTTPException) as user_error:
            ensure_authenticated_identity_matches(auth, user_id=8)
        assert user_error.value.status_code == 403

        with pytest.raises(HTTPException) as installation_error:
            ensure_authenticated_identity_matches(auth, installation_public_id="install-999")
        assert installation_error.value.status_code == 403


# ═══════════════════════════════════════════════════════════════════════
#  validate_quiz_code
# ═══════════════════════════════════════════════════════════════════════
@allure.feature("Security")
@allure.story("Quiz Code Validation")
class TestValidateQuizCode:
    """Тесты валидации кода комнаты."""

    @allure.title("Допустимый код: {code}")
    @allure.severity(allure.severity_level.CRITICAL)
    @pytest.mark.parametrize("code", [
        "PARTY-ABCDE",
        "PARTY-12345",
        "PARTY-A1B2C",
        "X",
    ])
    def test_valid_codes(self, code):
        """Валидные коды проходят проверку."""
        assert validate_quiz_code(code) is True

    @allure.title("Недопустимый код: {reason}")
    @allure.severity(allure.severity_level.CRITICAL)
    @pytest.mark.parametrize("code,reason", [
        ("", "empty"),
        (None, "None"),
        ("A" * 21, "too long"),
        ("PARTY ABCDE", "space"),
        ("PARTY_ABCDE", "underscore"),
        ("<script>", "html tag chars"),
    ])
    def test_invalid_codes(self, code, reason):
        """Невалидные коды отклоняются."""
        assert validate_quiz_code(code) is False, f"Should reject: {reason}"


# ═══════════════════════════════════════════════════════════════════════
#  validate_player_name
# ═══════════════════════════════════════════════════════════════════════
@allure.feature("Security")
@allure.story("Player Name Validation")
class TestValidatePlayerName:
    """Тесты валидации имени игрока."""

    @allure.title("Допустимое имя: {name}")
    @allure.severity(allure.severity_level.CRITICAL)
    @pytest.mark.parametrize("name", [
        "Алиса",
        "A",
        "LongName123456",  # 14 chars
        "🐱 Cat",
        "Игрок (1)",
    ])
    def test_valid_names(self, name):
        """Валидные имена проходят проверку."""
        assert validate_player_name(name) is True

    @allure.title("Недопустимое имя: {reason}")
    @allure.severity(allure.severity_level.CRITICAL)
    @pytest.mark.parametrize("name,reason", [
        ("", "empty"),
        (None, "None"),
        ("A" * 16, "too long (16 chars)"),
    ])
    def test_invalid_names(self, name, reason):
        """Невалидные имена отклоняются."""
        assert validate_player_name(name) is False, f"Should reject: {reason}"


# ═══════════════════════════════════════════════════════════════════════
#  validate_answer
# ═══════════════════════════════════════════════════════════════════════
@allure.feature("Security")
@allure.story("Answer Validation")
class TestValidateAnswer:
    """Тесты валидации ответа игрока."""

    @allure.title("Допустимые ответы проходят валидацию")
    @allure.severity(allure.severity_level.CRITICAL)
    def test_valid_answers(self):
        """Обычный текст, числа, короткие строки — валидны."""
        with allure.step("Проверяем допустимые ответы"):
            assert validate_answer("Париж") is True
            assert validate_answer("42") is True
            assert validate_answer("a") is True

    @allure.title("Пустая строка отклоняется")
    @allure.severity(allure.severity_level.NORMAL)
    def test_empty_answer(self):
        """Пустой ответ невалиден."""
        assert validate_answer("") is False

    @allure.title("None-ответ отклоняется")
    @allure.severity(allure.severity_level.NORMAL)
    def test_none_answer(self):
        """None как ответ невалиден."""
        assert validate_answer(None) is False

    @allure.title("Слишком длинный ответ (>500) отклоняется")
    @allure.severity(allure.severity_level.NORMAL)
    def test_too_long_answer(self):
        """Ответ длиннее 500 символов невалиден."""
        assert validate_answer("x" * 501) is False

    @allure.title("Ответ ровно 500 символов допустим")
    @allure.severity(allure.severity_level.MINOR)
    def test_max_length_answer(self):
        """Граничное значение — 500 символов — проходит."""
        assert validate_answer("x" * 500) is True


# ═══════════════════════════════════════════════════════════════════════
#  sanitize_text
# ═══════════════════════════════════════════════════════════════════════
@allure.feature("Security")
@allure.story("Text Sanitization")
class TestSanitizeText:
    """Тесты санитизации пользовательского ввода."""

    @allure.title("HTML-теги удаляются")
    @allure.severity(allure.severity_level.CRITICAL)
    def test_removes_html_tags(self):
        """<b>bold</b> → 'bold'."""
        with allure.step("Передаём HTML-теги в sanitize_text"):
            result = sanitize_text("<b>bold</b>")
        with allure.step("Проверяем, что теги удалены"):
            assert result == "bold"

    @allure.title("Script-теги удаляются (XSS-защита)")
    @allure.severity(allure.severity_level.BLOCKER)
    def test_removes_script_tag(self):
        """<script>alert('xss')</script> → alert('xss')."""
        with allure.step("Передаём XSS-пайлоад в sanitize_text"):
            result = sanitize_text('<script>alert("xss")</script>')
        with allure.step("Проверяем, что script-тег удалён"):
            assert result == 'alert("xss")'

    @allure.title("Обычный текст без тегов не изменяется")
    @allure.severity(allure.severity_level.NORMAL)
    def test_preserves_plain_text(self):
        """Текст без HTML остаётся нетронутым."""
        assert sanitize_text("Просто текст") == "Просто текст"

    @allure.title("Вложенные теги удаляются рекурсивно")
    @allure.severity(allure.severity_level.NORMAL)
    def test_removes_nested_tags(self):
        """<div><p>Hello</p></div> → 'Hello'."""
        assert sanitize_text("<div><p>Hello</p></div>") == "Hello"

    @allure.title("None на входе возвращает None")
    @allure.severity(allure.severity_level.MINOR)
    def test_none_input(self):
        """sanitize_text(None) → None без ошибок."""
        assert sanitize_text(None) is None

    @allure.title("Пустая строка остаётся пустой")
    @allure.severity(allure.severity_level.MINOR)
    def test_empty_string(self):
        """sanitize_text('') → ''."""
        assert sanitize_text("") == ""

    @allure.title("Угловые скобки в мат. выражениях обрабатываются")
    @allure.severity(allure.severity_level.MINOR)
    def test_preserves_angle_brackets_in_math(self):
        """'2 < 3 > 1' — regex удалит '< 3 >', но не должен падать."""
        result = sanitize_text("2 < 3 > 1")
        assert "2" in result
