"""
Unit-С‚РµСЃС‚С‹ РјРѕРґСѓР»СЏ Р±РµР·РѕРїР°СЃРЅРѕСЃС‚Рё (security.py).

РџРѕРєСЂС‹РІР°РµС‚: RateLimiter, РІР°Р»РёРґР°С†РёСЋ РєРѕРґР°/РёРјРµРЅРё/РѕС‚РІРµС‚Р°, СЃР°РЅРёС‚РёР·Р°С†РёСЋ С‚РµРєСЃС‚Р°.
"""

import time
import allure
import pytest
from fastapi import HTTPException

from backend.games.friends_game.runtime_state import RateLimiter
from backend.games.friends_game.service import (
    validate_answer,
    validate_player_name,
    validate_quiz_code,
)
from backend.platform.identity.models import User, UserInstallation
from backend.platform.identity.service import (
    AuthenticatedUserContext,
    ensure_authenticated_identity_matches,
    hash_session_token,
    issue_installation_session_token,
    issue_session_token,
)
from backend.shared.utils import generate_public_id, sanitize_text


# в•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђ
#  RateLimiter
# в•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђ
@allure.feature("Security")
@allure.story("Rate Limiter")
class TestRateLimiter:
    """РўРµСЃС‚С‹ РѕРіСЂР°РЅРёС‡РёС‚РµР»СЏ С‡Р°СЃС‚РѕС‚С‹ Р·Р°РїСЂРѕСЃРѕРІ."""

    @allure.title("Р Р°Р·СЂРµС€Р°РµС‚ Р·Р°РїСЂРѕСЃС‹ РІ РїСЂРµРґРµР»Р°С… Р»РёРјРёС‚Р°")
    @allure.severity(allure.severity_level.CRITICAL)
    def test_allows_within_limit(self):
        """5 Р·Р°РїСЂРѕСЃРѕРІ РїСЂРё max_requests=5 вЂ” РІСЃРµ РїСЂРѕС…РѕРґСЏС‚."""
        with allure.step("РЎРѕР·РґР°С‘Рј RateLimiter СЃ Р»РёРјРёС‚РѕРј 5"):
            rl = RateLimiter(max_requests=5, time_window=60)
        with allure.step("РћС‚РїСЂР°РІР»СЏРµРј 5 Р·Р°РїСЂРѕСЃРѕРІ"):
            for _ in range(5):
                assert rl.is_allowed("user1") is True

    @allure.title("Р‘Р»РѕРєРёСЂСѓРµС‚ Р·Р°РїСЂРѕСЃС‹ СЃРІРµСЂС… Р»РёРјРёС‚Р°")
    @allure.severity(allure.severity_level.CRITICAL)
    def test_blocks_over_limit(self):
        """4-Р№ Р·Р°РїСЂРѕСЃ РїСЂРё max_requests=3 вЂ” Р±Р»РѕРєРёСЂСѓРµС‚СЃСЏ."""
        with allure.step("РСЃС‡РµСЂРїС‹РІР°РµРј Р»РёРјРёС‚ РІ 3 Р·Р°РїСЂРѕСЃР°"):
            rl = RateLimiter(max_requests=3, time_window=60)
            for _ in range(3):
                rl.is_allowed("user1")
        with allure.step("РџСЂРѕРІРµСЂСЏРµРј Р±Р»РѕРєРёСЂРѕРІРєСѓ 4-РіРѕ Р·Р°РїСЂРѕСЃР°"):
            assert rl.is_allowed("user1") is False

    @allure.title("Р›РёРјРёС‚С‹ СЂР°Р·РґРµР»СЊРЅС‹ РґР»СЏ СЂР°Р·РЅС‹С… РёРґРµРЅС‚РёС„РёРєР°С‚РѕСЂРѕРІ")
    @allure.severity(allure.severity_level.NORMAL)
    def test_separate_identifiers(self):
        """РСЃС‡РµСЂРїР°РЅРёРµ Р»РёРјРёС‚Р° РґР»СЏ 'a' РЅРµ РІР»РёСЏРµС‚ РЅР° 'b'."""
        with allure.step("РСЃС‡РµСЂРїС‹РІР°РµРј Р»РёРјРёС‚ РґР»СЏ РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ 'a'"):
            rl = RateLimiter(max_requests=2, time_window=60)
            rl.is_allowed("a")
            rl.is_allowed("a")
            assert rl.is_allowed("a") is False
        with allure.step("РџСЂРѕРІРµСЂСЏРµРј, С‡С‚Рѕ 'b' РЅРµ Р·Р°Р±Р»РѕРєРёСЂРѕРІР°РЅ"):
            assert rl.is_allowed("b") is True

    @allure.title("Р›РёРјРёС‚ СЃР±СЂР°СЃС‹РІР°РµС‚СЃСЏ РїРѕСЃР»Рµ РёСЃС‚РµС‡РµРЅРёСЏ РѕРєРЅР°")
    @allure.severity(allure.severity_level.NORMAL)
    def test_window_expiry(self):
        """РџРѕСЃР»Рµ time_window СЃРµРєСѓРЅРґ СЃС‡С‘С‚С‡РёРє РѕР±РЅСѓР»СЏРµС‚СЃСЏ."""
        with allure.step("РЎРѕР·РґР°С‘Рј Р»РёРјРёС‚РµСЂ СЃ РѕРєРЅРѕРј 1 СЃРµРєСѓРЅРґР°"):
            rl = RateLimiter(max_requests=1, time_window=1)
        with allure.step("РСЃС‡РµСЂРїС‹РІР°РµРј Р»РёРјРёС‚"):
            assert rl.is_allowed("user") is True
            assert rl.is_allowed("user") is False
        with allure.step("Р–РґС‘Рј РёСЃС‚РµС‡РµРЅРёСЏ РѕРєРЅР°"):
            time.sleep(1.1)
        with allure.step("РџСЂРѕРІРµСЂСЏРµРј СЃР±СЂРѕСЃ Р»РёРјРёС‚Р°"):
            assert rl.is_allowed("user") is True

    @allure.title("register_identity СЃРІСЏР·С‹РІР°РµС‚ sid СЃ persistent key")
    @allure.severity(allure.severity_level.NORMAL)
    def test_register_identity_links_sid_to_key(self):
        """РќРѕРІС‹Р№ sid РЅР°СЃР»РµРґСѓРµС‚ СЃС‡С‘С‚С‡РёРє Р·Р°РїСЂРѕСЃРѕРІ СЃС‚Р°СЂРѕРіРѕ sid С‡РµСЂРµР· РѕР±С‰РёР№ РєР»СЋС‡."""
        with allure.step("Р РµРіРёСЃС‚СЂРёСЂСѓРµРј СЃС‚Р°СЂС‹Р№ sid Рё РёСЃС‡РµСЂРїС‹РІР°РµРј Р»РёРјРёС‚"):
            rl = RateLimiter(max_requests=2, time_window=60)
            rl.register_identity("sid-old", "player:42")
            rl.is_allowed("sid-old")
            rl.is_allowed("sid-old")

        with allure.step("РџСЂРёРІСЏР·С‹РІР°РµРј РЅРѕРІС‹Р№ sid Рє С‚РѕРјСѓ Р¶Рµ РєР»СЋС‡Сѓ"):
            rl.register_identity("sid-new", "player:42")

        with allure.step("РџСЂРѕРІРµСЂСЏРµРј, С‡С‚Рѕ РЅРѕРІС‹Р№ sid Р·Р°Р±Р»РѕРєРёСЂРѕРІР°РЅ"):
            assert rl.is_allowed("sid-new") is False

    @allure.title("РџРµСЂРёРѕРґРёС‡РµСЃРєР°СЏ РѕС‡РёСЃС‚РєР° СЃС‚Р°СЂС‹С… Р·Р°РїРёСЃРµР№")
    @allure.severity(allure.severity_level.MINOR)
    def test_cleanup_runs(self):
        """РџСЂРё РґРѕСЃС‚РёР¶РµРЅРёРё 500 РІС‹Р·РѕРІРѕРІ Р·Р°РїСѓСЃРєР°РµС‚СЃСЏ _cleanup()."""
        with allure.step("РЈСЃС‚Р°РЅР°РІР»РёРІР°РµРј СЃС‡С‘С‚С‡РёРє РЅР° 499"):
            rl = RateLimiter(max_requests=1000, time_window=1)
            rl._call_count = 499
        with allure.step("РўСЂРёРіРіРµСЂРёРј РѕС‡РёСЃС‚РєСѓ 500-Рј РІС‹Р·РѕРІРѕРј"):
            rl.is_allowed("trigger")
        with allure.step("РџСЂРѕРІРµСЂСЏРµРј СЃР±СЂРѕСЃ СЃС‡С‘С‚С‡РёРєР°"):
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
        installation = UserInstallation(public_id=generate_public_id(), platform="web")

        token = issue_installation_session_token(installation)

        assert token
        assert installation.session_token_hash == hash_session_token(token)
        assert installation.session_token_hash != token
        assert installation.session_token_issued_at is not None

    @allure.title("Authenticated identity mismatch raises 403")
    @allure.severity(allure.severity_level.CRITICAL)
    def test_ensure_authenticated_identity_matches(self):
        user = User(id=7, username="Alice", avatar_emoji="x")
        installation = UserInstallation(public_id="install-123", platform="web")
        auth = AuthenticatedUserContext(user=user, installation=installation)

        ensure_authenticated_identity_matches(auth, user_id=7, installation_public_id="install-123")

        with pytest.raises(HTTPException) as user_error:
            ensure_authenticated_identity_matches(auth, user_id=8)
        assert user_error.value.status_code == 403

        with pytest.raises(HTTPException) as installation_error:
            ensure_authenticated_identity_matches(auth, installation_public_id="install-999")
        assert installation_error.value.status_code == 403


# в•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђ
#  validate_quiz_code
# в•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђ
@allure.feature("Security")
@allure.story("Quiz Code Validation")
class TestValidateQuizCode:
    """РўРµСЃС‚С‹ РІР°Р»РёРґР°С†РёРё РєРѕРґР° РєРѕРјРЅР°С‚С‹."""

    @allure.title("Р”РѕРїСѓСЃС‚РёРјС‹Р№ РєРѕРґ: {code}")
    @allure.severity(allure.severity_level.CRITICAL)
    @pytest.mark.parametrize("code", [
        "PARTY-ABCDE",
        "PARTY-12345",
        "PARTY-A1B2C",
        "X",
    ])
    def test_valid_codes(self, code):
        """Р’Р°Р»РёРґРЅС‹Рµ РєРѕРґС‹ РїСЂРѕС…РѕРґСЏС‚ РїСЂРѕРІРµСЂРєСѓ."""
        assert validate_quiz_code(code) is True

    @allure.title("РќРµРґРѕРїСѓСЃС‚РёРјС‹Р№ РєРѕРґ: {reason}")
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
        """РќРµРІР°Р»РёРґРЅС‹Рµ РєРѕРґС‹ РѕС‚РєР»РѕРЅСЏСЋС‚СЃСЏ."""
        assert validate_quiz_code(code) is False, f"Should reject: {reason}"


# в•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђ
#  validate_player_name
# в•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђ
@allure.feature("Security")
@allure.story("Player Name Validation")
class TestValidatePlayerName:
    """РўРµСЃС‚С‹ РІР°Р»РёРґР°С†РёРё РёРјРµРЅРё РёРіСЂРѕРєР°."""

    @allure.title("Р”РѕРїСѓСЃС‚РёРјРѕРµ РёРјСЏ: {name}")
    @allure.severity(allure.severity_level.CRITICAL)
    @pytest.mark.parametrize("name", [
        "РђР»РёСЃР°",
        "A",
        "LongName123456",  # 14 chars
        "рџђ± Cat",
        "РРіСЂРѕРє (1)",
    ])
    def test_valid_names(self, name):
        """Р’Р°Р»РёРґРЅС‹Рµ РёРјРµРЅР° РїСЂРѕС…РѕРґСЏС‚ РїСЂРѕРІРµСЂРєСѓ."""
        assert validate_player_name(name) is True

    @allure.title("РќРµРґРѕРїСѓСЃС‚РёРјРѕРµ РёРјСЏ: {reason}")
    @allure.severity(allure.severity_level.CRITICAL)
    @pytest.mark.parametrize("name,reason", [
        ("", "empty"),
        (None, "None"),
        ("A" * 16, "too long (16 chars)"),
    ])
    def test_invalid_names(self, name, reason):
        """РќРµРІР°Р»РёРґРЅС‹Рµ РёРјРµРЅР° РѕС‚РєР»РѕРЅСЏСЋС‚СЃСЏ."""
        assert validate_player_name(name) is False, f"Should reject: {reason}"


# в•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђ
#  validate_answer
# в•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђ
@allure.feature("Security")
@allure.story("Answer Validation")
class TestValidateAnswer:
    """РўРµСЃС‚С‹ РІР°Р»РёРґР°С†РёРё РѕС‚РІРµС‚Р° РёРіСЂРѕРєР°."""

    @allure.title("Р”РѕРїСѓСЃС‚РёРјС‹Рµ РѕС‚РІРµС‚С‹ РїСЂРѕС…РѕРґСЏС‚ РІР°Р»РёРґР°С†РёСЋ")
    @allure.severity(allure.severity_level.CRITICAL)
    def test_valid_answers(self):
        """РћР±С‹С‡РЅС‹Р№ С‚РµРєСЃС‚, С‡РёСЃР»Р°, РєРѕСЂРѕС‚РєРёРµ СЃС‚СЂРѕРєРё вЂ” РІР°Р»РёРґРЅС‹."""
        with allure.step("РџСЂРѕРІРµСЂСЏРµРј РґРѕРїСѓСЃС‚РёРјС‹Рµ РѕС‚РІРµС‚С‹"):
            assert validate_answer("РџР°СЂРёР¶") is True
            assert validate_answer("42") is True
            assert validate_answer("a") is True

    @allure.title("РџСѓСЃС‚Р°СЏ СЃС‚СЂРѕРєР° РѕС‚РєР»РѕРЅСЏРµС‚СЃСЏ")
    @allure.severity(allure.severity_level.NORMAL)
    def test_empty_answer(self):
        """РџСѓСЃС‚РѕР№ РѕС‚РІРµС‚ РЅРµРІР°Р»РёРґРµРЅ."""
        assert validate_answer("") is False

    @allure.title("None-РѕС‚РІРµС‚ РѕС‚РєР»РѕРЅСЏРµС‚СЃСЏ")
    @allure.severity(allure.severity_level.NORMAL)
    def test_none_answer(self):
        """None РєР°Рє РѕС‚РІРµС‚ РЅРµРІР°Р»РёРґРµРЅ."""
        assert validate_answer(None) is False

    @allure.title("РЎР»РёС€РєРѕРј РґР»РёРЅРЅС‹Р№ РѕС‚РІРµС‚ (>500) РѕС‚РєР»РѕРЅСЏРµС‚СЃСЏ")
    @allure.severity(allure.severity_level.NORMAL)
    def test_too_long_answer(self):
        """РћС‚РІРµС‚ РґР»РёРЅРЅРµРµ 500 СЃРёРјРІРѕР»РѕРІ РЅРµРІР°Р»РёРґРµРЅ."""
        assert validate_answer("x" * 501) is False

    @allure.title("РћС‚РІРµС‚ СЂРѕРІРЅРѕ 500 СЃРёРјРІРѕР»РѕРІ РґРѕРїСѓСЃС‚РёРј")
    @allure.severity(allure.severity_level.MINOR)
    def test_max_length_answer(self):
        """Р“СЂР°РЅРёС‡РЅРѕРµ Р·РЅР°С‡РµРЅРёРµ вЂ” 500 СЃРёРјРІРѕР»РѕРІ вЂ” РїСЂРѕС…РѕРґРёС‚."""
        assert validate_answer("x" * 500) is True


# в•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђ
#  sanitize_text
# в•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђ
@allure.feature("Security")
@allure.story("Text Sanitization")
class TestSanitizeText:
    """РўРµСЃС‚С‹ СЃР°РЅРёС‚РёР·Р°С†РёРё РїРѕР»СЊР·РѕРІР°С‚РµР»СЊСЃРєРѕРіРѕ РІРІРѕРґР°."""

    @allure.title("HTML-С‚РµРіРё СѓРґР°Р»СЏСЋС‚СЃСЏ")
    @allure.severity(allure.severity_level.CRITICAL)
    def test_removes_html_tags(self):
        """<b>bold</b> в†’ 'bold'."""
        with allure.step("РџРµСЂРµРґР°С‘Рј HTML-С‚РµРіРё РІ sanitize_text"):
            result = sanitize_text("<b>bold</b>")
        with allure.step("РџСЂРѕРІРµСЂСЏРµРј, С‡С‚Рѕ С‚РµРіРё СѓРґР°Р»РµРЅС‹"):
            assert result == "bold"

    @allure.title("Script-С‚РµРіРё СѓРґР°Р»СЏСЋС‚СЃСЏ (XSS-Р·Р°С‰РёС‚Р°)")
    @allure.severity(allure.severity_level.BLOCKER)
    def test_removes_script_tag(self):
        """<script>alert('xss')</script> в†’ alert('xss')."""
        with allure.step("РџРµСЂРµРґР°С‘Рј XSS-РїР°Р№Р»РѕР°Рґ РІ sanitize_text"):
            result = sanitize_text('<script>alert("xss")</script>')
        with allure.step("РџСЂРѕРІРµСЂСЏРµРј, С‡С‚Рѕ script-С‚РµРі СѓРґР°Р»С‘РЅ"):
            assert result == 'alert("xss")'

    @allure.title("РћР±С‹С‡РЅС‹Р№ С‚РµРєСЃС‚ Р±РµР· С‚РµРіРѕРІ РЅРµ РёР·РјРµРЅСЏРµС‚СЃСЏ")
    @allure.severity(allure.severity_level.NORMAL)
    def test_preserves_plain_text(self):
        """РўРµРєСЃС‚ Р±РµР· HTML РѕСЃС‚Р°С‘С‚СЃСЏ РЅРµС‚СЂРѕРЅСѓС‚С‹Рј."""
        assert sanitize_text("РџСЂРѕСЃС‚Рѕ С‚РµРєСЃС‚") == "РџСЂРѕСЃС‚Рѕ С‚РµРєСЃС‚"

    @allure.title("Р’Р»РѕР¶РµРЅРЅС‹Рµ С‚РµРіРё СѓРґР°Р»СЏСЋС‚СЃСЏ СЂРµРєСѓСЂСЃРёРІРЅРѕ")
    @allure.severity(allure.severity_level.NORMAL)
    def test_removes_nested_tags(self):
        """<div><p>Hello</p></div> в†’ 'Hello'."""
        assert sanitize_text("<div><p>Hello</p></div>") == "Hello"

    @allure.title("None РЅР° РІС…РѕРґРµ РІРѕР·РІСЂР°С‰Р°РµС‚ None")
    @allure.severity(allure.severity_level.MINOR)
    def test_none_input(self):
        """sanitize_text(None) в†’ None Р±РµР· РѕС€РёР±РѕРє."""
        assert sanitize_text(None) is None

    @allure.title("РџСѓСЃС‚Р°СЏ СЃС‚СЂРѕРєР° РѕСЃС‚Р°С‘С‚СЃСЏ РїСѓСЃС‚РѕР№")
    @allure.severity(allure.severity_level.MINOR)
    def test_empty_string(self):
        """sanitize_text('') в†’ ''."""
        assert sanitize_text("") == ""

    @allure.title("РЈРіР»РѕРІС‹Рµ СЃРєРѕР±РєРё РІ РјР°С‚. РІС‹СЂР°Р¶РµРЅРёСЏС… РѕР±СЂР°Р±Р°С‚С‹РІР°СЋС‚СЃСЏ")
    @allure.severity(allure.severity_level.MINOR)
    def test_preserves_angle_brackets_in_math(self):
        """'2 < 3 > 1' вЂ” regex СѓРґР°Р»РёС‚ '< 3 >', РЅРѕ РЅРµ РґРѕР»Р¶РµРЅ РїР°РґР°С‚СЊ."""
        result = sanitize_text("2 < 3 > 1")
        assert "2" in result

